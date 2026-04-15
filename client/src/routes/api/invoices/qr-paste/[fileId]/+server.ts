/**
 * POST /api/invoices/qr-paste/:fileId
 *
 * Fallback manual para cuando zxing-wasm no puede decodificar el QR pero el
 * usuario sí pudo leerlo con otro scanner (iOS Vision, Android, etc) y tiene
 * la URL AFIP/ARCA en el portapapeles.
 *
 * Persiste el resultado como una extracción QR normal (method=QR, confidence=100
 * si todos los campos están presentes), quedando indistinguible de un QR
 * decodificado automáticamente.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { QrPasteSchema, formatZodError } from '@server/contracts';
import { extractFromAFIPUrl } from '@server/extractors/qr-extractor';
import { getFileRepository, getFileExtractionRepository } from '@server/factories';

export const POST: RequestHandler = async ({ params, request }) => {
  const fileId = parseInt(params.fileId, 10);
  if (isNaN(fileId)) {
    return json({ success: false, error: 'ID de archivo inválido' }, { status: 400 });
  }

  const body: unknown = await request.json();
  const parsed = QrPasteSchema.safeParse(body);
  if (!parsed.success) {
    return json(formatZodError(parsed.error), { status: 400 });
  }

  const fileRepo = getFileRepository();
  const file = await fileRepo.findById(fileId);
  if (!file) {
    return json({ success: false, error: 'Archivo no encontrado' }, { status: 404 });
  }

  const result = extractFromAFIPUrl(parsed.data.qrUrl);
  if (!result.success) {
    return json(
      { success: false, error: result.errors?.[0] || 'URL de QR AFIP/ARCA inválida' },
      { status: 400 }
    );
  }

  const extractionRepo = getFileExtractionRepository();
  extractionRepo.upsertByMethod(fileId, 'QR', {
    extractedCuit: result.data.cuit || null,
    extractedDate: result.data.date || null,
    extractedTotal: result.data.total ?? null,
    extractedType: result.data.invoiceType ?? null,
    extractedPointOfSale: result.data.pointOfSale ?? null,
    extractedInvoiceNumber: result.data.invoiceNumber ?? null,
    confidence: result.confidence,
    errors: null,
  });

  console.info(`✅ [QR-PASTE] file ${fileId}: extracción persistida (conf ${result.confidence}%)`);

  return json({
    success: true,
    extraction: {
      confidence: result.confidence,
      data: result.data,
    },
  });
};
