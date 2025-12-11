import { json } from '@sveltejs/kit';
import { ExpectedInvoiceRepository } from '@server/database/repositories/expected-invoice';
import { CategoryRepository } from '@server/database/repositories/category';

export async function POST({ request }) {
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
  try {
    expectedInvoiceRepo.updateCategory(expectedId, categoryId);
    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, error: 'Expected invoice not found' }, { status: 404 });
  }
}
