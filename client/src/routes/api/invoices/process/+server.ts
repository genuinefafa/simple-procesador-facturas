/**
 * API endpoint para procesar facturas subidas
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { InvoiceProcessingService } from '@server/services/invoice-processing.service.js';

export const POST: RequestHandler = async ({ request }) => {
  console.info('⚙️  [PROCESS] Iniciando procesamiento de facturas...');

  try {
    const body: unknown = await request.json();
    const { files } = body as {
      files: Array<{ name: string; path: string }>;
    };

    console.info(`⚙️  [PROCESS] Archivos a procesar: ${files?.length || 0}`);

    if (!files || !Array.isArray(files) || files.length === 0) {
      console.warn('⚠️  [PROCESS] No se recibió array de archivos');
      return json({ success: false, error: 'Se requiere un array de archivos' }, { status: 400 });
    }

    files.forEach((f, i) => {
      console.info(`  ${i + 1}. ${f.name} -> ${f.path}`);
    });

    const processingService = new InvoiceProcessingService();
    console.info('⚙️  [PROCESS] Service inicializado, procesando...');

    const results = await processingService.processBatch(files);

    console.info(`⚙️  [PROCESS] Resultados:`);
    results.forEach((r, i) => {
      const status = r.success ? '✅' : '❌';
      console.info(`  ${status} ${files[i]?.name}: ${r.success ? `OK (conf: ${r.confidence}%)` : r.error}`);
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
      results: results.map((r) => ({
        success: r.success,
        fileName: files.find((f) => f.path === r.invoice?.originalFile)?.name,
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
