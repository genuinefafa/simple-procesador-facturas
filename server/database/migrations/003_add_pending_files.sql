-- Migration: Add pending_files table for workflow redesign (Phase 1)
-- This table stores uploaded files that are being processed or waiting for manual review

CREATE TABLE IF NOT EXISTS pending_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,

  -- Datos extraídos (pueden estar incompletos/nulos)
  extracted_cuit TEXT,
  extracted_date TEXT,
  extracted_total REAL,
  extracted_type TEXT,
  extracted_point_of_sale INTEGER,
  extracted_invoice_number INTEGER,

  extraction_confidence INTEGER,
  extraction_errors TEXT, -- JSON con array de errores

  -- Estados: pending, reviewing, processed, failed
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'reviewing', 'processed', 'failed')),

  -- Referencia a factura final (si se completó)
  invoice_id INTEGER,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (invoice_id) REFERENCES facturas(id) ON DELETE SET NULL
);

CREATE INDEX idx_pending_files_status ON pending_files(status);
CREATE INDEX idx_pending_files_upload_date ON pending_files(upload_date);
CREATE INDEX idx_pending_files_invoice ON pending_files(invoice_id);

-- Trigger para actualizar updated_at automáticamente
CREATE TRIGGER IF NOT EXISTS update_pending_files_timestamp
AFTER UPDATE ON pending_files
FOR EACH ROW
BEGIN
  UPDATE pending_files SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
