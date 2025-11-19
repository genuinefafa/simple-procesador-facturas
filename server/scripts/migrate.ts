/**
 * Script para ejecutar migraciones de Drizzle + triggers/views
 */

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db, rawDb } from '../database/db.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.info('🚀 Ejecutando migraciones...');

try {
  // 1. Ejecutar migraciones de Drizzle
  console.info('📦 Aplicando migraciones de Drizzle...');
  migrate(db, { migrationsFolder: './database/migrations' });
  console.info('✅ Migraciones de Drizzle aplicadas');

  // 2. Ejecutar post-migration.sql (triggers y views)
  console.info('🔧 Aplicando triggers y views...');
  const postMigrationPath = join(__dirname, '..', 'database', 'migrations', 'post-migration.sql');
  const postMigrationSQL = readFileSync(postMigrationPath, 'utf-8');
  rawDb.exec(postMigrationSQL);
  console.info('✅ Triggers y views aplicados');

  console.info('\n✨ Migraciones completadas exitosamente!');
} catch (error) {
  console.error('❌ Error al ejecutar migraciones:', error);
  process.exit(1);
}
