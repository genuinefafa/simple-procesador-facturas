/**
 * API endpoint para procesar un pending file por primera vez
 * Similar a reprocess pero sin comprobar si ya fue procesado
 */

import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { PendingFileRepository } from '@server/database/repositories/pending-file.js';
import { InvoiceProcessingService } from '@server/services/invoice-processing.service.js';

export const POST: RequestHandler = async ({ params }) => {
  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return json({ error: 'ID inválido' }, { status: 400 });
    }

    const pendingFileRepo = new PendingFileRepository();
    const pendingFile = await pendingFileRepo.findById(id);

    if (!pendingFile) {
      return json({ error: 'Archivo no encontrado' }, { status: 404 });
    }

    if (pendingFile.status === 'processed') {
      return json(
        {
          error: 'Este archivo ya fue procesado. Use /reprocess para reprocesar.',
        },
        { status: 400 }
      );
    }

    console.info(`▶️  [PROCESS] Procesando archivo ID ${id}: ${pendingFile.originalFilename}`);

    // Procesar el archivo
    const processingService = new InvoiceProcessingService();
    const result = await processingService.processInvoice(
      pendingFile.filePath,
      pendingFile.originalFilename
    );

    // Actualizar datos extraídos en la BD
    const updated = await pendingFileRepo.updateExtractedData(id, {
      extractedCuit: result.extractedData?.cuit,
      extractedDate: result.extractedData?.date,
      extractedTotal: result.extractedData?.total,
      extractedType: result.extractedData?.invoiceType,
      extractedPointOfSale: result.extractedData?.pointOfSale,
      extractedInvoiceNumber: result.extractedData?.invoiceNumber,
      extractionConfidence: result.confidence,
      extractionMethod: result.method,
      extractionErrors: result.error ? [result.error] : undefined,
    });

    // Cambiar a reviewing para que se pueda revisar
    await pendingFileRepo.updateStatus(id, 'reviewing');

    if (!updated) {
      return json({ error: 'Error al actualizar archivo' }, { status: 500 });
    }

    console.info(`✅ [PROCESS] Archivo procesado exitosamente (conf: ${result.confidence}%)`);

    return json({
      success: true,
      id: id,
      pendingFile: updated,
      extraction: result,
    });
  } catch (error) {
    console.error('❌ [PROCESS] Error procesando archivo:', error);
    return json(
      {
        error: 'Error al procesar archivo',
        details: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
};
