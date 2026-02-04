/**
 * Extractor de códigos QR para comprobantes electrónicos AFIP/ARCA
 *
 * Los comprobantes electrónicos de AFIP incluyen un código QR que contiene
 * datos estructurados en formato JSON codificado en Base64.
 *
 * URLs soportadas:
 * - https://www.afip.gob.ar/fe/qr/?p={BASE64_JSON}
 * - https://servicioscf.afip.gob.ar/publico/comprobantes/cae.aspx?p={BASE64_JSON}
 *
 * Soporta: JPG, PNG, TIFF, WEBP, HEIC, PDF
 */

import jsQR from 'jsqr';
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

/**
 * Formatea CUIT de número a string con guiones (XX-XXXXXXXX-X)
 */
function formatCuit(cuit: number): string {
  const cuitStr = cuit.toString().padStart(11, '0');
  return `${cuitStr.slice(0, 2)}-${cuitStr.slice(2, 10)}-${cuitStr.slice(10)}`;
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
   * Convierte PDF a imagen (primera página)
   * Usa scale 5.0 para mejor detección de QR codes pequeños en documentos escaneados
   */
  private async pdfToImage(filePath: string, scale = 5.0): Promise<Buffer | null> {
    try {
      console.info(`   🔄 Convirtiendo PDF a imagen (scale: ${scale})...`);
      const pdfBuffer = readFileSync(filePath);
      const document = await pdf(pdfBuffer, { scale });

      for await (const page of document) {
        console.info(`   📄 Página 1 convertida (${page.length} bytes)`);
        return page;
      }

      console.warn(`   ⚠️ PDF vacío o sin páginas`);
      return null;
    } catch (error) {
      console.error(`   ❌ Error convirtiendo PDF a imagen:`, error);
      return null;
    }
  }

  /**
   * Obtiene raw RGBA pixels de una imagen para jsQR
   */
  private async getImagePixels(
    imageSource: string | Buffer
  ): Promise<{ data: Uint8ClampedArray; width: number; height: number } | null> {
    try {
      const { data, info } = await sharp(imageSource)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      return {
        data: new Uint8ClampedArray(data),
        width: info.width,
        height: info.height,
      };
    } catch (error) {
      console.error(`   ❌ Error procesando imagen:`, error);
      return null;
    }
  }

  /**
   * Detecta y decodifica QR code de una imagen.
   * Busca específicamente QR codes de AFIP/ARCA usando sliding window
   * para manejar documentos con múltiples QR codes.
   */
  private async detectQR(filePath: string): Promise<QRDetectionResult> {
    if (!existsSync(filePath)) {
      return { found: false, error: `Archivo no encontrado: ${filePath}` };
    }

    const ext = extname(filePath).toLowerCase();
    let imageSource: string | Buffer = filePath;

    // Convertir PDF a imagen
    if (ext === '.pdf') {
      const pdfImage = await this.pdfToImage(filePath);
      if (!pdfImage) {
        return { found: false, error: 'No se pudo convertir PDF a imagen' };
      }
      imageSource = pdfImage;
    }

    // Convertir HEIC a JPEG
    if (ext === '.heic' || ext === '.heif') {
      imageSource = await this.convertHeicToJpeg(filePath);
    }

    // Obtener pixels e info de imagen
    const metadata = await sharp(imageSource).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    console.info(`   🔍 Buscando código QR AFIP/ARCA (${width}x${height})...`);

    // Primero intentar detección directa en imagen completa
    const fullImageResult = await this.detectQRInRegion(imageSource, 0, 0, width, height);
    if (
      fullImageResult.found &&
      fullImageResult.rawData &&
      this.isAFIPUrl(fullImageResult.rawData)
    ) {
      console.info(`   ✅ QR AFIP/ARCA detectado directamente`);
      return fullImageResult;
    }

    // Si hay QR pero no es de AFIP, o no se encontró QR,
    // usar sliding window para buscar múltiples QR codes
    console.info(`   🔄 Usando sliding window para buscar QR AFIP/ARCA...`);

    const windowSize = 400;
    const step = 200;
    const foundQRs = new Map<string, { x: number; y: number }>();

    for (let y = 0; y <= height - windowSize; y += step) {
      for (let x = 0; x <= width - windowSize; x += step) {
        try {
          const regionResult = await this.detectQRInRegion(
            imageSource,
            x,
            y,
            windowSize,
            windowSize
          );
          if (regionResult.found && regionResult.rawData && !foundQRs.has(regionResult.rawData)) {
            foundQRs.set(regionResult.rawData, { x, y });

            // Si encontramos un QR de AFIP/ARCA, retornarlo inmediatamente
            if (this.isAFIPUrl(regionResult.rawData)) {
              console.info(`   ✅ QR AFIP/ARCA encontrado en región [${x},${y}]`);
              return regionResult;
            }
          }
        } catch {
          // Ignorar errores en regiones individuales
        }
      }
    }

    // No se encontró QR de AFIP/ARCA
    if (foundQRs.size > 0) {
      const otherUrls = Array.from(foundQRs.keys()).slice(0, 2);
      console.info(`   ⚠️ Se encontraron ${foundQRs.size} QR(s), pero ninguno de AFIP/ARCA`);
      return {
        found: false,
        error: `Se encontraron ${foundQRs.size} código(s) QR pero ninguno de AFIP/ARCA. URLs: ${otherUrls.map((u) => u.substring(0, 40)).join(', ')}...`,
      };
    }

    return { found: false, error: 'No se encontró código QR en la imagen' };
  }

  /**
   * Detecta QR code en una región específica de la imagen
   */
  private async detectQRInRegion(
    imageSource: string | Buffer,
    x: number,
    y: number,
    regionWidth: number,
    regionHeight: number
  ): Promise<QRDetectionResult> {
    try {
      const { data, info } = await sharp(imageSource)
        .extract({ left: x, top: y, width: regionWidth, height: regionHeight })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const pixels = new Uint8ClampedArray(data);

      const qrCode = jsQR(pixels, info.width, info.height, {
        inversionAttempts: 'attemptBoth',
      });

      if (qrCode) {
        return { found: true, rawData: qrCode.data };
      }

      return { found: false };
    } catch {
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
      const data = JSON.parse(jsonStr) as AFIPQRData;

      // Validar campos requeridos
      if (!data.ver || !data.cuit || !data.fecha) {
        return { valid: false, error: 'JSON de AFIP con campos faltantes' };
      }

      console.info(
        `   📋 Datos AFIP: CUIT=${data.cuit}, Fecha=${data.fecha}, Tipo=${data.tipoCmp}`
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
      const hasAllRequired =
        afipData.cuit &&
        afipData.fecha &&
        afipData.tipoCmp &&
        afipData.ptoVta !== undefined &&
        afipData.nroCmp !== undefined;

      const confidence = hasAllRequired ? 100 : 90;

      console.info(`   ✅ Extracción QR exitosa (confianza: ${confidence}%)`);

      return {
        success: true,
        confidence,
        data: {
          cuit: formatCuit(afipData.cuit),
          date: afipData.fecha, // Ya viene en formato ISO (YYYY-MM-DD)
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
