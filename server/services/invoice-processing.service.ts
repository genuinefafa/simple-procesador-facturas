/**
 * Servicio de procesamiento de facturas
 * Encapsula toda la lógica de extracción y guardado
 *
 * Soporta:
 * - PDFs digitales (texto embebido)
 * - PDFs escaneados (via OCR)
 * - Imágenes: JPG, PNG, TIFF, WEBP, HEIC
 */

import { PDFExtractor } from '../extractors/pdf-extractor.js';
import { OCRExtractor } from '../extractors/ocr-extractor.js';
import { validateCUIT, normalizeCUIT, getPersonType } from '../validators/cuit.js';
import { EmitterRepository } from '../database/repositories/emitter.js';
import { InvoiceRepository } from '../database/repositories/invoice.js';
import {
  ExpectedInvoiceRepository,
  type ExpectedInvoice,
} from '../database/repositories/expected-invoice.js';
import { format, subDays, addDays } from 'date-fns';
import { extname } from 'path';
import type { Invoice, DocumentType } from '../utils/types.js';

// Extensiones de imagen soportadas para OCR
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp', '.heic', '.heif'];

// Umbral mínimo de caracteres para considerar un PDF como "digital"
const MIN_PDF_TEXT_LENGTH = 100;

export interface ProcessingResult {
  success: boolean;
  invoice?: Invoice;
  error?: string;
  requiresReview: boolean;
  confidence: number;
  source?: 'PDF_EXTRACTION' | 'EXCEL_MATCH_UNIQUE' | 'EXCEL_MATCH_AMBIGUOUS' | 'NO_MATCH';
  matchedExpectedInvoiceId?: number;
  matchCandidates?: ExpectedInvoice[];
  extractedData?: {
    cuit?: string;
    date?: string;
    total?: number;
    invoiceType?: string;
    pointOfSale?: number;
    invoiceNumber?: number;
  };
}

export class InvoiceProcessingService {
  private pdfExtractor: PDFExtractor;
  private ocrExtractor: OCRExtractor;
  private emitterRepo: EmitterRepository;
  private invoiceRepo: InvoiceRepository;
  private expectedInvoiceRepo: ExpectedInvoiceRepository;

  constructor() {
    this.pdfExtractor = new PDFExtractor();
    this.ocrExtractor = new OCRExtractor();
    this.emitterRepo = new EmitterRepository();
    this.invoiceRepo = new InvoiceRepository();
    this.expectedInvoiceRepo = new ExpectedInvoiceRepository();
  }

