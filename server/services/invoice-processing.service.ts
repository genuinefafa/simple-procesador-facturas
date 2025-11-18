/**
 * Servicio de procesamiento de facturas
 * Encapsula toda la lógica de extracción y guardado
 */

import { PDFExtractor } from '../extractors/pdf-extractor.js';
import { validateCUIT, normalizeCUIT, getPersonType } from '../validators/cuit.js';
import { EmitterRepository } from '../database/repositories/emitter.js';
import { InvoiceRepository } from '../database/repositories/invoice.js';
import { format } from 'date-fns';
import type { Invoice } from '../utils/types.js';

export interface ProcessingResult {
  success: boolean;
  invoice?: Invoice;
  error?: string;
  requiresReview: boolean;
  confidence: number;
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
  private emitterRepo: EmitterRepository;
  private invoiceRepo: InvoiceRepository;

  constructor() {
    this.pdfExtractor = new PDFExtractor();
    this.emitterRepo = new EmitterRepository();
    this.invoiceRepo = new InvoiceRepository();
  }

  /**
   * Procesa un archivo de factura
   * @param filePath - Ruta al archivo
   * @param fileName - Nombre del archivo original
   * @returns Resultado del procesamiento
   */
  async processInvoice(filePath: string, fileName: string): Promise<ProcessingResult> {
    try {
      // 1. Extraer información del PDF
      const extraction = await this.pdfExtractor.extract(filePath);

      if (!extraction.success || !extraction.data) {
        return {
          success: false,
          error: 'No se pudo extraer información del archivo',
          requiresReview: true,
          confidence: 0,
        };
      }

      const data = extraction.data;
      const confidence = extraction.confidence || 0;

      // 2. Validar CUIT
      if (!data.cuit || !validateCUIT(data.cuit)) {
        return {
          success: false,
          error: 'CUIT inválido o no encontrado',
          requiresReview: true,
          confidence,
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

      // 3. Buscar o crear emisor
      let emitter = this.emitterRepo.findByCUIT(normalizedCuit);

      if (!emitter) {
        const cuitNumeric = normalizedCuit.replace(/-/g, '');
        const personType = getPersonType(normalizedCuit);

        emitter = this.emitterRepo.create({
          cuit: normalizedCuit,
          cuitNumerico: cuitNumeric,
          nombre: `Emisor ${normalizedCuit}`,
          aliases: JSON.stringify([]),
          tipoPersona: personType,
        });
      }

      // 4. Validar datos requeridos
      if (!data.invoiceType || data.pointOfSale === undefined || data.invoiceNumber === undefined) {
        return {
          success: false,
          error: 'Faltan datos obligatorios de la factura',
          requiresReview: true,
          confidence,
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

      const existing = this.invoiceRepo.findByEmitterAndNumber(
        normalizedCuit,
        data.invoiceType,
        data.pointOfSale,
        data.invoiceNumber
      );

      if (existing) {
        return {
          success: false,
          error: 'Esta factura ya fue procesada',
          requiresReview: false,
          confidence,
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

      // 7. Crear factura en BD
      const invoice = this.invoiceRepo.create({
        emitterCuit: normalizedCuit,
        issueDate: formattedDate,
        invoiceType: data.invoiceType,
        pointOfSale: data.pointOfSale,
        invoiceNumber: data.invoiceNumber,
        fullInvoiceNumber,
        total: data.total,
        currency: 'ARS',
        originalFile: fileName,
        processedFile: fileName, // Se actualizará cuando se renombre
        fileType: 'PDF_DIGITAL',
        extractionMethod: 'GENERICO',
        extractionConfidence: confidence,
        requiresReview: confidence < 80,
      });

      return {
        success: true,
        invoice,
        requiresReview: confidence < 80,
        confidence,
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
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
        requiresReview: true,
        confidence: 0,
      };
    }
  }

  /**
   * Procesa múltiples archivos
   * @param files - Array de {path, name}
   * @returns Array de resultados
   */
  async processBatch(files: Array<{ path: string; name: string }>): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];

    for (const file of files) {
      const result = await this.processInvoice(file.path, file.name);
      results.push(result);
    }

    return results;
  }
}
