/**
 * Conexión a la base de datos con Drizzle ORM
 */

import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import * as schema from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ruta a la base de datos
const DB_PATH = join(__dirname, '..', '..', 'data', 'database.sqlite');

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

// Helper para cerrar la conexión (útil en tests)
export function closeDb(): void {
  sqlite.close();
}
