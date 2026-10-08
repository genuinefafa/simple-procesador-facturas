/**
 * Recalcula el status de expected_invoices y files a partir de los vínculos (#203).
 *
 * El status de una esperada se deriva de las facturas que la apuntan (ver
 * ExpectedInvoiceRepository.computeStatus); el de un archivo, de si tiene
 * factura. Algunos caminos (imports, vínculos manuales viejos) lo dejaban
 * desactualizado. Idempotente: se puede correr después de cada import.
 *
 * Uso:
 *   bun run db:refresh-status              # dry-run: muestra qué cambiaría
 *   bun run db:refresh-status -- --fix     # aplica los cambios
 *
 * Respeta DB_PATH (para correr contra una copia o dentro del container).
 */

import { sql } from 'drizzle-orm';
import { getDb, DB_PATH } from '../database/db.js';
import { expectedInvoices } from '../database/schema.js';
import { ExpectedInvoiceRepository } from '../database/repositories/expected-invoice.js';

const isDryRun = !process.argv.includes('--fix');

async function main(): Promise<void> {
  console.info(`📁 DB: ${DB_PATH}`);
  console.info(isDryRun ? '🔍 Dry-run (usar --fix para aplicar)\n' : '✏️  Aplicando cambios\n');

  const repo = new ExpectedInvoiceRepository();
  const rows = await getDb()
    .select({ id: expectedInvoices.id, status: expectedInvoices.status })
    .from(expectedInvoices);

  // 1. Expected invoices
  const transitions = new Map<string, number>();
  for (const row of rows) {
    const computed = await repo.computeStatus(row.id);
    if (computed === row.status) continue;
    const key = `${row.status ?? 'null'} → ${computed}`;
    transitions.set(key, (transitions.get(key) ?? 0) + 1);
    console.info(`   expected #${row.id}: ${key}`);
    if (!isDryRun) await repo.refreshStatus(row.id);
  }

  // 2. Files: processed ⇔ has an invoice
  const fileFixes = getDb().all<{ id: number; status: string; computed: string }>(sql`
    SELECT f.id, f.status,
           CASE WHEN EXISTS (SELECT 1 FROM facturas fa WHERE fa.file_id = f.id)
                THEN 'processed' ELSE 'uploaded' END AS computed
    FROM files f
    WHERE f.status != computed
  `);
  for (const f of fileFixes) {
    console.info(`   file #${f.id}: ${f.status} → ${f.computed}`);
    if (!isDryRun) {
      getDb().run(sql`UPDATE files SET status = ${f.computed} WHERE id = ${f.id}`);
    }
  }

  console.info(`\n📊 Esperadas revisadas: ${rows.length}`);
  if (transitions.size === 0) console.info('   Sin cambios de status');
  for (const [key, n] of transitions) console.info(`   ${key}: ${n}`);
  console.info(`📊 Archivos con status a corregir: ${fileFixes.length}`);
  if (isDryRun && (transitions.size > 0 || fileFixes.length > 0)) {
    console.info('\n💡 Correr con --fix para aplicar');
  }
}

main().catch((error: unknown) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
