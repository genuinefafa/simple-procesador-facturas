/**
 * API endpoint para buscar expected invoices con scoring
 * GET /api/expected-invoices/search?cuit=...&type=...&pointOfSale=...&invoiceNumber=...&date=...&total=...&limit=...
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ExpectedInvoiceRepository } from '@server/database/repositories/expected-invoice.js';

export const GET: RequestHandler = async ({ url }) => {
  console.info('🔍 [EXPECTED] Buscando candidatos con scoring...');

  try {
    const cuit = url.searchParams.get('cuit') || undefined;
    const invoiceType = url.searchParams.get('type');
    const pointOfSale = url.searchParams.get('pointOfSale');
    const invoiceNumber = url.searchParams.get('invoiceNumber');
    const issueDate = url.searchParams.get('date') || undefined;
    const total = url.searchParams.get('total');
    const limit = url.searchParams.get('limit');

    const repo = new ExpectedInvoiceRepository();
    const candidates = await repo.findPartialMatches({
      cuit,
      invoiceType: invoiceType ? parseInt(invoiceType, 10) : undefined,
      pointOfSale: pointOfSale ? parseInt(pointOfSale, 10) : undefined,
      invoiceNumber: invoiceNumber ? parseInt(invoiceNumber, 10) : undefined,
      issueDate,
      total: total ? parseFloat(total) : undefined,
      limit: limit ? parseInt(limit, 10) : 10,
    });

    console.info(`✅ [EXPECTED] Encontrados ${candidates.length} candidatos`);

    return json({
      success: true,
      candidates: candidates.map((c) => ({
        id: c.id,
        cuit: c.cuit,
        emitterName: c.emitterName,
        issueDate: c.issueDate,
        invoiceType: c.invoiceType,
        pointOfSale: c.pointOfSale,
        invoiceNumber: c.invoiceNumber,
        total: c.total,
        categoryId: c.categoryId,
        matchScore: c.matchScore,
        matchedFields: c.matchedFields,
      })),
    });
  } catch (error) {
    console.error('❌ [EXPECTED] Error en búsqueda:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
};
