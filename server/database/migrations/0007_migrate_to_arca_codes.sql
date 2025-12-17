-- Migración a códigos numéricos ARCA para tipos de comprobante
-- SQLite requiere recrear tablas para cambiar tipo de columna

-- ============================================================================
-- TABLA: facturas
-- ============================================================================

PRAGMA foreign_keys=OFF;

-- Crear tabla temporal con nueva estructura
CREATE TABLE facturas_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emisor_cuit TEXT NOT NULL REFERENCES emisores(cuit) ON DELETE CASCADE,
  template_usado_id INTEGER REFERENCES templates_extraccion(id) ON DELETE SET NULL,
  fecha_emision TEXT NOT NULL,
  tipo_comprobante INTEGER, -- CÓDIGO ARCA
  punto_venta INTEGER NOT NULL,
  numero_comprobante INTEGER NOT NULL,
  comprobante_completo TEXT NOT NULL,
  total REAL,
  moneda TEXT DEFAULT 'ARS',
  archivo_original TEXT NOT NULL,
  archivo_procesado TEXT NOT NULL UNIQUE,
  tipo_archivo TEXT NOT NULL,
  file_hash TEXT,
  metodo_extraccion TEXT NOT NULL,
  confianza_extraccion REAL,
  validado_manualmente INTEGER DEFAULT 0,
  requiere_revision INTEGER DEFAULT 0,
  expected_invoice_id INTEGER REFERENCES expected_invoices(id) ON DELETE SET NULL,
  pending_file_id INTEGER REFERENCES pending_files(id) ON DELETE SET NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  procesado_en TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Copiar datos convirtiendo tipos
INSERT INTO facturas_new SELECT
  id,
  emisor_cuit,
  template_usado_id,
  fecha_emision,
  CASE tipo_comprobante
    WHEN 'A' THEN 1
    WHEN 'B' THEN 6
    WHEN 'C' THEN 11
    WHEN 'E' THEN 19
    WHEN 'M' THEN 51
    ELSE NULL
  END as tipo_comprobante,
  punto_venta,
  numero_comprobante,
  -- Actualizar comprobante_completo al nuevo formato
  CASE tipo_comprobante
    WHEN 'A' THEN 'FACA ' || substr(comprobante_completo, 3)
    WHEN 'B' THEN 'FACB ' || substr(comprobante_completo, 3)
    WHEN 'C' THEN 'FACC ' || substr(comprobante_completo, 3)
    WHEN 'E' THEN 'FACE ' || substr(comprobante_completo, 3)
    WHEN 'M' THEN 'FACM ' || substr(comprobante_completo, 3)
    ELSE comprobante_completo
  END as comprobante_completo,
  total,
  moneda,
  archivo_original,
  archivo_procesado,
  tipo_archivo,
  file_hash,
  metodo_extraccion,
  confianza_extraccion,
  validado_manualmente,
  requiere_revision,
  expected_invoice_id,
  pending_file_id,
  category_id,
  procesado_en
FROM facturas;

-- Eliminar tabla vieja y renombrar
DROP TABLE facturas;
ALTER TABLE facturas_new RENAME TO facturas;

-- Recrear índices
CREATE INDEX idx_facturas_emisor ON facturas(emisor_cuit);
CREATE INDEX idx_facturas_fecha ON facturas(fecha_emision);
CREATE INDEX idx_facturas_comprobante ON facturas(comprobante_completo);
CREATE INDEX idx_facturas_total ON facturas(total);
CREATE INDEX idx_facturas_template ON facturas(template_usado_id);
CREATE INDEX idx_facturas_hash ON facturas(file_hash);
CREATE INDEX idx_facturas_revision ON facturas(requiere_revision);
CREATE INDEX idx_facturas_expected_invoice ON facturas(expected_invoice_id);
CREATE INDEX idx_facturas_pending_file ON facturas(pending_file_id);
CREATE INDEX idx_facturas_category ON facturas(category_id);
CREATE UNIQUE INDEX unique_factura ON facturas(emisor_cuit, tipo_comprobante, punto_venta, numero_comprobante);

