/**
 * Manejo de conexión a la base de datos SQLite
 */

import { Database } from 'bun:sqlite';
import { readFileSync } from 'fs';
import { join } from 'path';

const isTestMode = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
const defaultDbPath = join(import.meta.dirname, '../../data/database.sqlite');
const DB_PATH = !isTestMode && process.env.DB_PATH ? process.env.DB_PATH : defaultDbPath;

let db: Database | null = null;

/**
 * Obtiene la conexión a la base de datos (singleton)
 * @returns Instancia de la base de datos
 */
export function getDatabase(): Database {
  if (!db) {
    db = new Database(DB_PATH);
    // Habilitar foreign keys
    db.exec('PRAGMA foreign_keys = ON');
    // Optimizaciones para performance
    db.exec('PRAGMA journal_mode = WAL');
  }
  return db;
}

/**
 * Cierra la conexión a la base de datos
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Ejecuta el schema SQL (útil para testing)
 */
export function initializeSchema(): void {
  const db = getDatabase();
  const schemaPath = join(import.meta.dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  db.exec(schema);
}
