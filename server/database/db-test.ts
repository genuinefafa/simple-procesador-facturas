/**
 * Utilidades para base de datos de TEST
 *
 * IMPORTANTE: db.ts automáticamente usa database.test.sqlite cuando
 * se ejecutan tests (detecta VITEST=true). Este módulo solo provee
 * funciones helper para migrar/resetear/limpiar la DB de test.
 */

import { join } from 'path';
import { existsSync, rmSync } from 'fs';
import { getDb, getRawDb, closeDb } from './db.js';

// Ruta a la base de datos de TEST (siempre relativa al fuente; no acepta DB_PATH env)
const TEST_DB_PATH = join(import.meta.dirname, '..', '..', 'data', 'database.test.sqlite');

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
  getRawDb().exec('PRAGMA foreign_keys = OFF');

  // Obtener todas las tablas
  const tables = getRawDb()
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];

  // Truncar cada tabla
  for (const table of tables) {
    getRawDb().prepare(`DELETE FROM ${table.name}`).run();
  }

  // Resetear autoincrement (solo si la tabla existe)
  // sqlite_sequence solo existe si se ha usado AUTOINCREMENT al menos una vez
  const sqliteSequenceExists = getRawDb()
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'")
    .get();
  if (sqliteSequenceExists) {
    getRawDb().prepare('DELETE FROM sqlite_sequence').run();
  }

  // Reactivar foreign keys
  getRawDb().exec('PRAGMA foreign_keys = ON');
}

/**
 * Ejecutar migraciones en la DB de test
 * Solo corre si la DB está vacía o no tiene las tablas necesarias
 */
export async function runTestMigrations(): Promise<void> {
  const { migrate } = await import('drizzle-orm/bun-sqlite/migrator');
  const { readFileSync } = await import('fs');
  const path = await import('path');

  // Verificar si ya existen las tablas principales
  const tables = getRawDb()
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='facturas'")
    .all() as { name: string }[];

  if (tables.length > 0) {
    console.log('✅ DB de test ya tiene schema, saltando migraciones');
    return;
  }

  const migrationsPath = path.join(import.meta.dirname, 'migrations');

  console.log('🔧 Ejecutando migraciones en DB de test...');
  console.log(`   DB Path: ${TEST_DB_PATH}`);
  console.log(`   Migrations Path: ${migrationsPath}`);

  // Ejecutar migraciones de Drizzle
  migrate(getDb(), { migrationsFolder: migrationsPath });

  // Ejecutar post-migration.sql (triggers y views) si existe
  const postMigrationPath = path.join(migrationsPath, 'post-migration.sql');
  if (existsSync(postMigrationPath)) {
    const postMigrationSQL = readFileSync(postMigrationPath, 'utf-8');
    getRawDb().exec(postMigrationSQL);
    console.log('✅ Migraciones + post-migration completadas');
  } else {
    console.log('✅ Migraciones completadas (sin post-migration.sql)');
  }
}
