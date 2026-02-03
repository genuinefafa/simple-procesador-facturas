/**
 * API endpoint para procesar facturas subidas
 * Usa el nuevo modelo files + file_extraction_results
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { join } from 'path';
import {
  createInvoiceProcessingService,
  getFileRepository,
  getFileExtractionRepository,
} from '@server/factories';

export const POST: RequestHandler = async ({ request }) => {
  console.info('⚙️  [PROCESS] Iniciando procesamiento de facturas...');

  try {
    const body: unknown = await request.json();
    const { fileIds, method } = body as {
      fileIds?: number[];
      method?: 'ocr' | 'pdf_text' | 'qr';
    };

    console.info(
      `⚙️  [PROCESS] Files a procesar: ${fileIds?.length || 0}, método: ${method || 'auto'}`
    );

    // Mapear método del frontend al formato del backend
    const methodMap: Record<string, 'OCR' | 'PDF_TEXT' | 'QR'> = {
      ocr: 'OCR',
      pdf_text: 'PDF_TEXT',
      qr: 'QR',
    };
    const forcedMethod = method ? methodMap[method] : undefined;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      console.warn('⚠️  [PROCESS] No se recibió array de fileIds');
      return json({ success: false, error: 'Se requiere un array de fileIds' }, { status: 400 });
    }

    const fileRepo = getFileRepository();
    const extractionRepo = getFileExtractionRepository();
    const processingService = createInvoiceProcessingService();

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
      // Si hay método forzado, pasarlo al servicio
      const result = await processingService.processInvoice(absolutePath, file.originalFilename, {
        forceMethod: forcedMethod,
      });

      // Upsert file_extraction_results by method
      // This allows multiple extractions per file (one per method)
      if (result.extractedData) {
        const extractionMethod = result.method || 'OCR';
        console.info(`💾 Guardando extracción [${extractionMethod}] para file ${file.id}`);

        extractionRepo.upsertByMethod(file.id, extractionMethod, {
          extractedCuit: result.extractedData.cuit || null,
          extractedDate: result.extractedData.date || null,
          extractedTotal: result.extractedData.total || null,
          extractedType: result.extractedData.invoiceType || null,
          extractedPointOfSale: result.extractedData.pointOfSale || null,
          extractedInvoiceNumber: result.extractedData.invoiceNumber || null,
          confidence: result.confidence || null,
          errors: result.error || null,
        });
      }

      // Extracción exitosa con alta confianza — archivo listo para revisión del usuario
      if (result.success && result.confidence >= 80) {
        console.info(`✅ Extracción exitosa (conf: ${result.confidence}%) — listo para revisión`);
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
