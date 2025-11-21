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
  // Leer estado actual de migraciones
  const migrationsPath = join(__dirname, '..', 'database', 'migrations');
  const journalPath = join(migrationsPath, 'meta', '_journal.json');

  let appliedMigrations: string[] = [];
  try {
    const journal = JSON.parse(readFileSync(journalPath, 'utf-8'));
    appliedMigrations = journal.entries.map((e: any) => e.tag);
    console.info('📋 Migraciones ya aplicadas:');
    if (appliedMigrations.length > 0) {
      appliedMigrations.forEach((m) => console.info(`   ✓ ${m}`));
    } else {
      console.info('   (ninguna)');
    }
  } catch {
    console.info('📋 Base de datos nueva - sin migraciones previas');
  }

  // Listar todas las migraciones disponibles
  const availableMigrations = readdirSync(migrationsPath)
    .filter((f) => f.endsWith('.sql') && !f.includes('post-migration'))
    .sort();

  console.info('\n📦 Migraciones disponibles:');
  availableMigrations.forEach((m) => {
    const isApplied = appliedMigrations.some((am) => m.startsWith(am.split('_')[0]));
    const status = isApplied ? '✓ Ya aplicada' : '⏳ Pendiente';
    console.info(`   ${status}: ${m}`);
  });

  // 1. Ejecutar migraciones de Drizzle
  console.info('\n🔄 Aplicando migraciones de Drizzle...');
  migrate(db, { migrationsFolder: './database/migrations' });

  // Leer journal actualizado
  const updatedJournal = JSON.parse(readFileSync(journalPath, 'utf-8'));
  const newAppliedMigrations = updatedJournal.entries.map((e: any) => e.tag);
  const justApplied = newAppliedMigrations.filter((m: string) => !appliedMigrations.includes(m));

  if (justApplied.length > 0) {
    console.info('✅ Nuevas migraciones aplicadas:');
    justApplied.forEach((m: string) => console.info(`   ✓ ${m}`));
  } else {
    console.info('✅ No había migraciones nuevas para aplicar');
  }

  // 2. Ejecutar post-migration.sql (triggers y views)
  console.info('\n🔧 Aplicando triggers y views...');
  const postMigrationPath = join(migrationsPath, 'post-migration.sql');
  const postMigrationSQL = readFileSync(postMigrationPath, 'utf-8');
  rawDb.exec(postMigrationSQL);
  console.info('✅ Triggers y views aplicados');

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
