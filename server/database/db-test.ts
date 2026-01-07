/**
 * Utilidades para base de datos de TEST
 *
 * IMPORTANTE: db.ts automáticamente usa database.test.sqlite cuando
 * se ejecutan tests (detecta VITEST=true). Este módulo solo provee
 * funciones helper para migrar/resetear/limpiar la DB de test.
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, rmSync } from 'fs';
import { db, rawDb, closeDb } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ruta a la base de datos de TEST
const TEST_DB_PATH = join(__dirname, '..', '..', 'data', 'database.test.sqlite');

/**
 * Cerrar y eliminar base de datos de test
 */
export function cleanupTestDb(): void {
  closeDb();

  // Eliminar archivo de DB de test
  if (existsSync(TEST_DB_PATH)) {
    rmSync(TEST_DB_PATH, { force: true });
  }
}

/**
 * Resetear todas las tablas (limpiar datos pero mantener schema)
 */
export function resetTestDb(): void {
  // Desactivar foreign keys temporalmente para truncar
  rawDb.pragma('foreign_keys = OFF');

  // Obtener todas las tablas
  const tables = rawDb
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];

  // Truncar cada tabla
  for (const table of tables) {
    rawDb.prepare(`DELETE FROM ${table.name}`).run();
  }

  // Resetear autoincrement
  rawDb.prepare('DELETE FROM sqlite_sequence').run();

  // Reactivar foreign keys
  rawDb.pragma('foreign_keys = ON');
}

/**
 * Ejecutar migraciones en la DB de test
 * Solo corre si la DB está vacía o no tiene las tablas necesarias
 */
export async function runTestMigrations(): Promise<void> {
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
  const { readFileSync } = await import('fs');
  const path = await import('path');

  // Verificar si ya existen las tablas principales
  const tables = rawDb
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='facturas'")
    .all() as { name: string }[];

  if (tables.length > 0) {
    console.log('✅ DB de test ya tiene schema, saltando migraciones');
    return;
  }

  const migrationsPath = path.join(__dirname, 'migrations');

  console.log('🔧 Ejecutando migraciones en DB de test...');
  console.log(`   DB Path: ${TEST_DB_PATH}`);
  console.log(`   Migrations Path: ${migrationsPath}`);

  // Ejecutar migraciones de Drizzle
  migrate(db, { migrationsFolder: migrationsPath });

  // Ejecutar post-migration.sql (triggers y views)
  const postMigrationPath = path.join(migrationsPath, 'post-migration.sql');
  const postMigrationSQL = readFileSync(postMigrationPath, 'utf-8');
  rawDb.exec(postMigrationSQL);

  console.log('✅ Migraciones completadas');
}
