/**
 * Extractor OCR para imágenes y PDFs escaneados
 *
 * Utiliza Tesseract.js para reconocimiento óptico de caracteres
 * y Sharp para preprocesamiento de imágenes.
 *
 * Soporta: JPG, PNG, TIFF, WEBP, HEIC (via Sharp)
 */

import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import { existsSync, readFileSync } from 'fs';
import { extname } from 'path';
import type { ExtractionResult, InvoiceType, DocumentKind } from '../utils/types';
import { extractCUITFromText } from '../validators/cuit';
import { extractInvoiceTypeWithAFIP } from '../utils/afip-codes';
import { pdf } from 'pdf-to-img';

// Configuración de OCR
const OCR_CONFIG = {
  language: 'spa', // Español
  oem: Tesseract.OEM.LSTM_ONLY, // Motor LSTM (más preciso)
  psm: Tesseract.PSM.AUTO, // Detección automática de layout
};

// Extensiones de imagen soportadas
const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp', '.heic', '.heif'];

export class OCRExtractor {
  private worker: Tesseract.Worker | null = null;

  /**
   * Verifica si un archivo es una imagen soportada
   */
  static isImageFile(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase();
    return SUPPORTED_IMAGE_EXTENSIONS.includes(ext);
  }

  /**
   * Preprocesa una imagen para mejorar el OCR
   * - Convierte a escala de grises
   * - Normaliza contraste
   * - Aplica threshold para binarizar
   * - Redimensiona si es muy pequeña
   */
  private async preprocessImage(filePath: string): Promise<Buffer> {
    const ext = extname(filePath).toLowerCase();

    // Leer imagen con Sharp
    let image = sharp(filePath);

    // Obtener metadata para verificar tamaño
    const metadata = await image.metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    console.info(`   📐 Dimensiones originales: ${width}x${height}`);

    // Si la imagen es muy pequeña, escalar para mejor OCR
    if (width < 1000 || height < 1000) {
      const scale = Math.max(1000 / width, 1000 / height);
      if (scale > 1) {
        image = image.resize({
          width: Math.round(width * scale),
          height: Math.round(height * scale),
          fit: 'inside',
        });
        console.info(`   🔍 Escalando imagen ${scale.toFixed(1)}x para mejor OCR`);
      }
    }

    // Pipeline de preprocesamiento
    const processedBuffer = await image
      .grayscale() // Convertir a escala de grises
      .normalize() // Normalizar histograma (mejorar contraste)
      .sharpen({ sigma: 1.5 }) // Enfocar ligeramente
      .png() // Convertir a PNG para Tesseract
      .toBuffer();

    // Para imágenes con bajo contraste, aplicar threshold
    // Si detectamos que la imagen podría beneficiarse de binarización
    // (esto es heurístico, se puede ajustar)
    if (ext === '.tif' || ext === '.tiff') {
      // TIFFs escaneados suelen beneficiarse de binarización
      return sharp(processedBuffer)
        .threshold(180) // Binarizar con threshold adaptativo
        .png()
        .toBuffer();
    }

    return processedBuffer;
  }

  /**
   * Convierte PDF a imagen para OCR (primera página)
   *
   * Usa pdf-to-img que no requiere dependencias del sistema.
   * Funciona en cualquier plataforma (Linux, macOS, Windows).
   *
   * @param filePath - Ruta al archivo PDF
   * @returns Buffer de la primera página como PNG, o null si falla
   */
  private async pdfToImage(filePath: string): Promise<Buffer | null> {
    try {
      console.info(`   🔄 Convirtiendo PDF a imagen...`);

      // Leer el PDF como buffer
      const pdfBuffer = readFileSync(filePath);

      // Convertir PDF a imágenes (array de páginas)
      const document = await pdf(pdfBuffer, { scale: 2.0 }); // scale 2.0 = mejor resolución para OCR

      // Obtener solo la primera página
      let pageCount = 0;
      for await (const page of document) {
        pageCount++;
        console.info(`   📄 Página 1 convertida (${page.length} bytes)`);
        return page; // Retornar solo la primera página
      }

      if (pageCount === 0) {
        console.warn(`   ⚠️  PDF vacío o sin páginas`);
        return null;
      }

      return null;
    } catch (error) {
      console.error(`   ❌ Error convirtiendo PDF a imagen:`, error);
      return null;
    }
  }

