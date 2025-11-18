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
    console.log(`\n🔧 [SERVICE] Procesando archivo: ${fileName}`);
    console.log(`   📂 Ruta: ${filePath}`);

    try {
      // 1. Extraer información del PDF
      console.log(`   📄 Extrayendo datos del PDF...`);
      const extraction = await this.pdfExtractor.extract(filePath);
      console.log(`   📊 Extracción completada - Éxito: ${extraction.success}, Confianza: ${extraction.confidence}%`);

      if (!extraction.success || !extraction.data) {
        console.log(`   ❌ Extracción falló: No se pudo extraer información`);
        return {
          success: false,
          error: 'No se pudo extraer información del archivo',
          requiresReview: true,
          confidence: 0,
        };
      }

      const data = extraction.data;
      const confidence = extraction.confidence || 0;

      console.log(`   📋 Datos extraídos:`);
      console.log(`      CUIT: ${data.cuit || 'N/A'}`);
      console.log(`      Fecha: ${data.date || 'N/A'}`);
      console.log(`      Total: ${data.total || 'N/A'}`);
      console.log(`      Tipo: ${data.invoiceType || 'N/A'}`);
      console.log(`      Punto Venta: ${data.pointOfSale || 'N/A'}`);
      console.log(`      Número: ${data.invoiceNumber || 'N/A'}`);

      // 2. Validar CUIT
      console.log(`   🔍 Validando CUIT...`);
      if (!data.cuit || !validateCUIT(data.cuit)) {
        console.log(`   ❌ CUIT inválido o no encontrado: ${data.cuit}`);
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
      console.log(`   ✅ CUIT válido: ${normalizedCuit}`);

      // 3. Buscar o crear emisor
      console.log(`   🏢 Buscando emisor...`);
      let emitter = this.emitterRepo.findByCUIT(normalizedCuit);

      if (!emitter) {
        console.log(`   ➕ Emisor no existe, creando nuevo...`);
        const cuitNumeric = normalizedCuit.replace(/-/g, '');
        const personType = getPersonType(normalizedCuit);

        emitter = this.emitterRepo.create({
          cuit: normalizedCuit,
          cuitNumeric: cuitNumeric,
          name: `Emisor ${normalizedCuit}`,
          aliases: [],
          personType: personType,
        });
        console.log(`   ✅ Emisor creado: ${emitter.name}`);
      } else {
        console.log(`   ✅ Emisor encontrado: ${emitter.name}`);
      }

      // 4. Validar datos requeridos
      console.log(`   🔍 Validando datos obligatorios...`);
      if (!data.invoiceType || data.pointOfSale === undefined || data.invoiceNumber === undefined) {
        console.log(`   ❌ Faltan datos obligatorios:`);
        console.log(`      Tipo: ${data.invoiceType || 'FALTA'}`);
        console.log(`      Punto Venta: ${data.pointOfSale !== undefined ? data.pointOfSale : 'FALTA'}`);
        console.log(`      Número: ${data.invoiceNumber !== undefined ? data.invoiceNumber : 'FALTA'}`);
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
      console.log(`   🔍 Verificando duplicados: ${fullInvoiceNumber}`);

      const existing = this.invoiceRepo.findByEmitterAndNumber(
        normalizedCuit,
        data.invoiceType,
        data.pointOfSale,
        data.invoiceNumber
      );

      if (existing) {
        console.log(`   ⚠️  Factura duplicada - ya existe en BD`);
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
      console.log(`   📅 Fecha formateada: ${formattedDate}`);

      // 7. Crear factura en BD
      console.log(`   💾 Guardando factura en base de datos...`);
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

      console.log(`   ✅ Factura guardada exitosamente - ID: ${invoice.id}`);
      console.log(`   📊 Requiere revisión: ${confidence < 80 ? 'SÍ' : 'NO'} (confianza: ${confidence}%)`);

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
      console.log(`   ❌ Error durante procesamiento: ${error instanceof Error ? error.message : 'Error desconocido'}`);
      if (error instanceof Error && error.stack) {
        console.log(`   Stack trace:`, error.stack);
      }
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
    console.log(`\n🚀 [SERVICE] Iniciando procesamiento de ${files.length} archivo(s)`);
    const results: ProcessingResult[] = [];

    for (const file of files) {
      const result = await this.processInvoice(file.path, file.name);
      results.push(result);
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    console.log(`\n📊 [SERVICE] Resumen del procesamiento:`);
    console.log(`   ✅ Exitosas: ${successful}`);
    console.log(`   ❌ Fallidas: ${failed}`);
    console.log(`   📝 Total: ${results.length}\n`);

    return results;
  }
}
