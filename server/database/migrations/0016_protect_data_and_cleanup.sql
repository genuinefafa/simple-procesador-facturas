-- Migration 0016: Protect data integrity and cleanup redundant fields
-- Issue #44: Emisores CRUD - proteger datos y eliminar campos calculados
--
-- Cambios:
-- 1. Cambiar CASCADE a RESTRICT en expected_invoices.import_batch_id
--    (evitar borrado accidental de expected al borrar batch)
-- 2. Eliminar campos redundantes de emisores que se calculan dinámicamente:
--    - primera_factura_fecha
--    - ultima_factura_fecha
--    - total_facturas

PRAGMA foreign_keys=OFF;

-- ============================================================================
-- 1. Recrear expected_invoices con RESTRICT en lugar de CASCADE
-- ============================================================================

CREATE TABLE expected_invoices_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_batch_id INTEGER REFERENCES import_batches(id) ON DELETE RESTRICT,
  cuit TEXT NOT NULL,
  emitter_name TEXT,
  issue_date TEXT NOT NULL,
  invoice_type INTEGER,
  point_of_sale INTEGER NOT NULL,
  invoice_number INTEGER NOT NULL,
  total REAL,
  cae TEXT,
  cae_expiration TEXT,
  currency TEXT DEFAULT 'ARS',
  status TEXT DEFAULT 'pending',
  match_confidence REAL,
  import_date TEXT DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  matched_file_id INTEGER REFERENCES files(id)
);

-- Copiar datos
INSERT INTO expected_invoices_new
SELECT * FROM expected_invoices;

-- Reemplazar tabla
DROP TABLE expected_invoices;
ALTER TABLE expected_invoices_new RENAME TO expected_invoices;

-- Recrear índices
CREATE INDEX idx_expected_invoices_cuit ON expected_invoices(cuit);
CREATE INDEX idx_expected_invoices_status ON expected_invoices(status);
CREATE INDEX idx_expected_invoices_batch ON expected_invoices(import_batch_id);
CREATE INDEX idx_expected_invoices_date ON expected_invoices(issue_date);
CREATE UNIQUE INDEX unique_expected_invoice ON expected_invoices(cuit, point_of_sale, invoice_number, issue_date);

-- ============================================================================
-- 2. Eliminar campos redundantes de emisores
-- ============================================================================

CREATE TABLE emisores_new (
  cuit TEXT PRIMARY KEY,
  cuit_numerico TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  razon_social TEXT,
  aliases TEXT,
  template_preferido_id INTEGER REFERENCES templates_extraccion(id),
  template_auto_detectado INTEGER DEFAULT 1,
  config_override TEXT,
  tipo_persona TEXT CHECK(tipo_persona IN ('FISICA', 'JURIDICA')),
  activo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Copiar datos (sin los campos eliminados)
INSERT INTO emisores_new (
  cuit, cuit_numerico, nombre, razon_social, aliases,
  template_preferido_id, template_auto_detectado, config_override,
  tipo_persona, activo, created_at, updated_at
)
SELECT
  cuit, cuit_numerico, nombre, razon_social, aliases,
  template_preferido_id, template_auto_detectado, config_override,
  tipo_persona, activo, created_at, updated_at
FROM emisores;

-- Reemplazar tabla
DROP TABLE emisores;
ALTER TABLE emisores_new RENAME TO emisores;

-- Recrear índices
CREATE INDEX idx_emisores_nombre ON emisores(nombre);
CREATE INDEX idx_emisores_cuit_num ON emisores(cuit_numerico);
CREATE INDEX idx_emisores_template ON emisores(template_preferido_id);

PRAGMA foreign_keys=ON;
