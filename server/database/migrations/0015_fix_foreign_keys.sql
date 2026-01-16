-- Migration 0015: Fix foreign key references in facturas table
-- Issue #40: Corregir nombres de tablas en FKs
--
-- FKs incorrectos:
-- - categorias -> categories
-- - plantillas -> templates_extraccion

PRAGMA foreign_keys=OFF;

-- Recrear tabla con FKs correctos
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

-- Copiar datos
INSERT INTO facturas_new SELECT * FROM facturas;

-- Reemplazar tabla
DROP TABLE facturas;
ALTER TABLE facturas_new RENAME TO facturas;

-- Recrear índices
CREATE INDEX idx_facturas_emisor ON facturas(emisor_cuit);
CREATE INDEX idx_facturas_fecha ON facturas(fecha_emision);
CREATE INDEX idx_facturas_comprobante_completo ON facturas(comprobante_completo);
CREATE INDEX idx_facturas_file_id ON facturas(file_id);

PRAGMA foreign_keys=ON;
