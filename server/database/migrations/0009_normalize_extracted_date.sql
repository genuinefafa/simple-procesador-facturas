-- Migración: Normalizar extractedDate a formato ISO con CHECK constraint
-- Fecha: 2026-01-09
-- Descripción: Convierte fechas DD/MM/YYYY a YYYY-MM-DD y agrega validación de formato

-- Paso 1: Normalizar datos existentes de DD/MM/YYYY a YYYY-MM-DD
UPDATE pending_files
SET extracted_date =
    SUBSTR(extracted_date, 7, 4) || '-' ||  -- Año
    SUBSTR(extracted_date, 4, 2) || '-' ||  -- Mes
    SUBSTR(extracted_date, 1, 2)            -- Día
WHERE extracted_date IS NOT NULL
  AND extracted_date LIKE '__/__/____';--> statement-breakpoint

-- Paso 2: Crear tabla temporal con CHECK constraint
CREATE TABLE pending_files_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  original_filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  upload_date TEXT DEFAULT CURRENT_TIMESTAMP,
  file_hash TEXT,
  extracted_cuit TEXT,
  extracted_date TEXT CHECK(
    extracted_date IS NULL OR (
      extracted_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND
      CAST(SUBSTR(extracted_date, 1, 4) AS INTEGER) >= 1900 AND
      CAST(SUBSTR(extracted_date, 6, 2) AS INTEGER) BETWEEN 1 AND 12 AND
      CAST(SUBSTR(extracted_date, 9, 2) AS INTEGER) BETWEEN 1 AND 31
    )
  ),
  extracted_total REAL,
  extracted_type INTEGER,
  extracted_point_of_sale INTEGER,
  extracted_invoice_number INTEGER,
  extraction_confidence INTEGER,
  extraction_method TEXT,
  extraction_errors TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);--> statement-breakpoint

-- Paso 3: Copiar todos los datos
INSERT INTO pending_files_new
SELECT
  id,
  original_filename,
  file_path,
  file_size,
  upload_date,
  file_hash,
  extracted_cuit,
  extracted_date,
  extracted_total,
  extracted_type,
  extracted_point_of_sale,
  extracted_invoice_number,
  extraction_confidence,
  extraction_method,
  extraction_errors,
  status,
  created_at,
  updated_at
FROM pending_files;--> statement-breakpoint

-- Paso 4: Reemplazar tabla vieja con nueva
DROP TABLE pending_files;--> statement-breakpoint
ALTER TABLE pending_files_new RENAME TO pending_files;--> statement-breakpoint

-- Paso 5: Recrear índices
CREATE INDEX idx_pending_files_status ON pending_files (status);--> statement-breakpoint
CREATE INDEX idx_pending_files_hash ON pending_files (file_hash);--> statement-breakpoint
CREATE INDEX idx_pending_files_cuit ON pending_files (extracted_cuit);
