/**
 * Script para poblar la base de datos con datos de prueba
 * Uso: npm run db:seed [table]
 * Opciones: categories | templates | emisores | facturas | all (default)
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, '..', '..', 'data', 'database.sqlite');

if (!existsSync(DB_PATH)) {
  console.error('❌ La base de datos no existe. Ejecutá primero: npm run db:init');
  process.exit(1);
}

// Parse CLI arguments
const args = process.argv.slice(2);
const validTables = ['categories', 'templates', 'emisores', 'facturas', 'all'];
const helpRequested = args.includes('--help') || args.includes('-h');
const forceRequested = args.includes('--force');
const dryRunRequested = args.includes('--dry-run');
const onlyArg = args.find((a) => a.startsWith('--only='));
const tableArg = args.find((a) => validTables.includes(a)) || 'all';

// Resolve selected tables
const onlyTables = onlyArg
  ? onlyArg
      .replace('--only=', '')
      .split(',')
      .map((t) => t.trim())
      .filter((t) => validTables.includes(t) && t !== 'all')
  : [];
const selectedTables = onlyTables.length > 0 ? onlyTables : [tableArg];

if (helpRequested) {
  console.info(
    'Uso: npm run db:seed [tabla] [-- --force] [-- --dry-run] [-- --only=tabla1,tabla2]'
  );
  console.info('Tablas: categories | templates | emisores | facturas | all');
  console.info('Flags:');
  console.info(
    '  --force      Borra datos existentes de la(s) tabla(s) seleccionadas antes de poblar'
  );
  console.info('  --dry-run    Muestra las acciones que se ejecutarían sin modificar la base');
  console.info(
    '  --only=...   Lista separada por comas para seleccionar tablas específicas (override del argumento posicional)'
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

console.info('🌱 Poblando base de datos con datos de prueba...');
console.info(
  `📋 Selección: ${selectedTables.join(', ')}${forceRequested ? ' (force)' : ''}${dryRunRequested ? ' (dry-run)' : ''}\n`
);

const db = new Database(DB_PATH);

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

  const categoriesPath = join(__dirname, '..', '..', 'categorias.json');
  if (!existsSync(categoriesPath)) {
    console.warn(
      '⚠️  No se encontró categorias.json. Creá una copia desde categorias.json.example'
    );
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

  let result = insertTemplate.run(
    'AFIP Factura Electrónica A',
    'Template para facturas electrónicas AFIP tipo A',
    'AFIP_ELECTRONICA',
    'PDF_DIGITAL',
    'REGEX',
    JSON.stringify({
      type: 'PDF_DIGITAL',
      patterns: {
        cuit: { regex: 'CUIT[:\\s]*(\\d{2}-\\d{8}-\\d)', flags: 'i', confianza: 95 },
        fecha: { regex: 'Fecha[:\\s]*(\\d{2}/\\d{2}/\\d{4})', formato: 'DD/MM/YYYY' },
        comprobante: {
          regex: '(A)\\s*-?\\s*(\\d{4})\\s*-?\\s*(\\d{8})',
          grupos: ['tipo', 'punto_venta', 'numero'],
        },
        total: { regex: 'Importe Total[:\\s]*\\$?\\s*([\\d,.]+)' },
      },
    })
  );

  if (result.changes > 0) insertadas++;

  result = insertTemplate.run(
    'PDF Digital Genérico',
    'Template genérico para PDFs digitales sin formato específico',
    'GENERICO',
    'PDF_DIGITAL',
    'PDF_TEXT',
    JSON.stringify({
      type: 'PDF_DIGITAL',
      patterns: {
        cuit: { regex: '\\d{2}[-\\s]?\\d{8}[-\\s]?\\d', confianza: 85 },
        fecha: { regex: '\\d{2}[/-]\\d{2}[/-]\\d{4}', formato: 'flexible' },
        total: { regex: '(?:Total|Importe)[:\\s]*\\$?\\s*([\\d,.]+)', confianza: 80 },
      },
    })
  );

  if (result.changes > 0) insertadas++;

  result = insertTemplate.run(
    'Imagen OCR Genérico',
    'Template para procesamiento OCR de imágenes escaneadas',
    'GENERICO',
    'IMAGEN',
    'OCR_ZONES',
    JSON.stringify({
      type: 'OCR_ZONES',
      zonas: {
        cuit: { x: 50, y: 10, width: 200, height: 30, regex_validacion: '\\d{2}-\\d{8}-\\d' },
        fecha: { x: 400, y: 10, width: 150, height: 30, formato_esperado: 'DD/MM/YYYY' },
        total: {
          x: 400,
          y: 700,
          width: 150,
          height: 40,
          keywords: ['TOTAL', 'IMPORTE'],
          busqueda: 'bottom_right',
        },
      },
      resolucion_dpi: 300,
      idioma_ocr: 'spa',
    })
  );

  if (result.changes > 0) insertadas++;

  console.info(`✅ Templates: ${insertadas} insertados, ${3 - insertadas} ya existían (total: 3)`);
}

function seedEmisores() {
  console.info('👥 Creando emisores de ejemplo...');

  const insertEmitter = db.prepare(`
    INSERT OR IGNORE INTO emisores (
      cuit, cuit_numerico, nombre, razon_social, template_preferido_id, tipo_persona
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  let insertados = 0;

  let result = insertEmitter.run(
    '30-12345678-9',
    '30123456789',
    'Servicios Tecnológicos SA',
    'Servicios Tecnológicos Sociedad Anónima',
    1, // AFIP Electrónica A
    'JURIDICA'
  );

  if (result.changes > 0) insertados++;

  result = insertEmitter.run(
    '20-98765432-1',
    '20987654321',
    'Distribuidora ABC',
    'Juan Pérez Distribuidora',
    2, // PDF Genérico
    'FISICA'
  );

  if (result.changes > 0) insertados++;

  result = insertEmitter.run(
    '33-87654321-0',
    '33876543210',
    'Consultora XYZ SRL',
    'Consultora XYZ Sociedad de Responsabilidad Limitada',
    1, // AFIP Electrónica A
    'JURIDICA'
  );

  if (result.changes > 0) insertados++;

  console.info(`✅ Emisores: ${insertados} insertados, ${3 - insertados} ya existían (total: 3)`);
}

function seedFacturas() {
  console.info('📄 Creando facturas de ejemplo...');

  const insertInvoice = db.prepare(`
    INSERT OR IGNORE INTO facturas (
      emisor_cuit, template_usado_id, fecha_emision, tipo_comprobante,
      punto_venta, numero_comprobante, comprobante_completo, total,
      archivo_original, archivo_procesado, tipo_archivo,
      metodo_extraccion, confianza_extraccion
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let insertadas = 0;

  let result = insertInvoice.run(
    '30-12345678-9',
    1,
    '2024-11-15',
    'A',
    1,
    123,
    'A-0001-00000123',
    15000.0,
    'factura_empresa1_001.pdf',
    '30123456789_20241115_A-0001-00000123.pdf',
    'PDF_DIGITAL',
    'TEMPLATE',
    95.5
  );

  if (result.changes > 0) insertadas++;

  result = insertInvoice.run(
    '30-12345678-9',
    1,
    '2024-11-20',
    'A',
    1,
    124,
    'A-0001-00000124',
    22500.75,
    'factura_empresa1_002.pdf',
    '30123456789_20241120_A-0001-00000124.pdf',
    'PDF_DIGITAL',
    'TEMPLATE',
    93.2
  );

  if (result.changes > 0) insertadas++;

  result = insertInvoice.run(
    '20-98765432-1',
    2,
    '2024-11-18',
    'B',
    3,
    567,
    'B-0003-00000567',
    8750.0,
    'factura_proveedor_001.pdf',
    '20987654321_20241118_B-0003-00000567.pdf',
    'PDF_DIGITAL',
    'TEMPLATE',
    88.0
  );

  if (result.changes > 0) insertadas++;

  result = insertInvoice.run(
    '33-87654321-0',
    1,
    '2024-11-22',
    'C',
    2,
    789,
    'C-0002-00000789',
    50000.0,
    'factura_consultora_001.jpg',
    '33876543210_20241122_C-0002-00000789.jpg',
    'IMAGEN',
    'TEMPLATE',
    82.5
  );

  if (result.changes > 0) insertadas++;

  console.info(`✅ Facturas: ${insertadas} insertadas, ${4 - insertadas} ya existían (total: 4)`);
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

  for (const table of selectedTables) {
    const act = actions[table as keyof typeof actions];
    if (!act) continue;
    if (forceRequested) {
      if (dryRunRequested) console.info(`🔶 Truncaría: ${table}`);
      else act.truncate();
    }
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
