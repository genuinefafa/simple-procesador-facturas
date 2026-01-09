/**
 * Conexión a la base de datos con Drizzle ORM
 *
 * Soporta modo TEST mediante variable de entorno NODE_ENV=test
 * que usa database.test.sqlite en lugar de database.sqlite
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

// Crear directorio data/ si no existe
const dataDir = join(__dirname, '..', '..', 'data');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

// Crear conexión SQLite
const sqlite = new Database(DB_PATH);

// Habilitar foreign keys (importante para SQLite)
sqlite.pragma('foreign_keys = ON');

// Crear instancia de Drizzle
export const db = drizzle(sqlite, { schema });

// Exportar también la conexión SQLite pura para casos especiales
export const rawDb: Database.Database = sqlite;

// Exportar ruta de DB para scripts que necesiten acceder directamente
export { DB_PATH };

// Helper para cerrar la conexión (útil en tests)
export function closeDb(): void {
  sqlite.close();
}
