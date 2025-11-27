/**
 * API endpoint para procesar facturas subidas
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { InvoiceProcessingService } from '@server/services/invoice-processing.service.js';
import { PendingFileRepository } from '@server/database/repositories/pending-file.js';

export const POST: RequestHandler = async ({ request }) => {
  console.info('⚙️  [PROCESS] Iniciando procesamiento de facturas...');

  try {
    const body: unknown = await request.json();
    const { pendingFileIds } = body as {
      pendingFileIds?: number[];
    };

    console.info(`⚙️  [PROCESS] Pending files a procesar: ${pendingFileIds?.length || 0}`);

    if (!pendingFileIds || !Array.isArray(pendingFileIds) || pendingFileIds.length === 0) {
      console.warn('⚠️  [PROCESS] No se recibió array de pendingFileIds');
      return json(
        { success: false, error: 'Se requiere un array de pendingFileIds' },
        { status: 400 }
      );
    }

    const pendingFileRepo = new PendingFileRepository();
    const processingService = new InvoiceProcessingService();

    // Cargar pending files desde BD
    const pendingFiles = pendingFileIds
      .map((id) => pendingFileRepo.findById(id))
      .filter((pf) => pf !== null);

    if (pendingFiles.length === 0) {
      return json(
        { success: false, error: 'No se encontraron archivos pendientes' },
        { status: 404 }
      );
    }

    console.info('⚙️  [PROCESS] Service inicializado, procesando...');

    const results = [];
    let processedCount = 0;
    let pendingCount = 0;
    let failedCount = 0;

    for (const pendingFile of pendingFiles) {
      console.info(
        `📝 Procesando pending file ID ${pendingFile.id}: ${pendingFile.originalFilename}`
      );

      // Intentar procesar
      const result = await processingService.processInvoice(
        pendingFile.filePath,
        pendingFile.originalFilename
      );

      // Actualizar pending_file con datos extraídos
      if (result.extractedData) {
        console.info(`💾 Actualizando datos extraídos en pending file ${pendingFile.id}`);
        pendingFileRepo.updateExtractedData(pendingFile.id, {
          extractedCuit: result.extractedData.cuit,
          extractedDate: result.extractedData.date,
          extractedTotal: result.extractedData.total,
          extractedType: result.extractedData.invoiceType,
          extractedPointOfSale: result.extractedData.pointOfSale,
          extractedInvoiceNumber: result.extractedData.invoiceNumber,
          extractionConfidence: result.confidence,
          extractionErrors: result.error ? [result.error] : undefined,
        });
      }

      // Si procesamiento exitoso con confianza >= 80%
      if (result.success && result.invoice && result.confidence >= 80) {
        console.info(
          `✅ Procesamiento exitoso (conf: ${result.confidence}%), vinculando con factura ${result.invoice.id}`
        );
        pendingFileRepo.linkToInvoice(pendingFile.id, result.invoice.id);
        processedCount++;
      } else if (result.requiresReview) {
        // Requiere revisión manual
        console.info(`⚠️  Requiere revisión manual (conf: ${result.confidence}%)`);
        pendingFileRepo.updateStatus(pendingFile.id, 'pending');
        pendingCount++;
      } else {
        // Falló completamente
        console.warn(`❌ Procesamiento falló: ${result.error}`);
        pendingFileRepo.updateStatus(pendingFile.id, 'failed');
        failedCount++;
      }

      results.push({
        pendingFileId: pendingFile.id,
        success: result.success,
        fileName: pendingFile.originalFilename,
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
