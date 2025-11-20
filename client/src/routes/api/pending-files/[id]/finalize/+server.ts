/**
 * API endpoint para finalizar procesamiento de un archivo pendiente
 * POST /api/pending-files/:id/finalize
 * Intenta procesar nuevamente con datos actualizados por el usuario
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PendingFileRepository } from '@server/database/repositories/pending-file.js';
import { InvoiceProcessingService } from '@server/services/invoice-processing.service.js';

export const POST: RequestHandler = async ({ params }) => {
  console.info(`🔄 [PENDING-FILE-FINALIZE] Finalizando archivo ID=${params.id}...`);

  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return json({ success: false, error: 'ID inválido' }, { status: 400 });
    }

    const pendingFileRepo = new PendingFileRepository();

    // Verificar que existe
    const pendingFile = pendingFileRepo.findById(id);
    if (!pendingFile) {
      return json({ success: false, error: 'Archivo no encontrado' }, { status: 404 });
    }

    // No procesar si ya está procesado
    if (pendingFile.status === 'processed' && pendingFile.invoiceId) {
      return json(
        {
          success: false,
          error: 'El archivo ya fue procesado correctamente',
        },
        { status: 400 }
      );
    }

    console.info(`🔄 [PENDING-FILE-FINALIZE] Procesando: ${pendingFile.originalFilename}`);

    const processingService = new InvoiceProcessingService();
    const result = await processingService.processInvoice(
      pendingFile.filePath,
      pendingFile.originalFilename
    );

    // Actualizar pending_file con resultados
    const errors: string[] = [];
    if (result.error) {
      errors.push(result.error);
    }

    pendingFileRepo.updateExtractedData(id, {
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
      pendingFileRepo.linkToInvoice(id, result.invoice.id);
      console.info(`✅ [PENDING-FILE-FINALIZE] Archivo procesado y vinculado exitosamente`);

      return json({
        success: true,
        message: 'Archivo procesado correctamente',
        data: {
          pendingFile: pendingFileRepo.findById(id),
          invoice: result.invoice,
        },
      });
    } else {
      // Marcar como failed si hay error
      if (result.error) {
        pendingFileRepo.updateStatus(id, 'failed');
      } else if (result.requiresReview) {
        pendingFileRepo.updateStatus(id, 'reviewing');
      }

      console.warn(`⚠️  [PENDING-FILE-FINALIZE] Procesamiento falló: ${result.error}`);

      return json(
        {
          success: false,
          error: result.error || 'No se pudo procesar el archivo',
          requiresReview: result.requiresReview,
          confidence: result.confidence,
          extractedData: result.extractedData,
        },
        { status: 422 }
      );
    }
  } catch (error) {
    console.error('❌ [PENDING-FILE-FINALIZE] Error:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
};