  /**
   * Extrae texto de una imagen usando Tesseract OCR
   * @param filePath - Ruta al archivo de imagen
   * @returns Texto extraído
   */
  async extractText(filePath: string): Promise<string> {
    if (!existsSync(filePath)) {
      throw new Error(`Archivo no encontrado: ${filePath}`);
    }

    const ext = extname(filePath).toLowerCase();
    console.info(`   🔍 Iniciando OCR para archivo: ${filePath}`);
    console.info(`   📄 Extensión detectada: ${ext}`);

    let imageBuffer: Buffer;

    // Si es PDF, necesitamos convertirlo a imagen primero
    if (ext === '.pdf') {
      const pdfImage = await this.pdfToImage(filePath);
      if (!pdfImage) {
        throw new Error('No se pudo convertir PDF a imagen para OCR');
      }
      imageBuffer = pdfImage;
    } else if (SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) {
      // Preprocesar imagen para mejorar OCR
      console.info(`   🎨 Preprocesando imagen...`);
      imageBuffer = await this.preprocessImage(filePath);
    } else {
      throw new Error(`Formato de archivo no soportado para OCR: ${ext}`);
    }

    // Ejecutar OCR con Tesseract
    console.info(`   🔠 Ejecutando Tesseract OCR (idioma: ${OCR_CONFIG.language})...`);

    try {
      const result = await Tesseract.recognize(imageBuffer, OCR_CONFIG.language, {
        logger: (info) => {
          if (info.status === 'recognizing text') {
            // Solo mostrar progreso cada 25%
            const progress = Math.round((info.progress || 0) * 100);
            if (progress % 25 === 0) {
              console.info(`   📊 Progreso OCR: ${progress}%`);
            }
          }
        },
      });

      const text = result.data.text;
      const confidence = result.data.confidence;

      console.info(`   ✅ OCR completado - Confianza Tesseract: ${confidence.toFixed(1)}%`);
      console.info(`   📝 Caracteres extraídos: ${text.length}`);

      return text;
    } catch (error) {
      console.error(`   ❌ Error en OCR:`, error);
      throw new Error(`Error ejecutando OCR: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }

  /**
   * Extrae información de factura de una imagen usando OCR
   * Aplica los mismos patrones regex que PDFExtractor
   * @param filePath - Ruta al archivo de imagen
   * @returns Resultado de extracción
   */
  async extract(filePath: string): Promise<ExtractionResult> {
    try {
      // 1. Extraer texto con OCR
      const text = await this.extractText(filePath);

      // Mostrar preview del texto extraído
      const preview = text.trim().substring(0, 300);
      console.info(`   📝 Texto OCR (primeros 300 chars): "${preview}${text.length > 300 ? '...' : ''}"`);

      if (!text || text.trim().length < 50) {
        return {
          success: false,
          confidence: 0,
          data: {},
          errors: ['OCR no pudo extraer texto suficiente de la imagen'],
          method: 'OCR',
        };
      }

      // 2. Aplicar patrones regex (mismos que PDFExtractor)

      // Extraer CUIT del EMISOR (no del receptor)
      // Buscar CUITs con contexto para identificar al emisor
      let cuit: string | undefined;

      // Patrones específicos para CUIT del emisor (buscar antes que "DESTINATARIO" o "RECEPTOR")
      const emitterPatterns = [
        /CUIT\s*(?:EMISOR|Emisor)?[:\s]*(\d{2}[-\s]?\d{7,8}[-\s]?\d)/i,
        /(?:^|[\r\n])CUIT[:\s]*(\d{2}[-\s]?\d{7,8}[-\s]?\d)/im, // CUIT al inicio o después de línea
      ];

      for (const pattern of emitterPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          // Intentar validar, pero ser más tolerante con OCR
          const cuits = extractCUITFromText(match[1]);
          if (cuits.length > 0) {
            cuit = cuits[0];
            console.info(`   💼 CUIT emisor encontrado con contexto: ${cuit}`);
            break;
          } else {
            // OCR pudo leer mal el dígito verificador
            console.warn(`   ⚠️  CUIT emisor candidato pero DV inválido: ${match[1]}`);
          }
        }
      }

      // Fallback: tomar el primer CUIT válido antes de "DESTINATARIO" o "RECEPTOR"
      if (!cuit) {
        const allCuits = extractCUITFromText(text);
        if (allCuits.length > 0) {
          cuit = allCuits[0];
          if (allCuits.length > 1) {
            console.warn(
              `   ⚠️  Múltiples CUITs encontrados (${allCuits.length}), usando el primero: ${cuit}`
            );
          } else {
            console.info(`   💼 CUIT encontrado: ${cuit}`);
          }
        }
      }

      // Extraer fecha (patrones comunes argentinos)
      const datePatterns = [
        /FECHA:\s*[\r\n]+[^\d]*(\d{2}[/-]\d{2}[/-]\d{4})/i,
        /(\d{2}[/-]\d{2}[/-]\d{4})\s*[\r\n]+\s*\d{12,13}\b/,
        /Fecha[:\s]+(\d{2}[/-]\d{2}[/-]\d{4})/i,
        /Emisión[:\s]+(\d{2}[/-]\d{2}[/-]\d{4})/i,
        /Emisi[oó]n[:\s]+(\d{2}[/-]\d{2}[/-]\d{4})/i, // OCR puede confundir acentos
        /(\d{2}[/-]\d{2}[/-]\d{4})/g, // Fallback: cualquier fecha
      ];

      let date: string | undefined;
      for (const pattern of datePatterns) {
        const matches = Array.from(text.matchAll(new RegExp(pattern, 'gi')));
        for (const match of matches) {
          const extractedDate = match[1] || match[0];
          // Evitar fechas de "Inicio de Actividades"
          const context = text.substring(
            Math.max(0, (match.index || 0) - 50),
            (match.index || 0) + 80
          );
          if (
            !context.toLowerCase().includes('inicio') &&
            !context.toLowerCase().includes('actividad')
          ) {
            date = extractedDate;
            break;
          }
        }
        if (date) break;
      }

      // Extraer total (patrones argentinos con punto para miles y coma para decimales)
      const totalPatterns = [
        /([\d.]+,\d{2})\s*[\d,.]+\s*[\d.]+,\d{2}\s*[\r\n]+\s*PERCEPCIONES/i,
        /Observaciones:\s*[\r\n]+\s*([\d.]+,\d{2})/i,
        /TOTAL\s+([\d.]+,\d{2})\s*[\r\n]/i,
        /Total[:\s]+\$?\s*([\d.]+,\d{2})/i,
        /Importe Total[:\s]+\$?\s*([\d.]+,\d{2})/i,
        /IMPORTE\s+TOTAL[:\s]*\$?\s*([\d.]+,\d{2})/i, // OCR mayúsculas
        /\$\s*([\d.]+,\d{2})/g, // Fallback: cualquier monto con $
      ];

      let total: string | undefined;
      for (const pattern of totalPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          total = match[1];
          // Verificar que el total sea razonable (más de 100)
          const testValue = parseFloat(match[1].replace(/\./g, '').replace(/,/, '.'));
          if (testValue > 100) {
            break;
          }
        }
      }

      // Extraer tipo de comprobante (A, B, C, E, M) y tipo de documento (FAC, NCR, NDB)
      // Usa el mapeo de códigos AFIP para mayor precisión
      let invoiceType: InvoiceType | undefined;
      let documentKind: DocumentKind = 'FAC'; // Por defecto es factura

      const afipResult = extractInvoiceTypeWithAFIP(text);
      if (afipResult) {
        invoiceType = afipResult.invoiceType;
        documentKind = afipResult.documentKind;
        console.info(
          `   📋 Tipo detectado (OCR): ${documentKind} ${invoiceType} (método: ${afipResult.method})`
        );
      }

      // Extraer número de comprobante
      let pointOfSale: number | undefined;
      let invoiceNumber: number | undefined;

      const invoicePatterns = [
        // Específicos para facturas argentinas (más restrictivos primero)
        // "NRO. COMPROBANTE:", "NRO.I,:", etc. seguido de 4-8 dígitos
        /NRO[.\s]*(?:COMPROBANTE|I|COMP)?[:\s,]*(\d{4,5})\s*[-–]\s*(\d{6,8})/i,
        /N[uúÚ]mero[:\s]*(?:de\s+)?(?:Comprobante)?[:\s]*(\d{4,5})\s*[-–]\s*(\d{6,8})/i,

        // Con letra y guión: A-00001-00000001
        /([A-C])\s*-\s*(\d{4,5})\s*-\s*(\d{8})/,
        // Con letra sin guión: A0000100000001
        /([A-C])(\d{4,5})(\d{8})/,
        // OCR puede insertar espacios: A - 00001 - 00000001
        /([A-C])\s*[-–]\s*(\d{4,5})\s*[-–]\s*(\d{6,8})/,

        // Sin letra después de "NUMERO:"
        /NUMERO:\s*[\r\n]+.*?(\d{5})(\d{8})/is,
        /NUMERO:\s*[\r\n]+.*?(\d{4})(\d{8})/is,
        /N[uú]mero[:\s]+(\d{4,5})[-–\s]+(\d{6,8})/i,

        // Formato con guión sin letra (más tolerante, sin word boundary estricto)
        /(\d{4,5})\s*[-–]\s*(\d{8})/,
        // Dígitos juntos
        /\b(\d{5})(\d{8})\b/,
        /\b(\d{4})(\d{8})\b/,
      ];

      for (const pattern of invoicePatterns) {
        const match = text.match(pattern);
        if (match) {
          if (match.length === 4 && /[A-C]/.test(match[1]!)) {
            if (!invoiceType) {
              invoiceType = match[1] as InvoiceType;
            }
            pointOfSale = parseInt(match[2]!, 10);
            invoiceNumber = parseInt(match[3]!, 10);
            break;
          } else if (match.length >= 3) {
            const lastIdx = match.length - 1;
            pointOfSale = parseInt(match[lastIdx - 1]!, 10);
            invoiceNumber = parseInt(match[lastIdx]!, 10);
            break;
          }
        }
      }

      // 3. Calcular confianza
      const requiredFields = [cuit, date, invoiceType, pointOfSale, invoiceNumber];
      const requiredCount = requiredFields.filter(
        (f) => f !== undefined && f !== null && f !== ''
      ).length;
      const hasTotal = total !== undefined && total !== '';

      // OCR tiene menos confianza base que PDF digital
      const baseConfidence = (requiredCount / 5) * (hasTotal ? 90 : 80);
      const confidence = Math.round(baseConfidence);

      // 4. Parsear total
      let parsedTotal: number | undefined;
      if (total) {
        const normalized = total.replace(/\./g, '').replace(/,/, '.');
        parsedTotal = parseFloat(normalized);
      }

      // 5. Preparar errores/warnings
      const errors: string[] = [];
      if (!cuit) errors.push('CUIT no detectado');
      if (!date) errors.push('Fecha no detectada');
      if (!invoiceType) errors.push('Tipo de comprobante no detectado');
      if (!pointOfSale) errors.push('Punto de venta no detectado');
      if (!invoiceNumber) errors.push('Número de factura no detectado');
      if (!total) errors.push('Total no detectado');

      return {
        success: confidence >= 50,
        confidence,
        data: {
          cuit,
          date,
          total: parsedTotal,
          invoiceType,
          documentKind,
          pointOfSale,
          invoiceNumber,
        },
        errors: errors.length > 0 ? errors : undefined,
        method: 'OCR',
      };
    } catch (error) {
      console.error(`   ❌ Error en extracción OCR:`, error);
      return {
        success: false,
        confidence: 0,
        data: {},
        errors: [error instanceof Error ? error.message : 'Error desconocido en OCR'],
        method: 'OCR',
      };
    }
  }

  /**
   * Limpia recursos (worker de Tesseract)
   */
  async cleanup(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}
