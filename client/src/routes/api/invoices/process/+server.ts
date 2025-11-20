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
      pendingFileIds: number[];
    };

    console.info(`⚙️  [PROCESS] Archivos a procesar: ${pendingFileIds?.length || 0}`);

    if (!pendingFileIds || !Array.isArray(pendingFileIds) || pendingFileIds.length === 0) {
      console.warn('⚠️  [PROCESS] No se recibió array de IDs de archivos pendientes');
      return json(
        { success: false, error: 'Se requiere un array de IDs de archivos pendientes' },
        { status: 400 }
      );
    }

    const pendingFileRepo = new PendingFileRepository();
    const processingService = new InvoiceProcessingService();
    console.info('⚙️  [PROCESS] Service inicializado, procesando...');

    // Obtener los pending files de la BD
    const pendingFiles = pendingFileIds
      .map((id) => pendingFileRepo.findById(id))
      .filter((pf) => pf !== null);

    if (pendingFiles.length === 0) {
      console.warn('⚠️  [PROCESS] No se encontraron archivos pendientes válidos');
      return json({ success: false, error: 'No se encontraron archivos válidos' }, { status: 404 });
    }

    pendingFiles.forEach((pf, i) => {
      console.info(`  ${i + 1}. ${pf!.originalFilename} -> ${pf!.filePath}`);
    });

    // Procesar cada archivo
    const results = [];
    for (const pendingFile of pendingFiles) {
      const result = await processingService.processInvoice(
        pendingFile!.filePath,
        pendingFile!.originalFilename
      );

      // Actualizar pending_file con datos extraídos
      const errors: string[] = [];
      if (result.error) {
        errors.push(result.error);
      }

      pendingFileRepo.updateExtractedData(pendingFile!.id, {
        extractedCuit: result.extractedData?.cuit,
        extractedDate: result.extractedData?.date,
        extractedTotal: result.extractedData?.total,
        extractedType: result.extractedData?.invoiceType,
        extractedPointOfSale: result.extractedData?.pointOfSale,
        extractedInvoiceNumber: result.extractedData?.invoiceNumber,
        extractionConfidence: result.confidence,
        extractionErrors: errors.length > 0 ? errors : undefined,
      });

      // Si el procesamiento fue exitoso, vincular con la factura
      if (result.success && result.invoice) {
        pendingFileRepo.linkToInvoice(pendingFile!.id, result.invoice.id);
        console.info(`✅ [PROCESS] Archivo procesado y vinculado: ${pendingFile!.originalFilename}`);
      } else {
        // Marcar como reviewing si requiere revisión
        if (result.requiresReview) {
          pendingFileRepo.updateStatus(pendingFile!.id, 'reviewing');
        }
        console.warn(`⚠️  [PROCESS] Archivo requiere revisión: ${pendingFile!.originalFilename}`);
      }

      results.push(result);
    }

    console.info(`⚙️  [PROCESS] Resultados:`);
    results.forEach((r, i) => {
      const status = r.success ? '✅' : '❌';
      const fileName = pendingFiles[i]?.originalFilename || 'unknown';
      console.info(`  ${status} ${fileName}: ${r.success ? `OK (conf: ${r.confidence}%)` : r.error}`);
    });

    // Estadísticas del procesamiento
    const stats = {
      total: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      requireReview: results.filter((r) => r.requiresReview).length,
    };

    console.info(`✅ [PROCESS] Completado: ${stats.successful}/${stats.total} exitosas`);

    return json({
      success: true,
      message: `Procesadas ${stats.successful}/${stats.total} facturas`,
      stats,
      results: results.map((r, i) => ({
        success: r.success,
        fileName: pendingFiles[i]?.originalFilename,
        pendingFileId: pendingFiles[i]?.id,
        invoice: r.invoice
          ? {
              id: r.invoice.id,
              emitterCuit: r.invoice.emitterCuit,
              invoiceType: r.invoice.invoiceType,
              fullInvoiceNumber: r.invoice.fullInvoiceNumber,
              total: r.invoice.total,
              issueDate: r.invoice.issueDate,
              extractionConfidence: r.invoice.extractionConfidence,
              requiresReview: r.invoice.requiresReview,
            }
          : null,
        error: r.error,
        requiresReview: r.requiresReview,
        confidence: r.confidence,
        extractedData: r.extractedData,
      })),
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
