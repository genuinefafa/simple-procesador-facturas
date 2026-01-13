/**
 * API endpoint para procesar facturas subidas
 * Usa el nuevo modelo files + file_extraction_results
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { join } from 'path';
import { InvoiceProcessingService } from '@server/services/invoice-processing.service.js';
import { FileRepository } from '@server/database/repositories/file.js';
import { FileExtractionRepository } from '@server/database/repositories/file-extraction.js';

export const POST: RequestHandler = async ({ request }) => {
  console.info('⚙️  [PROCESS] Iniciando procesamiento de facturas...');

  try {
    const body: unknown = await request.json();
    const { fileIds } = body as {
      fileIds?: number[];
    };

    console.info(`⚙️  [PROCESS] Files a procesar: ${fileIds?.length || 0}`);

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      console.warn('⚠️  [PROCESS] No se recibió array de fileIds');
      return json({ success: false, error: 'Se requiere un array de fileIds' }, { status: 400 });
    }

    const fileRepo = new FileRepository();
    const extractionRepo = new FileExtractionRepository();
    const processingService = new InvoiceProcessingService();

    // Cargar files desde BD
    const filesPromises = fileIds.map((id) => fileRepo.findById(id));
    const filesResults = await Promise.all(filesPromises);
    const files = filesResults.filter((f) => f !== null);

    if (files.length === 0) {
      return json({ success: false, error: 'No se encontraron archivos' }, { status: 404 });
    }

    console.info('⚙️  [PROCESS] Service inicializado, procesando...');

    const results = [];
    let processedCount = 0;
    let pendingCount = 0;
    let failedCount = 0;

    for (const file of files) {
      console.info(`📝 Procesando file ID ${file.id}: ${file.originalFilename}`);

      // Resolver ruta absoluta
      const absolutePath = file.storagePath.startsWith('/')
        ? file.storagePath
        : join(process.cwd(), '..', 'data', file.storagePath);

      // Intentar procesar usando el MISMO servicio que upload
      const result = await processingService.processInvoice(absolutePath, file.originalFilename);

      // Actualizar/crear file_extraction_results con datos extraídos
      if (result.extractedData) {
        console.info(`💾 Actualizando datos extraídos para file ${file.id}`);

        // Verificar si ya existe extraction result
        const existingExtraction = extractionRepo.findByFileId(file.id);

        if (existingExtraction) {
          // Actualizar existente
          extractionRepo.update(existingExtraction.id, {
            extractedCuit: result.extractedData.cuit || null,
            extractedDate: result.extractedData.date || null,
            extractedTotal: result.extractedData.total || null,
            extractedType: result.extractedData.invoiceType || null,
            extractedPointOfSale: result.extractedData.pointOfSale || null,
            extractedInvoiceNumber: result.extractedData.invoiceNumber || null,
            confidence: result.confidence || null,
            method: (result.method || 'OCR') as
              | 'TEMPLATE'
              | 'GENERICO'
              | 'MANUAL'
              | 'PDF_TEXT'
              | 'OCR'
              | 'PDF_TEXT+OCR',
            errors: result.error || null,
          });
        } else {
          // Crear nuevo
          extractionRepo.create({
            fileId: file.id,
            extractedCuit: result.extractedData.cuit || null,
            extractedDate: result.extractedData.date || null,
            extractedTotal: result.extractedData.total || null,
            extractedType: result.extractedData.invoiceType || null,
            extractedPointOfSale: result.extractedData.pointOfSale || null,
            extractedInvoiceNumber: result.extractedData.invoiceNumber || null,
            confidence: result.confidence || null,
            method: (result.method || 'OCR') as
              | 'TEMPLATE'
              | 'GENERICO'
              | 'MANUAL'
              | 'PDF_TEXT'
              | 'OCR'
              | 'PDF_TEXT+OCR',
            errors: result.error || null,
          });
        }
      }

      // Si procesamiento exitoso con confianza >= 80%
      if (result.success && result.invoice && result.confidence >= 80) {
        console.info(
          `✅ Procesamiento exitoso (conf: ${result.confidence}%), vinculando con factura ${result.invoice.id}`
        );
        await fileRepo.updateStatus(file.id, 'processed');
        processedCount++;
      } else if (result.requiresReview) {
        // Requiere revisión manual
        console.info(`⚠️  Requiere revisión manual (conf: ${result.confidence}%)`);
        await fileRepo.updateStatus(file.id, 'uploaded');
        pendingCount++;
      } else {
        // Falló completamente
        console.warn(`❌ Procesamiento falló: ${result.error}`);
        // Mantener en uploaded para poder reintentar
        failedCount++;
      }

      results.push({
        fileId: file.id,
        success: result.success,
        fileName: file.originalFilename,
        invoice: result.invoice
          ? {
              id: result.invoice.id,
              emitterCuit: result.invoice.emitterCuit,
              invoiceType: result.invoice.invoiceType,
              fullInvoiceNumber: result.invoice.fullInvoiceNumber,
              total: result.invoice.total,
              issueDate: result.invoice.issueDate,
              extractionConfidence: result.invoice.extractionConfidence,
              requiresReview: result.invoice.requiresReview,
            }
          : null,
        error: result.error,
        requiresReview: result.requiresReview,
        confidence: result.confidence,
        extractedData: result.extractedData,
      });
    }

    // Estadísticas del procesamiento
    const stats = {
      total: results.length,
      processed: processedCount,
      pending: pendingCount,
      failed: failedCount,
    };

    console.info(
      `✅ [PROCESS] Completado: ${stats.processed} procesadas, ${stats.pending} pendientes, ${stats.failed} fallidas`
    );

    return json({
      success: true,
      message: `Procesadas ${stats.processed}/${stats.total} facturas. ${stats.pending} requieren revisión.`,
      stats,
      results,
    });
  } catch (error) {
    console.error('❌ [PROCESS] Error:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
};
