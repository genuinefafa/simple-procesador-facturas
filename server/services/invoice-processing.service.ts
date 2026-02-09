/**
 * Servicio de procesamiento de facturas
 * Responsabilidad: SOLO extracción de datos de documentos.
 * NO hace matching con Excel AFIP - eso lo maneja el comparador on-demand.
 * NO crea facturas ni gestiona archivos — eso lo hace InvoiceCreationService.
 *
 * Soporta:
 * - PDFs digitales (texto embebido)
 * - PDFs escaneados (via OCR)
 * - Imágenes: JPG, PNG, TIFF, WEBP, HEIC
 * - Códigos QR de AFIP/ARCA
 */

import { PDFExtractor } from '../extractors/pdf-extractor.js';
import { OCRExtractor } from '../extractors/ocr-extractor.js';
import { QRExtractor } from '../extractors/qr-extractor.js';
import { validateCUIT, normalizeCUIT, getPersonType } from '@shared/validators/cuit';
import { EmitterRepository, type IEmitterRepository } from '../database/repositories/emitter.js';
import { extname } from 'path';
import type { DocumentType, ExtractionMethod } from '@shared/types';

// Extensiones de imagen soportadas para OCR
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp', '.heic', '.heif'];

// Umbral mínimo de caracteres para considerar un PDF como "digital"
const MIN_PDF_TEXT_LENGTH = 100;

export interface ProcessingResult {
  success: boolean;
  error?: string;
  requiresReview: boolean;
  confidence: number;
  source?: 'PDF_EXTRACTION' | 'NO_MATCH';
  /** Método de extracción efectivamente usado */
  method?: ExtractionMethod;
  /** Método solicitado por el usuario (si fue forzado) */
  requestedMethod?: 'OCR' | 'PDF_TEXT' | 'QR';
  extractedData?: {
    cuit?: string;
    date?: string;
    total?: number;
    invoiceType?: number | null;
    pointOfSale?: number;
    invoiceNumber?: number;
  };
}

export class InvoiceProcessingService {
  private pdfExtractor: PDFExtractor;
  private ocrExtractor: OCRExtractor;
  private qrExtractor: QRExtractor;
  private emitterRepo: IEmitterRepository;

  constructor(
    pdfExtractor?: PDFExtractor,
    ocrExtractor?: OCRExtractor,
    qrExtractor?: QRExtractor,
    emitterRepo?: IEmitterRepository
  ) {
    this.pdfExtractor = pdfExtractor ?? new PDFExtractor();
    this.ocrExtractor = ocrExtractor ?? new OCRExtractor();
    this.qrExtractor = qrExtractor ?? new QRExtractor();
    this.emitterRepo = emitterRepo ?? new EmitterRepository();
  }

  /**
   * Detecta el tipo de documento basado en la extensión y contenido
   * @param filePath - Ruta al archivo
   * @returns Tipo de documento detectado
   */
  async detectDocumentType(filePath: string): Promise<DocumentType> {
    const ext = extname(filePath).toLowerCase();

    // Si es una imagen, retornar IMAGEN
    if (IMAGE_EXTENSIONS.includes(ext)) {
      console.info(`   📷 Tipo detectado: IMAGEN (${ext})`);
      return 'IMAGEN';
    }

    // Si es PDF, verificar si tiene texto embebido
    if (ext === '.pdf') {
      try {
        const text = await this.pdfExtractor.extractText(filePath);

        // Mostrar una muestra del texto extraído
        const lenTrimLog = 3000;
        const preview = text.trim().substring(0, lenTrimLog);
        console.info(
          `   📝 Texto en PDF (primeros ${lenTrimLog} chars): "${preview}${text.length > lenTrimLog ? '...' : ''}"`
        );

        // Si el texto extraído es muy corto, probablemente sea un escaneo
        if (text.trim().length < MIN_PDF_TEXT_LENGTH) {
          console.info(
            `   📷 Tipo detectado: PDF_IMAGEN (texto insuficiente: ${text.trim().length} chars)`
          );
          return 'PDF_IMAGEN';
        }

        console.info(`   📄 Tipo detectado: PDF_DIGITAL (${text.trim().length} chars de texto)`);
        return 'PDF_DIGITAL';
      } catch {
        // Si falla la extracción de texto, asumir que es PDF escaneado
        console.info(`   📷 Tipo detectado: PDF_IMAGEN (error al extraer texto)`);
        return 'PDF_IMAGEN';
      }
    }

    // Default: asumir PDF digital
    console.warn(`   ⚠️  Extensión no reconocida (${ext}), asumiendo PDF_DIGITAL`);
    return 'PDF_DIGITAL';
  }

