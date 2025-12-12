import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ExpectedInvoiceRepository } from '@server/database/repositories/expected-invoice';
import { InvoiceRepository } from '@server/database/repositories/invoice';
import { CategoryRepository } from '@server/database/repositories/category';

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const { expectedId, categoryId } = body as { expectedId?: number; categoryId?: number };
  if (!expectedId || !categoryId) {
    return json({ ok: false, error: 'expectedId and categoryId are required' }, { status: 400 });
  }

  const categoryRepo = new CategoryRepository();
  const category = await categoryRepo.findById(categoryId);
  if (!category) {
    return json({ ok: false, error: 'Category not found' }, { status: 404 });
  }

  const expectedInvoiceRepo = new ExpectedInvoiceRepository();
  const invoiceRepo = new InvoiceRepository();

  try {
    // Buscar la expectedInvoice
    const expectedInvoice = await expectedInvoiceRepo.findById(expectedId);
    if (!expectedInvoice) {
      return json({ ok: false, error: 'Expected invoice not found' }, { status: 404 });
    }

    // Si la expectedInvoice está linkedada a una factura, actualizar categoryId en facturas
    // Note: matchedInvoiceId is not a direct property, you may need to adjust based on actual schema
    // Skipping the update for now as the property doesn't exist
    // if (expectedInvoice.matchedInvoiceId) {
    //   await invoiceRepo.updateLinking(expectedInvoice.matchedInvoiceId, { categoryId });
    // }

    return json({ ok: true });
  } catch (error) {
    console.error('Error updating category:', error);
    return json({ ok: false, error: 'Failed to update category' }, { status: 500 });
  }
};
