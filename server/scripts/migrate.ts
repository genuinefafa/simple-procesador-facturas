/**
 * Script para ejecutar migraciones de Drizzle + triggers/views
 */

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db, rawDb } from '../database/db.js';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.info('🚀 Ejecutando migraciones...\n');

try {
  // Paths
  const migrationsPath = join(__dirname, '..', 'database', 'migrations');
  const journalPath = join(migrationsPath, 'meta', '_journal.json');

  // Cargar journal para mapear timestamp→nombre de migración
  const journal = JSON.parse(readFileSync(journalPath, 'utf-8'));

  // Leer hashes aplicados desde __drizzle_migrations
  let appliedMigrations: string[] = [];
  try {
    const rows = rawDb
      .prepare('SELECT hash, created_at FROM "__drizzle_migrations" ORDER BY created_at ASC')
      .all() as Array<{ hash: string; created_at: number }>;

    // Mapear timestamps a nombres de migración usando el journal
    for (const row of rows) {
      const entry = journal.entries.find((e: any) => e.when === row.created_at);
      if (entry) {
        appliedMigrations.push(entry.tag);
      }
    }

    console.info('📋 Migraciones ya aplicadas:');
    if (appliedMigrations.length > 0) {
      appliedMigrations.forEach((m) => console.info(`   ✓ ${m}`));
    } else {
      console.info('   (ninguna)');
    }
  } catch {
    console.info('📋 Base de datos nueva - sin migraciones previas');
    appliedMigrations = [];
  }

  // Listar todas las migraciones disponibles (archivos .sql)
  const availableMigrations = readdirSync(migrationsPath)
    .filter((f) => f.endsWith('.sql') && !f.includes('post-migration'))
    .sort();

  console.info('\n📦 Migraciones disponibles:');
  availableMigrations.forEach((m) => {
    const tag = m.replace(/\.sql$/, '');
    const isApplied = appliedMigrations.includes(tag);
    const status = isApplied ? '✓ Ya aplicada' : '⏳ Pendiente';
    console.info(`   ${status}: ${m}`);
  });

  // 1. Ejecutar migraciones de Drizzle
  console.info('\n🔄 Aplicando migraciones de Drizzle...');
  const migrationsFolderAbs = join(__dirname, '..', 'database', 'migrations');
  console.info(`   ↪️ Carpeta de migraciones: ${migrationsFolderAbs}`);
  migrate(db, { migrationsFolder: migrationsFolderAbs });

  // Leer migraciones aplicadas desde BD tras ejecutar migrator
  let newAppliedMigrations: string[] = [];
  try {
    const rowsAfter = rawDb
      .prepare('SELECT hash, created_at FROM "__drizzle_migrations" ORDER BY created_at ASC')
      .all() as Array<{ hash: string; created_at: number }>;

    for (const row of rowsAfter) {
      const entry = journal.entries.find((e: any) => e.when === row.created_at);
      if (entry) {
        newAppliedMigrations.push(entry.tag);
      }
    }
  } catch {
    newAppliedMigrations = [];
  }
  const justApplied = newAppliedMigrations.filter((m: string) => !appliedMigrations.includes(m));

  if (justApplied.length > 0) {
    console.info('✅ Migraciones aplicadas en esta ejecución:');
    justApplied.forEach((m: string) => console.info(`   ✓ ${m}`));
  } else {
    console.info('ℹ️ No se aplicaron nuevas migraciones (estado ya al día)');
  }

  // Sin fallback manual: confiar en migrator de Drizzle para aplicar y registrar

  // 2. Ejecutar post-migration.sql (triggers y views)
  console.info('\n🔧 Aplicando triggers y views...');
  const postMigrationPath = join(migrationsPath, 'post-migration.sql');
  const postMigrationSQL = readFileSync(postMigrationPath, 'utf-8');
  rawDb.exec(postMigrationSQL);
  console.info('✅ Triggers y views aplicados');

  // 2.b Asegurar columnas de linking en facturas (antes en 0005), idempotente
  console.info('\n🔗 Verificando columnas de linking en facturas...');
  const cols = rawDb.prepare('PRAGMA table_info(facturas)').all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  const addColumn = (sql: string, label: string) => {
    try {
      rawDb.exec(sql);
      console.info(`   ✓ Añadida columna ${label}`);
    } catch (e) {
      console.warn(
        `   ⚠️  No se añadió ${label} (posible existencia previa): ${(e as Error).message}`
      );
    }
  };
  if (!names.has('expected_invoice_id')) {
    addColumn(
      'ALTER TABLE `facturas` ADD `expected_invoice_id` integer REFERENCES expected_invoices(id) ON DELETE SET NULL;',
      'expected_invoice_id'
    );
  }
  if (!names.has('pending_file_id')) {
    addColumn(
      'ALTER TABLE `facturas` ADD `pending_file_id` integer REFERENCES pending_files(id) ON DELETE SET NULL;',
      'pending_file_id'
    );
  }
  if (!names.has('category_id')) {
    addColumn(
      'ALTER TABLE `facturas` ADD `category_id` integer REFERENCES categories(id) ON DELETE SET NULL;',
      'category_id'
    );
  }
  console.info('✅ Columnas de linking verificadas');

  // Resumen final
  console.info('\n' + '='.repeat(60));
  console.info('✨ Migraciones completadas exitosamente!');
  console.info('='.repeat(60));
  console.info(`📊 Total de migraciones en la BD: ${newAppliedMigrations.length}`);
  console.info(`🆕 Aplicadas en esta ejecución: ${justApplied.length}`);
  console.info('='.repeat(60) + '\n');
} catch (error) {
  console.error('\n' + '='.repeat(60));
  console.error('❌ Error al ejecutar migraciones:', error);
  console.error('='.repeat(60) + '\n');
  process.exit(1);
}
