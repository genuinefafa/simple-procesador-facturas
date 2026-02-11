/**
 * Conexión a la base de datos con Drizzle ORM
 *
 * Soporta modo TEST mediante variable de entorno NODE_ENV=test
 * que usa database.test.sqlite en lugar de database.sqlite
 *
 * La conexión se inicializa de forma lazy (al primer uso) para
 * evitar abrir la DB durante el build SSR de Vite.
 */

import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import * as schema from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Determinar qué DB usar según NODE_ENV
const isTestMode = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
const dbFilename = isTestMode ? 'database.test.sqlite' : 'database.sqlite';
const DB_PATH = join(__dirname, '..', '..', 'data', dbFilename);

// Lazy-initialized singletons
let _sqlite: Database.Database | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

/**
 * Get the raw SQLite connection (lazy-initialized).
 */
export function getRawDb(): Database.Database {
  if (!_sqlite) {
    // Crear directorio data/ si no existe
    const dataDir = join(__dirname, '..', '..', 'data');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    _sqlite = new Database(DB_PATH);
    _sqlite.pragma('foreign_keys = ON');
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
