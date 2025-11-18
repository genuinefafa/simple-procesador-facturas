const Database = require('better-sqlite3');
const path = require('path');

// La DB está en el directorio padre de scripts/
const DB_PATH = path.join(__dirname, '../data/database.sqlite');

console.log('📦 Conectando a la base de datos:', DB_PATH);
const db = new Database(DB_PATH);

// SQL de migración
const migrationSQL = `
CREATE TABLE IF NOT EXISTS facturas_zonas_anotadas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  factura_id INTEGER NOT NULL,
  campo TEXT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  valor_extraido TEXT,
  anotado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  anotado_por TEXT DEFAULT 'usuario',
  usado_para_template BOOLEAN DEFAULT 0,
  FOREIGN KEY (factura_id) REFERENCES facturas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_zonas_factura ON facturas_zonas_anotadas(factura_id);
CREATE INDEX IF NOT EXISTS idx_zonas_campo ON facturas_zonas_anotadas(campo);
CREATE INDEX IF NOT EXISTS idx_zonas_template ON facturas_zonas_anotadas(usado_para_template);
`;

console.log('🔄 Ejecutando migración: Crear tabla facturas_zonas_anotadas...');

try {
  db.exec(migrationSQL);
  console.log('✅ Migración completada exitosamente');

  // Verificar que la tabla existe
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='facturas_zonas_anotadas'").all();
  console.log('📋 Tabla creada:', tables);

  // Verificar índices
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='facturas_zonas_anotadas'").all();
  console.log('📊 Índices creados:', indexes);
} catch (error) {
  console.error('❌ Error en la migración:', error);
  process.exit(1);
}

db.close();
console.log('✨ Migración finalizada');
