/**
 * API endpoint para reprocesar un pending file
 * Útil cuando se modifica el algoritmo de extracción o parámetros
 */

import type { RequestHandler } from "./$types";
import { json } from "@sveltejs/kit";
import { PendingFileRepository } from "@server/database/repositories/pending-file.js";
import { InvoiceProcessingService } from "@server/services/invoice-processing.service.js";

export const POST: RequestHandler = async ({ params }) => {
  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return json({ error: "ID inválido" }, { status: 400 });
    }

    const pendingFileRepo = new PendingFileRepository();
    const pendingFile = pendingFileRepo.findById(id);

    if (!pendingFile) {
      return json({ error: "Archivo no encontrado" }, { status: 404 });
    }

    console.info(
      `🔄 [REPROCESS] Reprocesando archivo ID ${id}: ${pendingFile.originalFilename}`,
    );

    // Volver a procesar el archivo con el algoritmo actual
    const processingService = new InvoiceProcessingService();
    const result = await processingService.processInvoice(
      pendingFile.filePath,
      pendingFile.originalFilename,
    );

    // Actualizar datos extraídos en la BD
    const updated = pendingFileRepo.updateExtractedData(id, {
      extractedCuit: result.extractedData?.cuit,
      extractedDate: result.extractedData?.date,
      extractedTotal: result.extractedData?.total,
      extractedType: result.extractedData?.invoiceType,
      extractedPointOfSale: result.extractedData?.pointOfSale,
      extractedInvoiceNumber: result.extractedData?.invoiceNumber,
      extractionConfidence: result.confidence,
      extractionMethod: result.method, // Usar method directamente de ProcessingResult
      extractionErrors: result.error ? [result.error] : undefined,
    });

    // Volver a pending para que se pueda revisar
    pendingFileRepo.updateStatus(id, "pending");

    if (!updated) {
      return json({ error: "Error al actualizar archivo" }, { status: 500 });
    }

    console.info(
      `✅ [REPROCESS] Archivo reprocesado exitosamente (conf: ${result.confidence}%)`,
    );

    return json({
      success: true,
      pendingFile: updated,
      extraction: result,
    });
  } catch (error) {
    console.error("❌ [REPROCESS] Error reprocesando archivo:", error);
    return json(
      {
        error: "Error al reprocesar archivo",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 },
    );
  }
};