  /**
   * Procesa un archivo de factura
   * @param filePath - Ruta al archivo
   * @param fileName - Nombre del archivo original
   * @param options - Opciones de procesamiento
   * @param options.forceMethod - Método de extracción forzado (OCR, PDF_TEXT, QR)
   * @returns Resultado del procesamiento
   */
  async processInvoice(
    filePath: string,
    fileName: string,
    options?: { forceMethod?: 'OCR' | 'PDF_TEXT' | 'QR' }
  ): Promise<ProcessingResult> {
    console.info(`\n🔧 [SERVICE] Procesando archivo: ${fileName}`);
    console.info(`   📂 Ruta: ${filePath}`);

    try {
      // 0. Detectar tipo de documento
      console.info(`   🔍 Detectando tipo de documento...`);
      const documentType = await this.detectDocumentType(filePath);

      // 1. Extraer información según el tipo de documento
      let extraction: Awaited<ReturnType<typeof this.pdfExtractor.extract>>;
      const forceMethod = options?.forceMethod;

      // Si hay método forzado, usarlo directamente
      if (forceMethod) {
        console.info(`   🎯 Método forzado: ${forceMethod}`);
        if (forceMethod === 'OCR') {
          console.info(`   📷 Extrayendo datos con OCR (forzado)...`);
          extraction = await this.ocrExtractor.extract(filePath);
        } else if (forceMethod === 'PDF_TEXT') {
          console.info(`   📄 Extrayendo datos con PDF_TEXT (forzado)...`);
          extraction = await this.pdfExtractor.extract(filePath);
        } else if (forceMethod === 'QR') {
          console.info(`   📱 Extrayendo datos con QR (forzado)...`);
          extraction = await this.qrExtractor.extract(filePath);

          // Si el usuario eligió QR explícitamente y falló, NO hacer fallback
          // Devolver el error para que el usuario sepa que el método elegido no funcionó
          if (!extraction.success) {
            console.warn(`   ❌ QR no encontrado - método forzado, sin fallback`);
            return {
              success: false,
              error: extraction.errors?.join('; ') || 'No se encontró código QR en el documento',
              requiresReview: true,
              confidence: 0,
              method: 'QR',
              extractedData: {},
            };
          }
        } else {
          extraction = await this.pdfExtractor.extract(filePath);
        }
      } else if (documentType === 'PDF_DIGITAL') {
        console.info(`   📄 Extrayendo datos del PDF digital...`);
        extraction = await this.pdfExtractor.extract(filePath);
        // NO hay fallback automático a OCR - el usuario puede elegir reprocesar con QR u OCR manualmente
        // Esto evita costos innecesarios de OCR cuando QR podría funcionar mejor
      } else if (documentType === 'IMAGEN') {
        console.info(`   📷 Extrayendo datos de imagen con OCR...`);
        extraction = await this.ocrExtractor.extract(filePath);
      } else if (documentType === 'PDF_IMAGEN') {
        // Scanned PDF: OCR only, no silent fallback to PDF_TEXT
        console.info(`   📷 PDF escaneado detectado - Extrayendo con OCR...`);
        extraction = await this.ocrExtractor.extract(filePath);
      } else {
        console.info(`   📄 Extrayendo datos del PDF...`);
        extraction = await this.pdfExtractor.extract(filePath);
      }

      console.info(
        `   📊 Extracción completada - Éxito: ${extraction.success}, Confianza: ${extraction.confidence}%, Método: ${extraction.method}`
      );

      const data = extraction.data;
      const confidence = extraction.confidence || 0;
      const extractionMethod = extraction.method;

      console.info(`   📋 Datos extraídos (RAW) [${extractionMethod}]:`);
      console.info(`      CUIT: ${data.cuit || '❌ NO DETECTADO'}`);
      console.info(`      Fecha: ${data.date || '❌ NO DETECTADO'}`);
      console.info(`      Total: ${data.total !== undefined ? data.total : '❌ NO DETECTADO'}`);
      console.info(`      Tipo: ${data.invoiceType || '❌ NO DETECTADO'}`);
      console.info(
        `      Punto Venta: ${data.pointOfSale !== undefined ? data.pointOfSale : '❌ NO DETECTADO'}`
      );
      console.info(
        `      Número: ${data.invoiceNumber !== undefined ? data.invoiceNumber : '❌ NO DETECTADO'}`
      );

      // IMPORTANTE: Siempre guardar datos extraídos, incluso si están incompletos
      if (!extraction.success || confidence < 50) {
        console.warn(`   ⚠️  Confianza baja (${confidence}%) - Requiere revisión manual`);
        return {
          success: false,
          error: `Extracción con confianza baja: ${confidence}%`,
          requiresReview: true,
          confidence,
          source: 'PDF_EXTRACTION',
          method: extractionMethod,
          requestedMethod: forceMethod,
          extractedData: {
            cuit: data.cuit,
            date: data.date,
            total: data.total,
            invoiceType: data.invoiceType,
            pointOfSale: data.pointOfSale,
            invoiceNumber: data.invoiceNumber,
          },
        };
      }

      // 2. Validar CUIT
      console.info(`   🔍 Validando CUIT...`);
      if (!data.cuit || !validateCUIT(data.cuit)) {
        console.warn(`   ❌ CUIT inválido o no encontrado: ${data.cuit}`);
        return {
          success: false,
          error: 'CUIT inválido o no encontrado',
          requiresReview: true,
          confidence,
          source: 'NO_MATCH',
          method: extractionMethod,
          requestedMethod: forceMethod,
          extractedData: {
            cuit: data.cuit,
            date: data.date,
            total: data.total,
            invoiceType: data.invoiceType,
            pointOfSale: data.pointOfSale,
            invoiceNumber: data.invoiceNumber,
          },
        };
      }

      const normalizedCuit = normalizeCUIT(data.cuit);
      console.info(`   ✅ CUIT válido: ${normalizedCuit}`);

      // 3. Buscar o crear emisor
      console.info(`   🏢 Buscando emisor...`);
      let emitter = this.emitterRepo.findByCUIT(normalizedCuit);

      if (!emitter) {
        console.info(`   ➕ Emisor no existe, creando nuevo...`);
        const personType = getPersonType(normalizedCuit);

        emitter = this.emitterRepo.create({
          cuit: normalizedCuit,
          name: `Emisor ${normalizedCuit}`,
          aliases: [],
          personType: personType || undefined,
        });
        console.info(`   ✅ Emisor creado: ${emitter.name}`);
      } else {
        console.info(`   ✅ Emisor encontrado: ${emitter.name}`);
      }

      // 4. Validar datos requeridos
      console.info(`   🔍 Validando datos obligatorios...`);
      if (!data.invoiceType || data.pointOfSale === undefined || data.invoiceNumber === undefined) {
        console.warn(`   ❌ Faltan datos obligatorios:`);
        console.warn(`      Tipo: ${data.invoiceType || 'FALTA'}`);
        console.warn(
          `      Punto Venta: ${data.pointOfSale !== undefined ? data.pointOfSale : 'FALTA'}`
        );
        console.warn(
          `      Número: ${data.invoiceNumber !== undefined ? data.invoiceNumber : 'FALTA'}`
        );
        return {
          success: false,
          error: 'Faltan datos obligatorios de la factura',
          requiresReview: true,
          confidence,
          source: 'PDF_EXTRACTION',
          method: extractionMethod,
          requestedMethod: forceMethod,
          extractedData: {
            cuit: normalizedCuit,
            date: data.date,
            total: data.total,
            invoiceType: data.invoiceType,
            pointOfSale: data.pointOfSale,
            invoiceNumber: data.invoiceNumber,
          },
        };
      }

      // 5. Retornar datos extraídos para revisión del usuario
      // La creación de factura y gestión de archivos se delega a InvoiceCreationService
      console.info(`   ✅ Extracción completa - datos listos para revisión`);

      return {
        success: true,
        requiresReview: confidence < 80,
        confidence,
        source: 'PDF_EXTRACTION',
        method: extractionMethod,
        requestedMethod: forceMethod,
        extractedData: {
          cuit: normalizedCuit,
          date: data.date,
          total: data.total,
          invoiceType: data.invoiceType,
          pointOfSale: data.pointOfSale,
          invoiceNumber: data.invoiceNumber,
        },
      };
    } catch (error) {
      console.error(
        `   ❌ Error durante procesamiento: ${error instanceof Error ? error.message : 'Error desconocido'}`
      );
      if (error instanceof Error && error.stack) {
        console.error(`   Stack trace:`, error.stack);
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
        requiresReview: true,
        confidence: 0,
        source: 'PDF_EXTRACTION',
      };
    }
  }

  /**
   * Procesa múltiples archivos
   * @param files - Array de {path, name}
   * @returns Array de resultados
   */
  async processBatch(files: Array<{ path: string; name: string }>): Promise<ProcessingResult[]> {
    console.info(`\n🚀 [SERVICE] Iniciando procesamiento de ${files.length} archivo(s)`);
    const results: ProcessingResult[] = [];

    for (const file of files) {
      const result = await this.processInvoice(file.path, file.name);
      results.push(result);
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    console.info(`\n📊 [SERVICE] Resumen del procesamiento:`);
    console.info(`   ✅ Exitosas: ${successful}`);
    console.info(`   ❌ Fallidas: ${failed}`);
    console.info(`   📝 Total: ${results.length}\n`);

    return results;
  }
}
