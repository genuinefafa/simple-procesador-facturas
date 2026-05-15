/**
 * Script para ejecutar migraciones de Drizzle v1
 */

import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { getDb } from '../database/db.js';
import { join } from 'path';

console.info('🚀 Ejecutando migraciones...\n');

try {
  const migrationsPath = join(import.meta.dirname, '..', 'database', 'migrations');
  console.info(`📁 Carpeta de migraciones: ${migrationsPath}`);

  // Ejecutar migraciones de Drizzle v1
  migrate(getDb(), { migrationsFolder: migrationsPath });

  console.info('\n✨ Migraciones completadas exitosamente!');
} catch (error) {
  console.error('\n❌ Error al ejecutar migraciones:', error);
  process.exit(1);
}
