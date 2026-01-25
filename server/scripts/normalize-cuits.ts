/**
 * Script para normalizar CUITs en la base de datos al formato canónico (11 dígitos sin guiones)
 *
 * Este script actualiza:
 * - expected_invoices.cuit
 * - file_extraction_results.extracted_cuit
 *
 * NO modifica:
 * - emisores.cuit (es la PK con formato XX-XXXXXXXX-X por compatibilidad)
 * - emisores.cuit_numerico (ya está en formato canónico)
 * - facturas.emisor_cuit (FK a emisores.cuit)
 *
 * Uso: npx tsx server/scripts/normalize-cuits.ts [--dry-run]
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, '..', '..', 'data', 'database.sqlite');

if (!existsSync(DB_PATH)) {
  console.error('❌ La base de datos no existe. Ejecutá primero: npm run db:init');
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');

if (dryRun) {
  console.info('🔍 Modo DRY-RUN: solo se mostrarán los cambios, no se aplicarán\n');
}

const db = new Database(DB_PATH);

interface CuitRow {
  id: number;
  cuit: string;
}

interface ExtractionRow {
  id: number;
  extractedCuit: string;
}

/**
 * Normaliza un CUIT al formato canónico (11 dígitos sin guiones)
 */
function normalizeCuit(cuit: string): string {
  return cuit.replace(/\D/g, '');
}

/**
 * Verifica si un CUIT ya está en formato canónico
 */
function isCanonical(cuit: string): boolean {
  return /^\d{11}$/.test(cuit);
}

console.info('='.repeat(60));
console.info('  Normalización de CUITs al formato canónico');
console.info('  Formato canónico: 11 dígitos sin guiones (ej: 30710578296)');
console.info('='.repeat(60));
console.info('');

// 1. Normalizar expected_invoices.cuit
console.info('📋 Procesando expected_invoices...');
const expectedRows = db
  .prepare('SELECT id, cuit FROM expected_invoices WHERE cuit IS NOT NULL')
  .all() as CuitRow[];

let expectedUpdated = 0;
let expectedSkipped = 0;

for (const row of expectedRows) {
  if (isCanonical(row.cuit)) {
    expectedSkipped++;
    continue;
  }

  const normalized = normalizeCuit(row.cuit);

  if (normalized.length !== 11) {
    console.warn(`   ⚠️  ID ${row.id}: CUIT inválido (no tiene 11 dígitos): ${row.cuit}`);
    continue;
  }

  if (dryRun) {
    console.info(`   📝 ID ${row.id}: ${row.cuit} → ${normalized}`);
  } else {
    db.prepare('UPDATE expected_invoices SET cuit = ? WHERE id = ?').run(normalized, row.id);
  }
  expectedUpdated++;
}

console.info(`   ✅ ${expectedUpdated} actualizados, ${expectedSkipped} ya normalizados`);
console.info('');

// 2. Normalizar file_extraction_results.extracted_cuit
console.info('📋 Procesando file_extraction_results...');
const extractionRows = db
  .prepare(
    'SELECT id, extracted_cuit as extractedCuit FROM file_extraction_results WHERE extracted_cuit IS NOT NULL'
  )
  .all() as ExtractionRow[];

let extractionUpdated = 0;
let extractionSkipped = 0;

for (const row of extractionRows) {
  if (isCanonical(row.extractedCuit)) {
    extractionSkipped++;
    continue;
  }

  const normalized = normalizeCuit(row.extractedCuit);

  if (normalized.length !== 11) {
    console.warn(`   ⚠️  ID ${row.id}: CUIT inválido (no tiene 11 dígitos): ${row.extractedCuit}`);
    continue;
  }

  if (dryRun) {
    console.info(`   📝 ID ${row.id}: ${row.extractedCuit} → ${normalized}`);
  } else {
    db.prepare('UPDATE file_extraction_results SET extracted_cuit = ? WHERE id = ?').run(
      normalized,
      row.id
    );
  }
  extractionUpdated++;
}

console.info(`   ✅ ${extractionUpdated} actualizados, ${extractionSkipped} ya normalizados`);
console.info('');

// 3. Resumen
console.info('='.repeat(60));
console.info('  RESUMEN');
console.info('='.repeat(60));
console.info(`  expected_invoices:       ${expectedUpdated} actualizados`);
console.info(`  file_extraction_results: ${extractionUpdated} actualizados`);
console.info('');

if (dryRun) {
  console.info('💡 Para aplicar los cambios, ejecutá sin --dry-run');
} else {
  console.info('✅ Cambios aplicados correctamente');
}

db.close();
