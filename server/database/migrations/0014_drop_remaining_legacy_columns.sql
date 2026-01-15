-- Migration 0014: Drop remaining legacy path columns from facturas (Phase 2)
-- Issue #40: Simplificación de arquitectura de archivos
--
-- Eliminamos las columnas legacy restantes:
-- - archivo_procesado: Reemplazado por files.storage_path
--
-- Todo el código ahora usa file_id -> files.storage_path como única fuente de verdad.
--
-- NOTA: SQLite no permite DROP COLUMN en columnas UNIQUE, así que recreamos la tabla.

-- Paso 1: Desactivar foreign keys temporalmente
PRAGMA foreign_keys=OFF;

-- Paso 2: Crear tabla temporal con nueva estructura (sin archivo_procesado)
CREATE TABLE facturas_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    emisor_cuit TEXT NOT NULL,
    template_usado_id INTEGER,
    fecha_emision TEXT NOT NULL,
    tipo_comprobante INTEGER,
    punto_venta INTEGER NOT NULL,
    numero_comprobante INTEGER NOT NULL,
    comprobante_completo TEXT NOT NULL,
    total REAL,
    moneda TEXT DEFAULT 'ARS',
    tipo_archivo TEXT NOT NULL,
    metodo_extraccion TEXT NOT NULL,
    confianza_extraccion REAL,
    validado_manualmente INTEGER DEFAULT 0,
    requiere_revision INTEGER DEFAULT 0,
    expected_invoice_id INTEGER,
    category_id INTEGER,
    procesado_en TEXT DEFAULT CURRENT_TIMESTAMP,
    file_id INTEGER,
    FOREIGN KEY (emisor_cuit) REFERENCES emisores(cuit),
    FOREIGN KEY (template_usado_id) REFERENCES templates_extraccion(id),
    FOREIGN KEY (expected_invoice_id) REFERENCES expected_invoices(id),
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (file_id) REFERENCES files(id)
);

-- Paso 3: Copiar datos (excluyendo archivo_procesado)
INSERT INTO facturas_new (
    id, emisor_cuit, template_usado_id, fecha_emision, tipo_comprobante,
    punto_venta, numero_comprobante, comprobante_completo, total, moneda,
    tipo_archivo, metodo_extraccion, confianza_extraccion,
    validado_manualmente, requiere_revision, expected_invoice_id,
    category_id, procesado_en, file_id
)
SELECT
    id, emisor_cuit, template_usado_id, fecha_emision, tipo_comprobante,
    punto_venta, numero_comprobante, comprobante_completo, total, moneda,
    tipo_archivo, metodo_extraccion, confianza_extraccion,
    validado_manualmente, requiere_revision, expected_invoice_id,
    category_id, procesado_en, file_id
FROM facturas;

-- Paso 4: Eliminar tabla original
DROP TABLE facturas;

-- Paso 5: Renombrar tabla nueva
ALTER TABLE facturas_new RENAME TO facturas;

-- Paso 6: Recrear índices
CREATE INDEX idx_facturas_emisor ON facturas(emisor_cuit);
CREATE INDEX idx_facturas_fecha ON facturas(fecha_emision);
CREATE INDEX idx_facturas_comprobante_completo ON facturas(comprobante_completo);
CREATE INDEX idx_facturas_file_id ON facturas(file_id);

-- Paso 7: Reactivar foreign keys
PRAGMA foreign_keys=ON;
