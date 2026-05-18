/**
 * Conexión a la base de datos con Drizzle ORM
 *
 * Soporta modo TEST mediante variable de entorno NODE_ENV=test
 * que usa database.test.sqlite en lugar de database.sqlite
 *
 * La conexión se inicializa de forma lazy (al primer uso) para
 * evitar abrir la DB durante el build SSR de Vite.
 */

import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import * as schema from './schema.js';

const isTestMode = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
const dbFilename = isTestMode ? 'database.test.sqlite' : 'database.sqlite';
const defaultDbPath = join(import.meta.dirname, '..', '..', 'data', dbFilename);
const DB_PATH = !isTestMode && process.env.DB_PATH ? process.env.DB_PATH : defaultDbPath;

// Lazy-initialized singletons
let _sqlite: Database | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

/**
 * Get the raw SQLite connection (lazy-initialized).
 */
export function getRawDb(): Database {
  if (!_sqlite) {
    // Crear directorio data/ si no existe
    const dataDir = join(import.meta.dirname, '..', '..', 'data');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    _sqlite = new Database(DB_PATH);
    _sqlite.exec('PRAGMA foreign_keys = ON');
  }
  return _sqlite;
}

/**
 * Get the Drizzle ORM instance (lazy-initialized).
 */
export function getDb() {
  if (!_db) {
    _db = drizzle({ client: getRawDb(), schema });
  }
  return _db;
}

// Exportar ruta de DB para scripts que necesiten acceder directamente
export { DB_PATH };

// Helper para cerrar la conexión (útil en tests)
export function closeDb(): void {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
  }
}