-- ============================================================================
-- TABLA: expected_invoices
-- ============================================================================

CREATE TABLE expected_invoices_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_batch_id INTEGER REFERENCES import_batches(id) ON DELETE CASCADE,
  cuit TEXT NOT NULL,
  emitter_name TEXT,
  issue_date TEXT NOT NULL,
  invoice_type INTEGER, -- CÓDIGO ARCA
  point_of_sale INTEGER NOT NULL,
  invoice_number INTEGER NOT NULL,
  total REAL,
  cae TEXT,
  cae_expiration TEXT,
  currency TEXT DEFAULT 'ARS',
  status TEXT DEFAULT 'pending',
  matched_pending_file_id INTEGER REFERENCES pending_files(id) ON DELETE SET NULL,
  match_confidence REAL,
  import_date TEXT DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);

-- Copiar datos convirtiendo tipos
INSERT INTO expected_invoices_new SELECT
  id,
  import_batch_id,
  cuit,
  emitter_name,
  issue_date,
  CASE invoice_type
    WHEN 'A' THEN 1
    WHEN 'B' THEN 6
    WHEN 'C' THEN 11
    WHEN 'E' THEN 19
    WHEN 'M' THEN 51
    ELSE NULL
  END as invoice_type,
  point_of_sale,
  invoice_number,
  total,
  cae,
  cae_expiration,
  currency,
  status,
  matched_pending_file_id,
  match_confidence,
  import_date,
  notes
FROM expected_invoices;

-- Eliminar tabla vieja y renombrar
DROP TABLE expected_invoices;
ALTER TABLE expected_invoices_new RENAME TO expected_invoices;

-- Recrear índices
CREATE INDEX idx_expected_invoices_cuit ON expected_invoices(cuit);
CREATE INDEX idx_expected_invoices_status ON expected_invoices(status);
CREATE INDEX idx_expected_invoices_batch ON expected_invoices(import_batch_id);
CREATE INDEX idx_expected_invoices_date ON expected_invoices(issue_date);
CREATE INDEX unique_expected_invoice ON expected_invoices(cuit, invoice_type, point_of_sale, invoice_number);

-- ============================================================================
-- TABLA: pending_files
-- ============================================================================

CREATE TABLE pending_files_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  upload_date TEXT DEFAULT CURRENT_TIMESTAMP,
  extracted_cuit TEXT,
  extracted_date TEXT,
  extracted_total REAL,
  extracted_type INTEGER, -- CÓDIGO ARCA
  extracted_point_of_sale INTEGER,
  extracted_invoice_number INTEGER,
  extraction_confidence INTEGER,
  extraction_method TEXT,
  extraction_errors TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Copiar datos convirtiendo tipos
INSERT INTO pending_files_new SELECT
  id,
  original_filename,
  file_path,
  file_size,
  upload_date,
  extracted_cuit,
  extracted_date,
  extracted_total,
  CASE extracted_type
    WHEN 'A' THEN 1
    WHEN 'B' THEN 6
    WHEN 'C' THEN 11
    WHEN 'E' THEN 19
    WHEN 'M' THEN 51
    ELSE NULL
  END as extracted_type,
  extracted_point_of_sale,
  extracted_invoice_number,
  extraction_confidence,
  extraction_method,
  extraction_errors,
  status,
  created_at,
  updated_at
FROM pending_files;

-- Eliminar tabla vieja y renombrar
DROP TABLE pending_files;
ALTER TABLE pending_files_new RENAME TO pending_files;

-- Recrear índices
CREATE INDEX idx_pending_status ON pending_files(status);
CREATE INDEX idx_pending_upload_date ON pending_files(upload_date);

PRAGMA foreign_keys=ON;
