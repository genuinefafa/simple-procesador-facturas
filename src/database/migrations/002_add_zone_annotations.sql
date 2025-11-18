-- Migration: Add zone annotations table for manual invoice field annotations
-- This table stores the zones drawn by users when annotating invoices

CREATE TABLE IF NOT EXISTS facturas_zonas_anotadas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  factura_id INTEGER NOT NULL,
  campo TEXT NOT NULL,  -- 'cuit', 'fecha', 'total', 'punto_venta', 'numero', 'tipo'

  -- Coordenadas de la zona (relativas al tamaño original del documento)
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,

  -- Valor extraído de esta zona (si está disponible)
  valor_extraido TEXT,

  -- Metadata
  anotado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  anotado_por TEXT DEFAULT 'usuario',
  usado_para_template BOOLEAN DEFAULT 0,

  FOREIGN KEY (factura_id) REFERENCES facturas(id) ON DELETE CASCADE
);

CREATE INDEX idx_zonas_factura ON facturas_zonas_anotadas(factura_id);
CREATE INDEX idx_zonas_campo ON facturas_zonas_anotadas(campo);
CREATE INDEX idx_zonas_template ON facturas_zonas_anotadas(usado_para_template);
