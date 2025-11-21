/**
 * API endpoint para encontrar matches de expected_invoices para un pending file
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PendingFileRepository } from '@server/database/repositories/pending-file.js';
import { ExpectedInvoiceRepository } from '@server/database/repositories/expected-invoice.js';
import { normalizeCUIT } from '@server/validators/cuit.js';

/**
 * GET /api/pending-files/:id/matches
 * Buscar expected_invoices que matcheen con el archivo pendiente
 */
export const GET: RequestHandler = async ({ params }) => {
  console.info(`🔍 [MATCHES] Buscando matches para pending file ID ${params.id}...`);

  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return json({ success: false, error: 'ID inválido' }, { status: 400 });
    }

    const pendingFileRepo = new PendingFileRepository();
    const pendingFile = pendingFileRepo.findById(id);

    if (!pendingFile) {
      return json({ success: false, error: 'Archivo pendiente no encontrado' }, { status: 404 });
    }

    // Si no hay datos extraídos, no se pueden buscar matches
    if (
      !pendingFile.extractedCuit ||
      !pendingFile.extractedType ||
      pendingFile.extractedPointOfSale === null ||
      pendingFile.extractedInvoiceNumber === null
    ) {
      console.info('⚠️  [MATCHES] Datos insuficientes para buscar matches');
      return json({
        success: true,
        hasExactMatch: false,
        exactMatch: null,
        candidates: [],
        message: 'Datos insuficientes para buscar matches',
      });
    }

    const expectedInvoiceRepo = new ExpectedInvoiceRepository();
    const normalizedCuit = normalizeCUIT(pendingFile.extractedCuit);

    // 1. Buscar match exacto
    const exactMatch = expectedInvoiceRepo.findExactMatch({
      cuit: normalizedCuit,
      invoiceType: pendingFile.extractedType,
      pointOfSale: pendingFile.extractedPointOfSale,
      invoiceNumber: pendingFile.extractedInvoiceNumber,
    });

    if (exactMatch) {
      console.info('✅ [MATCHES] Match exacto encontrado:', exactMatch.id);
      return json({
        success: true,
        hasExactMatch: true,
        exactMatch,
        candidates: [],
      });
    }

    // 2. Si no hay match exacto, buscar candidatos por CUIT + fecha/monto
    const candidates = expectedInvoiceRepo.findCandidates({
      cuit: normalizedCuit,
      issueDate: pendingFile.extractedDate,
      total: pendingFile.extractedTotal,
      invoiceType: pendingFile.extractedType,
    });

    console.info(`🔍 [MATCHES] ${candidates.length} candidatos encontrados`);

    return json({
      success: true,
      hasExactMatch: false,
      exactMatch: null,
      candidates,
    });
  } catch (error) {
    console.error('❌ [MATCHES] Error:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
};
