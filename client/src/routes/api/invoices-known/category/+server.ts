import { json } from '@sveltejs/kit';
import Database from 'better-sqlite3';
import path from 'node:path';

export async function POST({ request }) {
  const body = await request.json().catch(() => ({}));
  const { expectedId, categoryId } = body as { expectedId?: number; categoryId?: number };
  if (!expectedId || !categoryId) {
    return json({ ok: false, error: 'expectedId and categoryId are required' }, { status: 400 });
  }

  const dbPath = path.resolve('data/database.sqlite');
  const db = new Database(dbPath);

  const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId);
  if (!category) {
    return json({ ok: false, error: 'Category not found' }, { status: 404 });
  }

  const stmt = db.prepare('UPDATE expected_invoices SET category_id = ? WHERE id = ?');
  const res = stmt.run(categoryId, expectedId);
  if (res.changes === 0) {
    return json({ ok: false, error: 'Expected invoice not found' }, { status: 404 });
  }
  return json({ ok: true });
}
