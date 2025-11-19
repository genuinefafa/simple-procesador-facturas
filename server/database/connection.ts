/**
 * Manejo de conexión a la base de datos SQLite
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path a la base de datos (relativo al proyecto)
const DB_PATH = join(__dirname, '../../data/database.sqlite');

let db: Database.Database | null = null;

/**
 * Obtiene la conexión a la base de datos (singleton)
 * @returns Instancia de la base de datos
 */
export function getDatabase(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    // Habilitar foreign keys
    db.pragma('foreign_keys = ON');
    // Optimizaciones para performance
    db.pragma('journal_mode = WAL');
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
  const schemaPath = join(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  db.exec(schema);
}
