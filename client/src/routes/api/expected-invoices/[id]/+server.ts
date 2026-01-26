/**
 * API endpoint para operaciones sobre una expected invoice específica
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ExpectedInvoiceRepository } from '@server/database/repositories/expected-invoice.js';
import { ExpectedInvoicePatchSchema, formatZodError } from '@server/contracts/index.js';

/**
 * GET /api/expected-invoices/:id
 * Obtener detalle de una expected invoice
 */
export const GET: RequestHandler = async ({ params }) => {
  console.info(`📋 [EXPECTED] Obteniendo expected invoice ID ${params.id}...`);

  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return json({ success: false, error: 'ID inválido' }, { status: 400 });
    }

    const repo = new ExpectedInvoiceRepository();
    const invoice = await repo.findById(id);

    if (!invoice) {
      return json({ success: false, error: 'Expected invoice no encontrada' }, { status: 404 });
    }

    console.info(
      `✅ [EXPECTED] Encontrada: ${invoice.cuit} ${invoice.pointOfSale}-${invoice.invoiceNumber}`
    );

    return json({
      success: true,
      invoice,
    });
  } catch (error) {
    console.error('❌ [EXPECTED] Error:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
};

/**
 * PATCH /api/expected-invoices/:id
 * Actualizar propiedades de una expected invoice (ej: categoryId, notes, status)
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
  console.info(`📝 [EXPECTED] Actualizando expected invoice ID ${params.id}...`);

  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return json({ success: false, error: 'ID inválido' }, { status: 400 });
    }

    const repo = new ExpectedInvoiceRepository();
    const existing = await repo.findById(id);

    if (!existing) {
      return json({ success: false, error: 'Expected invoice no encontrada' }, { status: 404 });
    }

    const body = await request.json();

    // Validate with Zod schema
    const parseResult = ExpectedInvoicePatchSchema.safeParse(body);
    if (!parseResult.success) {
      return json(formatZodError(parseResult.error), { status: 400 });
    }

    const updates = parseResult.data;

    // Actualizar categoryId si viene en el body
    if (updates.categoryId !== undefined) {
      await repo.updateCategory(id, updates.categoryId);
      console.info(`✅ [EXPECTED] Categoría actualizada para expected invoice ${id}`);
    }

    // Actualizar otros campos editables
    const otherUpdates: Record<string, string | number | null> = {};
    if (updates.notes !== undefined) otherUpdates.notes = updates.notes;
    if (updates.emitterName !== undefined) otherUpdates.emitterName = updates.emitterName;
    if (updates.total !== undefined) otherUpdates.total = updates.total;

    if (Object.keys(otherUpdates).length > 0) {
      await repo.updateInvoice(id, otherUpdates as any);
    }

    // Obtener el registro actualizado
    const updated = await repo.findById(id);

    return json({
      success: true,
      invoice: updated,
    });
  } catch (error) {
    console.error('❌ [EXPECTED] Error:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
};
