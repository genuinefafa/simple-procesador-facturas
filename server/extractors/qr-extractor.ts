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

// URLs válidas de AFIP QR (ambos formatos son oficiales)
const AFIP_QR_URL_PATTERNS = [
  'https://www.afip.gob.ar/fe/qr/',
  'https://servicioscf.afip.gob.ar/publico/comprobantes/',
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
   * Usa scale 3.0 para mejor detección de QR codes pequeños
   */
  private async pdfToImage(filePath: string, scale = 3.0): Promise<Buffer | null> {
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
   * Detecta y decodifica QR code de una imagen
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

    // Obtener pixels
    const pixels = await this.getImagePixels(imageSource);
    if (!pixels) {
      return { found: false, error: 'No se pudo procesar la imagen' };
    }

    console.info(`   🔍 Buscando código QR (${pixels.width}x${pixels.height})...`);

    // Detectar QR
    const qrCode = jsQR(pixels.data, pixels.width, pixels.height, {
      inversionAttempts: 'attemptBoth',
    });

    if (!qrCode) {
      // Intentar con imagen preprocesada (grayscale, mayor contraste)
      console.info(`   🔄 Reintentando con preprocesamiento...`);

      const processedBuffer = await sharp(imageSource)
        .grayscale()
        .normalize()
        .sharpen({ sigma: 1.5 })
        .toBuffer();

      const processedPixels = await this.getImagePixels(processedBuffer);
      if (processedPixels) {
        const qrCodeRetry = jsQR(
          processedPixels.data,
          processedPixels.width,
          processedPixels.height,
          { inversionAttempts: 'attemptBoth' }
        );

        if (qrCodeRetry) {
          console.info(`   ✅ QR detectado con preprocesamiento`);
          return { found: true, rawData: qrCodeRetry.data };
        }
      }

      return { found: false, error: 'No se encontró código QR en la imagen' };
    }

    console.info(`   ✅ QR detectado`);
    return { found: true, rawData: qrCode.data };
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
