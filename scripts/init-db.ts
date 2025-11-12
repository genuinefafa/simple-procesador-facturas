/**
 * Script para inicializar la base de datos SQLite
 * Crea el archivo database.sqlite y ejecuta el schema
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, '..', 'data', 'database.sqlite');
const SCHEMA_PATH = join(__dirname, '..', 'src', 'database', 'schema.sql');

console.info('🗄️  Inicializando base de datos...');

// Crear directorio data/ si no existe
const dataDir = join(__dirname, '..', 'data');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
  console.info('✅ Directorio data/ creado');
}

// Verificar si la DB ya existe
const dbExists = existsSync(DB_PATH);
if (dbExists) {
  console.warn('⚠️  La base de datos ya existe en:', DB_PATH);
  console.warn('⚠️  Si querés reinicializar, eliminá el archivo primero');
  process.exit(1);
}

try {
  // Crear conexión a la base de datos
  const db = new Database(DB_PATH);
  console.info('✅ Archivo de base de datos creado:', DB_PATH);

  // Leer el schema SQL
  const schema = readFileSync(SCHEMA_PATH, 'utf-8');

  // Ejecutar el schema (dividido por statements)
  db.exec(schema);
  console.info('✅ Schema ejecutado correctamente');

  // Verificar que las tablas se crearon
  const tables = db
    .prepare(
      `
    SELECT name FROM sqlite_master
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `
    )
    .all() as Array<{ name: string }>;

  console.info('\n📋 Tablas creadas:');
  tables.forEach((table) => {
    console.info(`   - ${table.name}`);
  });

  // Verificar que las vistas se crearon
  const views = db
    .prepare(
      `
    SELECT name FROM sqlite_master
    WHERE type='view'
    ORDER BY name
  `
    )
    .all() as Array<{ name: string }>;

  if (views.length > 0) {
    console.info('\n👁️  Vistas creadas:');
    views.forEach((view) => {
      console.info(`   - ${view.name}`);
    });
  }

  // Cerrar conexión
  db.close();

  console.info('\n✅ Base de datos inicializada exitosamente!');
  console.info('📍 Ubicación:', DB_PATH);
} catch (error) {
  console.error('❌ Error al inicializar la base de datos:', error);
  process.exit(1);
}
