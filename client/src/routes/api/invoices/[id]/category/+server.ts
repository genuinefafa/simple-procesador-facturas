import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { InvoiceRepository } from '@server/database/repositories/invoice';
import { CategoryRepository } from '@server/database/repositories/category';

export const POST: RequestHandler = async ({ params, request }) => {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return json({ ok: false, error: 'Invalid invoice id' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const { categoryId } = body as { categoryId?: number | null };
  if (categoryId === undefined) {
    return json({ ok: false, error: 'categoryId is required' }, { status: 400 });
  }

  const categoryRepo = new CategoryRepository();
  if (categoryId !== null) {
    const cat = await categoryRepo.findById(categoryId);
    if (!cat) return json({ ok: false, error: 'Category not found' }, { status: 404 });
  }

  const invoiceRepo = new InvoiceRepository();
  try {
    const updated = await invoiceRepo.updateLinking(id, { categoryId: categoryId ?? null });
    if (!updated) return json({ ok: false, error: 'Invoice not found' }, { status: 404 });
    return json({ ok: true, invoiceId: updated.id, categoryId: updated.categoryId ?? null });
  } catch (e) {
    console.error('Error updating invoice category', e);
    return json({ ok: false, error: 'Failed to update category' }, { status: 500 });
  }
};
