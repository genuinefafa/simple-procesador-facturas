/**
 * Script para poblar la base de datos con datos de prueba
 * Uso: npm run db:seed [table]
 * Opciones: categories | templates | emisores | facturas | all (default)
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, readFileSync, copyFileSync } from 'fs';

const defaultDbPath = join(import.meta.dirname, '..', '..', 'data', 'database.sqlite');
const DB_PATH = process.env.DB_PATH ?? defaultDbPath;

if (!existsSync(DB_PATH)) {
  console.error('❌ La base de datos no existe. Ejecutá primero: npm run db:init');
  process.exit(1);
}

// Parse CLI arguments
const args = process.argv.slice(2);
// Valid canonical table keys
const validTables = ['categories', 'templates', 'emisores', 'facturas', 'all'];
// Aliases mapping to canonical keys (supports Spanish forms and short names)
const aliasMap: Record<string, string> = {
  categorias: 'categories',
  categoria: 'categories',
  cats: 'categories',
  cat: 'categories',
  templates: 'templates',
  plantilla: 'templates',
  plantillas: 'templates',
  tmpl: 'templates',
  emisores: 'emisores',
  emisor: 'emisores',
  facturas: 'facturas',
  factura: 'facturas',
  all: 'all',
  todos: 'all',
};

function normalizeKey(key: string): string {
  const k = key.trim().toLowerCase();
  return aliasMap[k] ?? k;
}
const helpRequested = args.includes('--help') || args.includes('-h');
const forceRequested = args.includes('--force');
const dryRunRequested = args.includes('--dry-run');
// Accept --only=... and --tables=... as aliases
const onlyArg =
  args.find((a) => a.startsWith('--only=')) ?? args.find((a) => a.startsWith('--tables='));

// Validate unknown flags early for better UX
const allowedFlagPrefixes = ['--help', '-h', '--force', '--dry-run', '--only=', '--tables='];
const unknownFlags = args.filter(
  (a) => a.startsWith('--') && !allowedFlagPrefixes.some((p) => a.startsWith(p))
);
if (unknownFlags.length > 0) {
  console.error(`❌ Flags desconocidos: ${unknownFlags.join(', ')}`);
  console.error('   Válidos: --help, -h, --force, --dry-run, --only=lista, --tables=lista');
  process.exit(1);
}

// Detect positional arg explicitly and validate
const positionalArgs = args.filter((a) => !a.startsWith('--'));
let tableArg: string = 'all';
if (positionalArgs.length > 0) {
  const firstPositional = positionalArgs[0] ?? '';
  const normalizedPositional = normalizeKey(firstPositional);
  if (!validTables.includes(normalizedPositional)) {
    console.error(`❌ Tabla posicional inválida: ${firstPositional}`);
    console.error(
      `   Válidas: ${validTables.join(', ')} (alias: categorias, plantillas, emisores, facturas, todos)`
    );
    process.exit(1);
  }
  tableArg = normalizedPositional;
}

// Resolve selected tables
let onlyTables: string[] = [];
if (onlyArg) {
  // Inform when both positional and --only are provided
  if (positionalArgs.length > 0) {
    console.info(
      'ℹ️  Nota: --only tiene prioridad sobre el argumento posicional y se usará para la selección'
    );
  }
  const rawList = onlyArg
    .replace(/^--(only|tables)=/, '')
    // split by commas, semicolons, or whitespace
    .split(/[;,.\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const normalizedList = rawList.map((t) => normalizeKey(t));
  const unknownInOnly = normalizedList.filter((t) => !validTables.includes(t));
  if (unknownInOnly.length > 0) {
    console.error(`❌ Tablas inválidas en --only: ${unknownInOnly.join(', ')}`);
    console.error(
      `   Válidas: ${validTables.join(', ')} (alias: categorias, plantillas, emisores, facturas, todos)`
    );
    process.exit(1);
  }
  onlyTables = normalizedList.filter((t) => t !== 'all');
}

const selectedTables =
  onlyTables.length > 0
    ? onlyTables
    : tableArg !== 'all'
      ? [tableArg]
      : ['categories', 'templates', 'emisores', 'facturas'];

if (helpRequested) {
  console.info(
    'Script para poblar la base de datos desde archivos JSON en server/scripts/seed-data/',
    args
  );
  console.info('');
  console.info(
    'Uso: npm run db:seed [tabla] [-- --force] [-- --dry-run] [-- --only=lista] [-- --tables=lista]'
  );
  console.info('Tablas: categories | templates | emisores | facturas | all');
  console.info('Flags:');
  console.info(
    '  --force      Borra datos existentes de la(s) tabla(s) seleccionadas antes de poblar'
  );
  console.info('  --dry-run    Muestra las acciones que se ejecutarían sin modificar la base');
  console.info('  --only=...   Lista de tablas específica (override del argumento posicional)');
  console.info('  --tables=... Alias de --only');
  console.info('Separadores aceptados para listas: coma (,), punto y coma (;), o espacios');
  console.info(
    'Alias soportados: categorias→categories, plantillas→templates, emisores→emisores, facturas→facturas, todos→all'
  );
  process.exit(0);
}

if (!selectedTables.every((t) => validTables.includes(t))) {
  console.error(`❌ Parámetros inválidos: ${args.join(' ') || '(vacío)'}`);
  console.error(
    `   Opciones válidas: ${validTables.join(', ')} y flags --force, --dry-run, --only`
  );
  console.error('   Ejemplos:');
  console.error('     npm run db:seed');
  console.error('     npm run db:seed templates');
  console.error('     npm run db:seed facturas -- --force');
  console.error('     npm run db:seed -- --only=templates,emisores');
  console.error('     npm run db:seed templates -- --dry-run');
  process.exit(1);
}

console.info('🌱 Poblando base de datos con datos de prueba...', args);
console.info(
  `📋 Selección: ${selectedTables.join(', ')}${forceRequested ? ' (force)' : ''}${dryRunRequested ? ' (dry-run)' : ''}\n`
);

const db = new Database(DB_PATH);

// ===========================
// AUTO-COPY .example.json FILES
// ===========================

function ensureSeedFiles() {
  const seedDir = join(import.meta.dirname, 'seed-data');
  const tables = ['categories', 'templates', 'emisores', 'facturas'];

  for (const table of tables) {
    const examplePath = join(seedDir, `${table}.example.json`);
    const targetPath = join(seedDir, `${table}.json`);

    // If target doesn't exist but example does, copy it
    if (!existsSync(targetPath) && existsSync(examplePath)) {
      try {
        copyFileSync(examplePath, targetPath);
        console.info(`ℹ️  Copiado: ${table}.example.json → ${table}.json`);
      } catch (err) {
        console.warn(`⚠️  No se pudo copiar ${table}: ${err}`);
      }
    }
  }
}

// Ensure seed files exist before proceeding
ensureSeedFiles();

// ===========================
// SEEDING FUNCTIONS
// ===========================

function seedCategories() {
  console.info('🏷️  Cargando categorías desde categorias.json...');

  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const categoriesPath = join(import.meta.dirname, 'seed-data', 'categories.json');
  if (!existsSync(categoriesPath)) {
    console.info('ℹ️  Saltear: seed-data/categories.json no encontrado');
    return;
  }

  try {
    const raw = readFileSync(categoriesPath, 'utf-8');
    const parsed = JSON.parse(raw) as Array<{ key: string; description: string }>;
    const insertCategory = db.prepare(
      `INSERT OR IGNORE INTO categories (key, description, active) VALUES (?, ?, 1)`
    );

    let insertadas = 0;
    for (const cat of parsed) {
      if (!cat.key || !cat.description) continue;
      const result = insertCategory.run(cat.key, cat.description);
      if (result.changes > 0) insertadas++;
    }

    console.info(
      `✅ Categorías: ${insertadas} insertadas, ${parsed.length - insertadas} ya existían (total: ${parsed.length})`
    );
  } catch (error) {
    console.error('❌ Error leyendo categorias.json:', error);
  }
}

function seedTemplates() {
  console.info('📋 Creando templates de extracción...');

  const insertTemplate = db.prepare(`
    INSERT OR IGNORE INTO templates_extraccion (
      nombre, descripcion, categoria, tipo_documento, estrategia, config_extraccion
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  let insertadas = 0;
  const templatesPath = join(import.meta.dirname, 'seed-data', 'templates.json');
  if (!existsSync(templatesPath)) {
    console.info('ℹ️  Saltear: seed-data/templates.json no encontrado');
    return;
  }
  const raw = readFileSync(templatesPath, 'utf-8');
  const templates = JSON.parse(raw) as Array<{
    nombre: string;
    descripcion: string;
    categoria: string;
    tipo_documento: string;
    estrategia: string;
    config_extraccion: unknown;
  }>;

  for (const t of templates) {
    const res = insertTemplate.run(
      t.nombre,
      t.descripcion,
      t.categoria,
      t.tipo_documento,
      t.estrategia,
      JSON.stringify(t.config_extraccion)
    );
    if (res.changes > 0) insertadas++;
  }

  console.info(
    `✅ Templates: ${insertadas} insertados, ${templates.length - insertadas} ya existían (total: ${templates.length})`
  );
}

function seedEmisores() {
  console.info('👥 Creando emisores de ejemplo...');

  const insertEmitter = db.prepare(`
    INSERT OR IGNORE INTO emisores (
      cuit, nombre, razon_social, template_preferido_id, tipo_persona
    ) VALUES (?, ?, ?, ?, ?)
  `);

  let insertados = 0;
  const emisoresPath = join(import.meta.dirname, 'seed-data', 'emisores.json');
  if (!existsSync(emisoresPath)) {
    console.info('ℹ️  Saltear: seed-data/emisores.json no encontrado');
    return;
  }
  const raw = readFileSync(emisoresPath, 'utf-8');
  const emisores = JSON.parse(raw) as Array<{
    cuit: string;
    nombre: string;
    razon_social: string;
    template_preferido_id: number;
    tipo_persona: string;
  }>;

  for (const e of emisores) {
    // Normalizar CUIT a formato canónico (sin guiones)
    const normalizedCuit = e.cuit.replace(/[-\s]/g, '');
    const res = insertEmitter.run(
      normalizedCuit,
      e.nombre,
      e.razon_social,
      e.template_preferido_id,
      e.tipo_persona
    );
    if (res.changes > 0) insertados++;
  }

  console.info(
    `✅ Emisores: ${insertados} insertados, ${emisores.length - insertados} ya existían (total: ${emisores.length})`
  );
}

function seedFacturas() {
  console.info('📄 Creando facturas de ejemplo...');

  const insertInvoice = db.prepare(`
    INSERT OR IGNORE INTO facturas (
      emisor_cuit, fecha_emision, tipo_comprobante,
      punto_venta, numero_comprobante, total
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  let insertadas = 0;
  const facturasPath = join(import.meta.dirname, 'seed-data', 'facturas.json');
  if (!existsSync(facturasPath)) {
    console.info('ℹ️  Saltear: seed-data/facturas.json no encontrado');
    return;
  }
  const raw = readFileSync(facturasPath, 'utf-8');
  const facturas = JSON.parse(raw) as Array<{
    emisor_cuit: string;
    fecha_emision: string;
    tipo_comprobante: string;
    punto_venta: number;
    numero_comprobante: number;
    total: number;
  }>;

  for (const f of facturas) {
    const res = insertInvoice.run(
      f.emisor_cuit,
      f.fecha_emision,
      f.tipo_comprobante,
      f.punto_venta,
      f.numero_comprobante,
      f.total
    );
    if (res.changes > 0) insertadas++;
  }

  console.info(
    `✅ Facturas: ${insertadas} insertadas, ${facturas.length - insertadas} ya existían (total: ${facturas.length})`
  );
}

// ===========================
// MAIN EXECUTION
// ===========================

try {
  db.exec('BEGIN TRANSACTION');

  // Truncation helpers
  const truncateCategories = () => {
    db.exec('DELETE FROM categories;');
    db.exec("DELETE FROM sqlite_sequence WHERE name='categories';");
  };
  const truncateTemplates = () => {
    db.exec('DELETE FROM templates_extraccion;');
    db.exec("DELETE FROM sqlite_sequence WHERE name='templates_extraccion';");
  };
  const truncateEmisores = () => {
    db.exec('DELETE FROM emisores;');
    db.exec("DELETE FROM sqlite_sequence WHERE name='emisores';");
  };
  const truncateFacturas = () => {
    db.exec('DELETE FROM facturas;');
    db.exec("DELETE FROM sqlite_sequence WHERE name='facturas';");
  };

  // Execute actions for selected tables
  const actions = {
    categories: { truncate: truncateCategories, seed: seedCategories },
    templates: { truncate: truncateTemplates, seed: seedTemplates },
    emisores: { truncate: truncateEmisores, seed: seedEmisores },
    facturas: { truncate: truncateFacturas, seed: seedFacturas },
    all: { truncate: () => {}, seed: () => {} },
  } as const;

  // When truncating multiple tables, enforce safe FK order
  const truncateOrder = ['facturas', 'emisores', 'templates', 'categories'] as const;
  const seedOrder = ['categories', 'templates', 'emisores', 'facturas'] as const;
  const selectedSet = new Set(selectedTables);

  if (forceRequested) {
    for (const table of truncateOrder) {
      if (!selectedSet.has(table)) continue;
      const act = actions[table];
      if (dryRunRequested) console.info(`🔶 Truncaría: ${table}`);
      else act.truncate();
    }
  }

  for (const table of seedOrder) {
    if (!selectedSet.has(table)) continue;
    const act = actions[table];
    if (dryRunRequested) console.info(`🔶 Poblaría: ${table}`);
    else act.seed();
  }

  db.exec('COMMIT');

  // ===========================
  // ESTADÍSTICAS
  // ===========================

  console.info('\n📊 Estadísticas de la base de datos:');

  const stats = db
    .prepare(
      `
    SELECT
      (SELECT COUNT(*) FROM templates_extraccion) as templates,
      (SELECT COUNT(*) FROM emisores) as emisores,
      (SELECT COUNT(*) FROM facturas) as facturas,
      (SELECT COALESCE(SUM(total), 0) FROM facturas) as total_facturado
  `
    )
    .get() as { templates: number; emisores: number; facturas: number; total_facturado: number };

  console.info(`   Templates: ${stats.templates}`);
  console.info(`   Emisores: ${stats.emisores}`);
  console.info(`   Facturas: ${stats.facturas}`);
  console.info(`   Total facturado: $${stats.total_facturado.toFixed(2)}`);

  db.close();

  console.info('\n✅ Base de datos poblada exitosamente!');
} catch (error) {
  db.exec('ROLLBACK');
  console.error('❌ Error al poblar la base de datos:', error);
  db.close();
  process.exit(1);
}