  /**
   * Detecta el tipo de documento basado en la extensión y contenido
   * @param filePath - Ruta al archivo
   * @returns Tipo de documento detectado
   */
  private async detectDocumentType(filePath: string): Promise<DocumentType> {
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

        // Si el texto extraído es muy corto, probablemente sea un escaneo
        if (text.trim().length < MIN_PDF_TEXT_LENGTH) {
          console.info(`   📷 Tipo detectado: PDF_IMAGEN (texto insuficiente: ${text.trim().length} chars)`);
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
   * @returns Resultado del procesamiento
   */
  async processInvoice(filePath: string, fileName: string): Promise<ProcessingResult> {
    console.info(`\n🔧 [SERVICE] Procesando archivo: ${fileName}`);
    console.info(`   📂 Ruta: ${filePath}`);

    try {
      // 0. Detectar tipo de documento
      console.info(`   🔍 Detectando tipo de documento...`);
      const documentType = await this.detectDocumentType(filePath);

      // 1. Extraer información según el tipo de documento
      let extraction;

      if (documentType === 'PDF_DIGITAL') {
        console.info(`   📄 Extrayendo datos del PDF digital...`);
        extraction = await this.pdfExtractor.extract(filePath);
      } else if (documentType === 'IMAGEN') {
        console.info(`   📷 Extrayendo datos de imagen con OCR...`);
        extraction = await this.ocrExtractor.extract(filePath);
      } else if (documentType === 'PDF_IMAGEN') {
        // PDF escaneado: intentar OCR si está disponible, sino fallback a pdf-parse
        console.info(`   📷 PDF escaneado detectado - Intentando OCR...`);
        try {
          extraction = await this.ocrExtractor.extract(filePath);
          // Si OCR no extrae suficiente, intentar con pdf-parse como fallback
          if (!extraction.success && extraction.confidence < 30) {
            console.info(`   ⚠️  OCR insuficiente, intentando pdf-parse como fallback...`);
            extraction = await this.pdfExtractor.extract(filePath);
          }
        } catch (ocrError) {
          const errorMsg = ocrError instanceof Error ? ocrError.message : 'Error desconocido';

          // Si el error es por falta de conversión PDF→imagen, dar mensaje específico
          if (errorMsg.includes('No se pudo convertir PDF a imagen')) {
            console.error(`   ❌ No se puede procesar PDF escaneado sin dependencias de canvas`);
            console.error(`   💡 Recomendación: Convertir el PDF a imagen (JPG/PNG) antes de subir`);
            console.error(`   💡 O instalar dependencias del sistema para canvas (ver logs arriba)`);

            // Crear resultado con error claro
            extraction = {
              success: false,
              confidence: 0,
              data: {},
              errors: [
                'PDF escaneado requiere conversión a imagen',
                'Alternativas:',
                '1. Convertir PDF a JPG/PNG antes de subir',
                '2. Instalar dependencias: sudo apt-get install libcairo2-dev libpango1.0-dev && npm install canvas',
              ],
              method: 'OCR',
            };
          } else {
            console.warn(`   ⚠️  OCR falló, usando pdf-parse como fallback:`, ocrError);
            extraction = await this.pdfExtractor.extract(filePath);
          }
        }
      } else {
        console.info(`   📄 Extrayendo datos del PDF...`);
        extraction = await this.pdfExtractor.extract(filePath);
      }

      console.info(
        `   📊 Extracción completada - Éxito: ${extraction.success}, Confianza: ${extraction.confidence}%, Método: ${extraction.method}`
      );

      const data = extraction.data;
      const confidence = extraction.confidence || 0;
      const extractionMethod = extraction.method; // PDF_TEXT, OCR, TEMPLATE, etc.

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

      // 2. MATCHING CON EXCEL AFIP (si hay CUIT detectado)
      if (data.cuit && validateCUIT(data.cuit)) {
        const normalizedCuit = normalizeCUIT(data.cuit);
        console.info(`   🔍 Buscando matches en Excel AFIP para CUIT: ${normalizedCuit}`);

        const matchResult = this.findExcelMatch(normalizedCuit, data);

        // MATCH ÚNICO - Auto-completar desde Excel
        if (matchResult.type === 'UNIQUE') {
          console.info(`   ✅ Match único encontrado en Excel AFIP - Auto-completando datos`);
          const expected = matchResult.match;

          return {
            success: false, // Aún requiere revisión del usuario
            requiresReview: true,
            confidence: 95,
            source: 'EXCEL_MATCH_UNIQUE',
            matchedExpectedInvoiceId: expected.id,
            extractedData: {
              cuit: expected.cuit,
              date: expected.issueDate,
              total: expected.total || undefined,
              invoiceType: expected.invoiceType,
              pointOfSale: expected.pointOfSale,
              invoiceNumber: expected.invoiceNumber,
            },
          };
        }

        // MÚLTIPLES MATCHES - Mostrar al usuario para elegir
        if (matchResult.type === 'AMBIGUOUS') {
          console.info(
            `   ⚠️  ${matchResult.candidates.length} posibles matches encontrados - Requiere selección manual`
          );
          return {
            success: false,
            requiresReview: true,
            confidence: 60,
            source: 'EXCEL_MATCH_AMBIGUOUS',
            matchCandidates: matchResult.candidates,
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

        console.info(`   ℹ️  Sin match en Excel AFIP - Procesamiento normal con OCR`);
      }

      // 3. Validar CUIT
      console.info(`   🔍 Validando CUIT...`);
      if (!data.cuit || !validateCUIT(data.cuit)) {
        console.warn(`   ❌ CUIT inválido o no encontrado: ${data.cuit}`);
        return {
          success: false,
          error: 'CUIT inválido o no encontrado',
          requiresReview: true,
          confidence,
          source: 'NO_MATCH',
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
        const cuitNumeric = normalizedCuit.replace(/-/g, '');
        const personType = getPersonType(normalizedCuit);

        emitter = this.emitterRepo.create({
          cuit: normalizedCuit,
          cuitNumeric: cuitNumeric,
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

      // 5. Verificar si ya existe
      const fullInvoiceNumber = `${data.invoiceType}-${String(data.pointOfSale).padStart(5, '0')}-${String(data.invoiceNumber).padStart(8, '0')}`;
      console.info(`   🔍 Verificando duplicados: ${fullInvoiceNumber}`);

      const existing = this.invoiceRepo.findByEmitterAndNumber(
        normalizedCuit,
        data.invoiceType,
        data.pointOfSale,
        data.invoiceNumber
      );

      if (existing) {
        console.warn(`   ⚠️  Factura duplicada - ya existe en BD`);
        return {
          success: false,
          error: 'Esta factura ya fue procesada',
          requiresReview: false,
          confidence,
          source: 'PDF_EXTRACTION',
          invoice: existing,
        };
      }

      // 6. Formatear fecha
      let formattedDate = format(new Date(), 'yyyy-MM-dd');
      if (data.date) {
        try {
          const [day, month, year] = data.date.split(/[/-]/);
          formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        } catch {
          // Usar fecha actual si falla el parseo
        }
      }
      console.info(`   📅 Fecha formateada: ${formattedDate}`);

      // 7. Crear factura en BD
      console.info(`   💾 Guardando factura en base de datos...`);
      const invoice = this.invoiceRepo.create({
        emitterCuit: normalizedCuit,
        issueDate: formattedDate,
        invoiceType: data.invoiceType,
        pointOfSale: data.pointOfSale,
        invoiceNumber: data.invoiceNumber,
        total: data.total,
        currency: 'ARS',
        originalFile: fileName,
        processedFile: fileName, // Se actualizará cuando se renombre
        fileType: documentType,
        extractionMethod: extractionMethod,
        extractionConfidence: confidence,
        requiresReview: confidence < 80,
      });

      console.info(`   ✅ Factura guardada exitosamente - ID: ${invoice.id}`);
      console.info(
        `   📊 Requiere revisión: ${confidence < 80 ? 'SÍ' : 'NO'} (confianza: ${confidence}%)`
      );

      return {
        success: true,
        invoice,
        requiresReview: confidence < 80,
        confidence,
        source: 'PDF_EXTRACTION',
        extractedData: {
          cuit: normalizedCuit,
          date: formattedDate,
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
   * Busca matches de una factura en el Excel AFIP
   */
  private findExcelMatch(
    cuit: string,
    extractedData: {
      date?: string;
      total?: number;
      invoiceType?: string;
      pointOfSale?: number;
      invoiceNumber?: number;
    }
  ):
    | { type: 'NONE' }
    | { type: 'UNIQUE'; match: ExpectedInvoice }
    | { type: 'AMBIGUOUS'; candidates: ExpectedInvoice[] } {
    // Estrategia de matching progresiva:

    // 1. Si tenemos TODOS los datos, buscar match exacto
    if (
      extractedData.invoiceType &&
      extractedData.pointOfSale !== undefined &&
      extractedData.invoiceNumber !== undefined
    ) {
      const exactMatch = this.expectedInvoiceRepo.findExactMatch(
        cuit,
        extractedData.invoiceType,
        extractedData.pointOfSale,
        extractedData.invoiceNumber
      );

      if (exactMatch) {
        return { type: 'UNIQUE', match: exactMatch };
      }
    }

    // 2. Buscar por CUIT + fecha + total
    const criteria: {
      cuit: string;
      dateRange?: [string, string];
      totalRange?: [number, number];
      status?: import('../database/repositories/expected-invoice.js').ExpectedInvoiceStatus[];
    } = { cuit, status: ['pending'] };

    // Agregar rango de fechas (±7 días)
    if (extractedData.date) {
      try {
        // Parsear fecha extraída (formato DD/MM/YYYY o DD-MM-YYYY)
        let date: Date;
        if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(extractedData.date)) {
          const [day, month, year] = extractedData.date.split(/[/-]/);
          date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        } else {
          date = new Date(extractedData.date);
        }

        const dateFrom = format(subDays(date, 7), 'yyyy-MM-dd');
        const dateTo = format(addDays(date, 7), 'yyyy-MM-dd');
        criteria.dateRange = [dateFrom, dateTo];
      } catch {
        // Si falla el parseo de fecha, no usar criterio de fecha
        console.warn(`   ⚠️  No se pudo parsear fecha para matching: ${extractedData.date}`);
      }
    }

    // Agregar rango de total (±10%)
    if (extractedData.total && extractedData.total > 0) {
      const margin = extractedData.total * 0.1;
      criteria.totalRange = [extractedData.total - margin, extractedData.total + margin];
    }

    const candidates = this.expectedInvoiceRepo.findCandidates(criteria);

    if (candidates.length === 0) {
      return { type: 'NONE' };
    }

    if (candidates.length === 1) {
      return { type: 'UNIQUE', match: candidates[0] };
    }

    // Si hay entre 2 y 5 candidatos, devolver para selección manual
    if (candidates.length <= 5) {
      return { type: 'AMBIGUOUS', candidates };
    }

    // Si hay más de 5, intentar refinar con más criterios
    // Por ahora, devolver sin match para evitar ambigüedad
    console.warn(
      `   ⚠️  Demasiados candidatos (${candidates.length}) - Se necesitan más datos para matching`
    );
    return { type: 'NONE' };
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
