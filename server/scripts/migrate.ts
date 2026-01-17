/**
 * Script para ejecutar migraciones de Drizzle v1
 */

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from '../database/db.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.info('🚀 Ejecutando migraciones...\n');

try {
  const migrationsPath = join(__dirname, '..', 'database', 'migrations');
  console.info(`📁 Carpeta de migraciones: ${migrationsPath}`);

  // Ejecutar migraciones de Drizzle v1
  migrate(db, { migrationsFolder: migrationsPath });

  console.info('\n✨ Migraciones completadas exitosamente!');
} catch (error) {
  console.error('\n❌ Error al ejecutar migraciones:', error);
  process.exit(1);
}
