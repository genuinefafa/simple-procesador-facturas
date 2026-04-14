/**
 * Extractor de códigos QR para comprobantes electrónicos AFIP/ARCA
 *
 * Los comprobantes electrónicos de AFIP incluyen un código QR que contiene
 * datos estructurados en formato JSON codificado en Base64.
 *
 * URLs soportadas:
 * - https://www.afip.gob.ar/fe/qr/?p={BASE64_JSON}
 * - https://servicioscf.afip.gob.ar/publico/comprobantes/cae.aspx?p={BASE64_JSON}
 * - https://serviciosweb.afip.gob.ar/genericos/comprobantes/cae.aspx?p={BASE64_JSON}
 *
 * Soporta: JPG, PNG, TIFF, WEBP, HEIC, PDF
 *
 * Usa zxing-wasm (port WASM de ZXing, el decoder de Google/Android) que maneja
 * binarización adaptativa local, finder patterns parcialmente degradados,
 * y Reed-Solomon completo — ideal para tickets térmicos escaneados.
 */

import { readBarcodes } from 'zxing-wasm/reader';
import sharp from 'sharp';
import { existsSync, readFileSync } from 'fs';
import { extname } from 'path';
import type { ExtractionResult } from '@shared/types';
import { pdf } from 'pdf-to-img';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - no type definitions available for heic-convert
import convert from 'heic-convert';
import type { AFIPQRData, QRDetectionResult, AFIPUrlParseResult } from './qr-extractor.types';

// URLs válidas de AFIP/ARCA QR (todos los formatos oficiales)
const AFIP_QR_URL_PATTERNS = [
  'https://www.afip.gob.ar/fe/qr/',
  'https://servicioscf.afip.gob.ar/publico/comprobantes/',
  'https://serviciosweb.afip.gob.ar/genericos/comprobantes/',
  'https://www.arca.gob.ar/fe/qr/', // Nuevo formato ARCA 2024+
];

// Extensiones de imagen soportadas
const SUPPORTED_IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.tif',
  '.tiff',
  '.webp',
  '.heic',
  '.heif',
];

// Scale para renderizar PDFs. ZXing no necesita multi-scale (a diferencia de jsQR)
// porque su binarización adaptativa local maneja diferentes tamaños de módulos.
// 3.0 es un buen balance entre resolución y performance.
const PDF_RENDER_SCALE = 3.0;

/**
 * Formatea CUIT de número a string con guiones (XX-XXXXXXXX-X)
 */
function formatCuit(cuit: number): string {
  const cuitStr = cuit.toString().padStart(11, '0');
  return `${cuitStr.slice(0, 2)}-${cuitStr.slice(2, 10)}-${cuitStr.slice(10)}`;
}

/**
 * Parsea el JSON del QR de AFIP, tolerando valores vacíos mal formados.
 *
 * ARCA a veces emite JSON inválido con valores faltantes, por ejemplo cuando
 * el receptor es consumidor final y no hay DNI:
 *   {"tipoDocRec":99,"nroDocRec":,"tipoCodAut":"E"}
 *
 * En ese caso sustituimos los valores vacíos por `null` antes de reintentar
 * el parseo. El reemplazo sólo aplica después de una clave (patrón `":`)
 * seguido inmediatamente por `,`, `}` o `]`, que es un estado imposible en
 * JSON válido — no rompe QRs bien formados.
 *
 * Exportado para testing.
 */
