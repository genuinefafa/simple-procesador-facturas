import { json } from '@sveltejs/kit';
import Database from 'better-sqlite3';
import path from 'node:path';

export async function GET() {
  const rootDir = path.join(process.cwd(), '..');
  const dbPath = path.join(rootDir, 'data', 'database.sqlite');
  const db = new Database(dbPath);
  const rows = db
    .prepare(
      `SELECT id, key, description, active FROM categories WHERE active = 1 ORDER BY description`
    )
    .all() as Array<{ id: number; key: string; description: string; active: number }>;
  return json({ items: rows });
}
