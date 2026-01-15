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
import { FileRepository } from '../database/repositories/file.js';
import {
  ExpectedInvoiceRepository,
  type ExpectedInvoice,
} from '../database/repositories/expected-invoice.js';
import { format } from 'date-fns';
import { extname } from 'path';
import type { Invoice, DocumentType, ExtractionMethod } from '../utils/types.js';
import { calculateFileHash } from '../utils/file-hash.js';

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
  method?: ExtractionMethod; // Método de extracción específico
  matchedExpectedInvoiceId?: number;
  matchCandidates?: ExpectedInvoice[];
  fileHash?: string;
  extractedData?: {
    cuit?: string;
    date?: string;
    total?: number;
    invoiceType?: number | null; // Código ARCA numérico
    pointOfSale?: number;
    invoiceNumber?: number;
  };
}

export class InvoiceProcessingService {
  private pdfExtractor: PDFExtractor;
  private ocrExtractor: OCRExtractor;
  private emitterRepo: EmitterRepository;
  private invoiceRepo: InvoiceRepository;
  private fileRepo: FileRepository;
  private expectedInvoiceRepo: ExpectedInvoiceRepository;

  constructor() {
    this.pdfExtractor = new PDFExtractor();
    this.ocrExtractor = new OCRExtractor();
    this.emitterRepo = new EmitterRepository();
    this.invoiceRepo = new InvoiceRepository();
    this.fileRepo = new FileRepository();
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
      let extraction: Awaited<ReturnType<typeof this.pdfExtractor.extract>>;
      let usedFallback = false; // Track si se usó fallback PDF_TEXT → OCR

      if (documentType === 'PDF_DIGITAL') {
        console.info(`   📄 Extrayendo datos del PDF digital...`);
        extraction = await this.pdfExtractor.extract(filePath);

        // FALLBACK INTELIGENTE: Si PDF_TEXT no encuentra datos útiles, intentar OCR
        // Esto pasa cuando el PDF tiene texto (metadatos, marcas de agua) pero no datos reales
        const hasValidCuit = extraction.data.cuit && extraction.data.cuit.length >= 11;
        const hasValidDate = !!extraction.data.date;
        const hasValidType = !!extraction.data.invoiceType;
        const hasValidPointOfSale = extraction.data.pointOfSale !== undefined;
        const hasValidInvoiceNumber = extraction.data.invoiceNumber !== undefined;

        // ⚠️ SUPER RED FLAG: CUIT es FUNDAMENTAL - sin CUIT válido la factura no sirve
        const noCuitFound = !hasValidCuit;

        // Detectar si el CUIT encontrado es de receptores conocidos (no emisores)
        const knownReceiverCuits = ['30-50001770-4', '3050001770-4', '30500017704']; // LA SEGUNDA
        const detectedKnownReceiver = hasValidCuit
          ? knownReceiverCuits.some((rc) => {
              const extractedCuit = extraction.data.cuit || '';
              return extractedCuit.replace(/[-\s]/g, '') === rc.replace(/[-\s]/g, '');
            })
          : false;

        // Verificar si el CUIT tiene score negativo (probablemente es receptor, no emisor)
        // El scoring de CUIT está en el extractor, necesitamos verificar la confianza
        const cuitHasLowConfidence = hasValidCuit && extraction.confidence < 40; // Score negativo típicamente da < 40% confianza

        // Contar campos CRÍTICOS detectados (CUIT, Fecha, Tipo son los más importantes)
        const criticalFieldsDetected = [hasValidCuit, hasValidDate, hasValidType].filter(
          Boolean
        ).length;
        const allFieldsDetected = [
          hasValidCuit,
          hasValidDate,
          hasValidType,
          hasValidPointOfSale,
          hasValidInvoiceNumber,
        ].filter(Boolean).length;

        const hasLowConfidence = extraction.confidence < 60; // Aumentado de 50% a 60%
        const missingCriticalFields = criticalFieldsDetected < 3; // Si falta CUALQUIER campo crítico
        const missingMostFields = allFieldsDetected < 3; // Si faltan 3 o más de 5 campos totales

        // CONDICIÓN MÁS AGRESIVA: Activar OCR SIEMPRE si:
        // 1. No hay CUIT (super red flag)
        // 2. CUIT es de receptor conocido
        // 3. CUIT tiene confianza muy baja (score negativo)
        // 4. Falta cualquier campo crítico
        // 5. Confianza general baja
        if (
          noCuitFound ||
          detectedKnownReceiver ||
          cuitHasLowConfidence ||
          hasLowConfidence ||
          missingCriticalFields ||
          missingMostFields
        ) {
          const reasons = [];
          if (noCuitFound) reasons.push('⚠️ SUPER RED FLAG: CUIT NO DETECTADO');
          if (detectedKnownReceiver) reasons.push('CUIT de receptor conocido detectado');
          if (cuitHasLowConfidence)
            reasons.push(`CUIT con confianza muy baja (${extraction.confidence}%)`);
          if (hasLowConfidence) reasons.push(`confianza ${extraction.confidence}% < 60%`);
          if (missingCriticalFields)
            reasons.push(`campos críticos: ${criticalFieldsDetected}/3 (CUIT/Fecha/Tipo)`);
          if (missingMostFields) reasons.push(`campos totales: ${allFieldsDetected}/5`);

          console.warn(
            `   ⚠️  PDF_TEXT extrajo texto pero datos insuficientes: ${reasons.join(', ')}`
          );
          console.info(`   🔄 Activando OCR como fallback...`);

          try {
            const ocrExtraction = await this.ocrExtractor.extract(filePath);

            // CRITERIO DE SELECCIÓN: Usar OCR si encuentra MÁS campos críticos, o mismos campos con mayor confianza
            const ocrHasCuit = ocrExtraction.data.cuit && ocrExtraction.data.cuit.length >= 11;
            const ocrCriticalFields = [
              ocrHasCuit,
              !!ocrExtraction.data.date,
              !!ocrExtraction.data.invoiceType,
            ].filter(Boolean).length;

            // PRIORIDAD ABSOLUTA AL CUIT:
            // Si PDF_TEXT no tenía CUIT y OCR lo encontró → usar OCR siempre
            const ocrFoundMissingCuit = noCuitFound && ocrHasCuit;

            // Si PDF_TEXT tenía CUIT de receptor y OCR encontró uno diferente → usar OCR
            const ocrFoundDifferentCuit =
              detectedKnownReceiver &&
              ocrHasCuit &&
              ocrExtraction.data.cuit !== extraction.data.cuit;

            // Si PDF_TEXT tenía CUIT con baja confianza y OCR encontró uno → preferir OCR
            const ocrFoundBetterCuit = cuitHasLowConfidence && ocrHasCuit;

            const shouldUseOCR =
              ocrFoundMissingCuit || // ⚠️ PRIORIDAD 1: OCR encontró CUIT que faltaba
              ocrFoundDifferentCuit || // ⚠️ PRIORIDAD 2: OCR encontró CUIT diferente al receptor
              ocrFoundBetterCuit || // ⚠️ PRIORIDAD 3: OCR encontró CUIT cuando el de PDF tenía baja confianza
              ocrCriticalFields > criticalFieldsDetected || // OCR encontró MÁS campos críticos
              (ocrCriticalFields === criticalFieldsDetected &&
                ocrExtraction.confidence > extraction.confidence); // Mismos campos pero mejor confianza

            if (shouldUseOCR) {
              const ocrReasons = [];
              if (ocrFoundMissingCuit) ocrReasons.push('encontró CUIT que faltaba');
              if (ocrFoundDifferentCuit) ocrReasons.push('encontró CUIT diferente al receptor');
              if (ocrFoundBetterCuit) ocrReasons.push('encontró CUIT con mejor confianza');
              if (ocrCriticalFields > criticalFieldsDetected)
                ocrReasons.push(
                  `más campos críticos (${ocrCriticalFields} vs ${criticalFieldsDetected})`
                );
              if (
                ocrCriticalFields === criticalFieldsDetected &&
                ocrExtraction.confidence > extraction.confidence
              )
                ocrReasons.push(
                  `mejor confianza (${ocrExtraction.confidence}% vs ${extraction.confidence}%)`
                );

              console.info(`   ✅ Usando OCR: ${ocrReasons.join(', ')}`);
              if (ocrHasCuit && extraction.data.cuit !== ocrExtraction.data.cuit) {
                console.info(
                  `   🔄 CUIT cambió: ${extraction.data.cuit || 'NO DETECTADO'} → ${ocrExtraction.data.cuit}`
                );
              }
              extraction = ocrExtraction;
              usedFallback = true; // Marcar que se usó fallback
            } else {
              console.info(
                `   ℹ️  OCR no mejoró resultados (campos críticos: ${ocrCriticalFields} vs ${criticalFieldsDetected}), usando PDF_TEXT original`
              );
            }
          } catch (ocrError) {
            console.warn(`   ⚠️  OCR falló, usando PDF_TEXT original:`, ocrError);
          }
        } else {
          console.info(
            `   ✅ PDF_TEXT extrajo datos suficientes (${allFieldsDetected}/5 campos, conf: ${extraction.confidence}%), sin necesidad de OCR`
          );
        }
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
          console.warn(`   ⚠️  OCR falló, usando pdf-parse como fallback:`, ocrError);
          extraction = await this.pdfExtractor.extract(filePath);
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
      // Si se usó fallback, indicar que se usó ambos métodos
      const extractionMethod = usedFallback ? 'PDF_TEXT+OCR' : extraction.method;

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
          method: extractionMethod, // Incluir método específico
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

        const matchResult = await this.findExcelMatch(normalizedCuit, data);

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

      const existing = await this.invoiceRepo.findByEmitterAndNumber(
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
          if (day && month && year) {
            formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          }
        } catch {
          // Usar fecha actual si falla el parseo
        }
      }
      console.info(`   📅 Fecha formateada: ${formattedDate}`);

      // 7. Crear o buscar file entry
      console.info(`   💾 Preparando registro de archivo...`);
      let fileId: number;
      let fileHash: string | undefined;

      // Buscar file existente o crear nuevo
      const existingFiles = this.fileRepo.list({ limit: 1000 });
      let file = existingFiles.find(
        (f) => f.storagePath === filePath || f.originalFilename === fileName
      );

      if (file) {
        fileId = file.id;
        fileHash = file.fileHash ?? undefined;
        // Actualizar status a 'processed' si no lo está
        if (file.status !== 'processed') {
          this.fileRepo.updateStatus(fileId, 'processed');
          console.info(`   📁 File existente actualizado a processed: ID ${fileId}`);
        } else {
          console.info(`   📁 File existente encontrado: ID ${fileId}`);
        }
      } else {
        // Calcular hash
        const hashResult = await calculateFileHash(filePath);
        fileHash = hashResult.hash;

        // Verificar si existe por hash
        const existingByHash = this.fileRepo.findByHash(fileHash);
        if (existingByHash) {
          file = existingByHash;
          fileId = file.id;
          console.info(`   📁 File encontrado por hash: ID ${fileId}`);
        } else {
          // Crear nuevo file
          file = this.fileRepo.create({
            originalFilename: fileName,
            fileType: documentType,
            fileHash: fileHash,
            storagePath: filePath,
            status: 'processed',
          });
          fileId = file.id;
          console.info(`   📁 File creado: ID ${fileId}`);
        }
      }

      // 8. Crear factura en BD
      console.info(`   💾 Guardando factura en base de datos...`);
      const invoice = await this.invoiceRepo.create({
        emitterCuit: normalizedCuit,
        issueDate: formattedDate,
        invoiceType: data.invoiceType,
        pointOfSale: data.pointOfSale,
        invoiceNumber: data.invoiceNumber,
        total: data.total,
        fileId: fileId,
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
        fileHash,
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
  private async findExcelMatch(
    cuit: string,
    extractedData: {
      date?: string;
      total?: number;
      invoiceType?: number | null; // Código ARCA numérico
      pointOfSale?: number;
      invoiceNumber?: number;
    }
  ): Promise<
    | { type: 'NONE' }
    | { type: 'UNIQUE'; match: ExpectedInvoice }
    | { type: 'AMBIGUOUS'; candidates: ExpectedInvoice[] }
  > {
    // Estrategia de matching progresiva:

    // 1. Si tenemos TODOS los datos, buscar match exacto
    if (
      extractedData.invoiceType &&
      extractedData.pointOfSale !== undefined &&
      extractedData.invoiceNumber !== undefined
    ) {
      const exactMatch = await this.expectedInvoiceRepo.findExactMatch(
        cuit,
        extractedData.invoiceType,
        extractedData.pointOfSale,
        extractedData.invoiceNumber
      );

      if (exactMatch) {
        return { type: 'UNIQUE', match: exactMatch };
      }
    }

    // 2. Buscar candidatos usando matching inteligente (no requiere CUIT exacto)
    // Parseamos la fecha para pasarla en formato correcto
    let issueDate: string | undefined;
    if (extractedData.date) {
      try {
        // Parsear fecha extraída (formato DD/MM/YYYY o DD-MM-YYYY)
        let date: Date;
        if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(extractedData.date)) {
          const [day, month, year] = extractedData.date.split(/[/-]/);
          if (day && month && year) {
            date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          } else {
            date = new Date(extractedData.date);
          }
        } else {
          date = new Date(extractedData.date);
        }
        issueDate = format(date, 'yyyy-MM-dd');
      } catch {
        console.warn(`   ⚠️  No se pudo parsear fecha para matching: ${extractedData.date}`);
      }
    }

    // Usar findPartialMatches que hace scoring sin requerir CUIT exacto
    const candidatesWithScore = await this.expectedInvoiceRepo.findPartialMatches({
      cuit, // Puede estar incorrecto, el scoring lo maneja
      invoiceType: extractedData.invoiceType,
      pointOfSale: extractedData.pointOfSale,
      invoiceNumber: extractedData.invoiceNumber,
      issueDate,
      total: extractedData.total,
      limit: 10, // Buscar hasta 10 candidatos
    });

    // Filtrar solo candidatos con score mínimo de 50% (al menos mitad de campos coinciden)
    const viableCandidates = candidatesWithScore.filter((c) => c.matchScore >= 50);

    console.info(
      `   🔍 Matching parcial: ${candidatesWithScore.length} candidatos encontrados, ${viableCandidates.length} con score ≥50`
    );

    if (viableCandidates.length > 0) {
      // Loguear top 3 para debugging
      viableCandidates.slice(0, 3).forEach((c) => {
        console.info(
          `      - ID ${c.id}: score=${c.matchScore}%, campos=[${c.matchedFields.join(', ')}]`
        );
      });
    }

    if (viableCandidates.length === 0) {
      return { type: 'NONE' };
    }

    // Si el mejor candidato tiene score ≥80% y es único con ese score, considerarlo match único
    const bestScore = viableCandidates[0]!.matchScore;
    const topCandidates = viableCandidates.filter((c) => c.matchScore === bestScore);

    if (bestScore >= 80 && topCandidates.length === 1) {
      console.info(`   ✅ Match único encontrado (score=${bestScore}%)`);
      return { type: 'UNIQUE', match: topCandidates[0]! };
    }

    // Si hay entre 1 y 5 candidatos viables, devolver para selección manual
    if (viableCandidates.length <= 5) {
      console.info(
        `   ⚠️  ${viableCandidates.length} candidatos ambiguos - requiere selección manual`
      );
      return { type: 'AMBIGUOUS', candidates: viableCandidates };
    }

    // Si hay más de 5 candidatos viables, tomar solo top 5
    console.warn(`   ⚠️  Demasiados candidatos (${viableCandidates.length}) - mostrando top 5`);
    return { type: 'AMBIGUOUS', candidates: viableCandidates.slice(0, 5) };
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