export function parseAFIPJson(jsonStr: string): AFIPQRData {
  try {
    return JSON.parse(jsonStr) as AFIPQRData;
  } catch {
    const sanitized = jsonStr.replace(/"\s*:\s*(?=[,}\]])/g, '":null');
    return JSON.parse(sanitized) as AFIPQRData;
  }
}

export class QRExtractor {
  /**
   * Verifica si un archivo es una imagen soportada
   */
  static isImageFile(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase();
    return SUPPORTED_IMAGE_EXTENSIONS.includes(ext);
  }

  /**
   * Convierte HEIC/HEIF a JPEG
   */
  private async convertHeicToJpeg(filePath: string): Promise<Buffer> {
    console.info(`   🔄 Convirtiendo HEIC a JPEG...`);
    const inputBuffer = readFileSync(filePath);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const outputBuffer = (await convert({
      buffer: inputBuffer,
      format: 'JPEG',
      quality: 1,
    })) as ArrayBuffer;

    console.info(`   ✅ HEIC convertido a JPEG (${outputBuffer.byteLength} bytes)`);
    return Buffer.from(outputBuffer);
  }

  /**
   * Detecta y decodifica QR code de un archivo.
   * Para PDFs, itera todas las páginas buscando un QR de AFIP/ARCA.
   * Para imágenes, escanea directamente.
   */
  private async detectQR(filePath: string): Promise<QRDetectionResult> {
    if (!existsSync(filePath)) {
      return { found: false, error: `Archivo no encontrado: ${filePath}` };
    }

    const ext = extname(filePath).toLowerCase();

    // PDFs: renderizar cada página y escanear
    if (ext === '.pdf') {
      try {
        const pdfBuffer = readFileSync(filePath);
        const document = await pdf(pdfBuffer, { scale: PDF_RENDER_SCALE });

        console.info(`   🔄 PDF con ${document.length} página(s) (scale: ${PDF_RENDER_SCALE})`);

        let pageNumber = 0;
        for await (const page of document) {
          pageNumber++;
          console.info(`   📄 Página ${pageNumber} convertida (${page.length} bytes)`);
          console.info(`   🔍 Escaneando página ${pageNumber}...`);

          const result = await this.detectQRInImage(page);
          if (result.found && result.rawData && this.isAFIPUrl(result.rawData)) {
            console.info(`   ✅ QR AFIP/ARCA encontrado en página ${pageNumber}`);
            return result;
          }
        }

        return {
          found: false,
          error: 'No se encontró QR de AFIP/ARCA en ninguna página del PDF',
        };
      } catch (error) {
        console.error(`   ❌ Error procesando páginas del PDF:`, error);
        return { found: false, error: 'Error convirtiendo PDF a imágenes' };
      }
    }

    // HEIC/HEIF: convertir y escanear
    if (ext === '.heic' || ext === '.heif') {
      const buffer = await this.convertHeicToJpeg(filePath);
      return this.detectQRInImage(buffer);
    }

    // Imágenes: escanear directamente
    return this.detectQRInImage(readFileSync(filePath));
  }

  /**
   * Busca QR codes de AFIP/ARCA en una imagen usando zxing-wasm.
   *
   * ZXing maneja internamente binarización adaptativa y múltiples estrategias
   * de detección (PURE, HARDER, HYBRID), así que no necesitamos sliding window
   * ni preprocesamiento manual.
   */
  private async detectQRInImage(imageSource: Buffer): Promise<QRDetectionResult> {
    try {
      const { data, info } = await sharp(imageSource)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      console.info(`   🔍 Buscando código QR AFIP/ARCA (${info.width}x${info.height})...`);

      const imageData = {
        data: new Uint8ClampedArray(data),
        width: info.width,
        height: info.height,
        colorSpace: 'srgb' as const,
      };

      const results = await readBarcodes(imageData, {
        formats: ['QRCode'],
        tryHarder: true,
        maxNumberOfSymbols: 5,
      });

      // Buscar el QR de AFIP/ARCA entre todos los detectados
      for (const result of results) {
        if (result.text && this.isAFIPUrl(result.text)) {
          console.info(`   ✅ QR AFIP/ARCA detectado`);
          return { found: true, rawData: result.text };
        }
      }

      // Reportar QRs no-AFIP encontrados (útil para diagnóstico)
      if (results.length > 0) {
        const otherUrls = results
          .filter((r) => r.text)
          .map((r) => r.text.substring(0, 40))
          .slice(0, 2);
        console.info(`   ⚠️ Se encontraron ${results.length} QR(s), pero ninguno de AFIP/ARCA`);
        return {
          found: false,
          error: `Se encontraron ${results.length} código(s) QR pero ninguno de AFIP/ARCA. URLs: ${otherUrls.join(', ')}...`,
        };
      }

      return { found: false, error: 'No se encontró código QR en la imagen' };
    } catch (error) {
      console.error(`   ❌ Error detectando QR:`, error);
      return { found: false };
    }
  }

  /**
   * Verifica si una URL es de AFIP (cualquiera de los formatos válidos)
   */
  private isAFIPUrl(url: string): boolean {
    return AFIP_QR_URL_PATTERNS.some((pattern) => url.startsWith(pattern));
  }

  /**
   * Parsea URL de AFIP y extrae datos JSON
   * Soporta ambos formatos de URL oficiales de AFIP
   */
  private parseAFIPUrl(url: string): AFIPUrlParseResult {
    // Verificar que es URL de AFIP
    if (!this.isAFIPUrl(url)) {
      return { valid: false, error: `URL no es de AFIP: ${url.substring(0, 50)}...` };
    }

    // Extraer parámetro p
    const urlObj = new URL(url);
    const base64Data = urlObj.searchParams.get('p');

    if (!base64Data) {
      return { valid: false, error: 'URL de AFIP sin parámetro p' };
    }

    try {
      // Decodificar Base64
      const jsonStr = Buffer.from(base64Data, 'base64').toString('utf-8');
      const data = parseAFIPJson(jsonStr);

      // Validar campos mínimos requeridos (CUIT es el único obligatorio)
      // NOTA: Algunos QR de AFIP tienen "fecha": false en lugar de fecha real
      if (!data.ver || !data.cuit) {
        return { valid: false, error: 'JSON de AFIP con campos faltantes (ver/cuit)' };
      }

      // Advertencia si falta fecha (pero no es error fatal)
      if (typeof data.fecha !== 'string' || !data.fecha) {
        console.warn(`   ⚠️ QR AFIP sin fecha válida (fecha=${String(data.fecha)})`);
      }

      console.info(
        `   📋 Datos AFIP: CUIT=${data.cuit}, Fecha=${data.fecha || 'N/A'}, Tipo=${data.tipoCmp}`
      );
      return { valid: true, data };
    } catch (error) {
      return {
        valid: false,
        error: `Error parseando JSON: ${error instanceof Error ? error.message : 'desconocido'}`,
      };
    }
  }

  /**
   * Extrae información de factura desde QR code AFIP
   */
  async extract(filePath: string): Promise<ExtractionResult> {
    console.info(`   📱 Iniciando extracción QR: ${filePath}`);

    try {
      // 1. Detectar QR
      const qrResult = await this.detectQR(filePath);

      if (!qrResult.found || !qrResult.rawData) {
        console.warn(`   ⚠️ ${qrResult.error || 'QR no encontrado'}`);
        return {
          success: false,
          confidence: 0,
          data: {},
          errors: [qrResult.error || 'No se encontró código QR'],
          method: 'QR',
        };
      }

      // 2. Parsear URL AFIP
      const parseResult = this.parseAFIPUrl(qrResult.rawData);

      if (!parseResult.valid || !parseResult.data) {
        console.warn(`   ⚠️ ${parseResult.error}`);
        return {
          success: false,
          confidence: 30,
          data: {},
          errors: [parseResult.error || 'URL de QR no válida'],
          method: 'QR',
        };
      }

      // 3. Mapear datos AFIP a ExtractionResult
      const afipData = parseResult.data;

      // Calcular confianza basada en campos presentes
      // Fecha válida solo si es string (no false o undefined)
      const hasValidDate = typeof afipData.fecha === 'string' && afipData.fecha.length > 0;
      const hasAllRequired =
        afipData.cuit &&
        hasValidDate &&
        afipData.tipoCmp &&
        afipData.ptoVta !== undefined &&
        afipData.nroCmp !== undefined;

      // Menor confianza si falta fecha
      const confidence = hasAllRequired ? 100 : hasValidDate ? 90 : 80;

      console.info(`   ✅ Extracción QR exitosa (confianza: ${confidence}%)`);

      return {
        success: true,
        confidence,
        data: {
          cuit: formatCuit(afipData.cuit),
          // Solo incluir fecha si es válida (string), no si es false
          date: hasValidDate ? (afipData.fecha as string) : undefined,
          total: afipData.importe,
          invoiceType: afipData.tipoCmp,
          pointOfSale: afipData.ptoVta,
          invoiceNumber: afipData.nroCmp,
        },
        method: 'QR',
      };
    } catch (error) {
      console.error(`   ❌ Error en extracción QR:`, error);
      return {
        success: false,
        confidence: 0,
        data: {},
        errors: [error instanceof Error ? error.message : 'Error desconocido en QR'],
        method: 'QR',
      };
    }
  }
}
