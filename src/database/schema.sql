-- Schema de base de datos para el procesador de facturas
-- SQLite 3

-- =============================================================================
-- TEMPLATES DE EXTRACCIÓN
-- =============================================================================

CREATE TABLE IF NOT EXISTS templates_extraccion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  categoria TEXT NOT NULL CHECK(categoria IN ('SOFTWARE_COMERCIAL', 'AFIP_ELECTRONICA', 'MANUAL', 'GENERICO')),

  -- Configuración de extracción
  tipo_documento TEXT NOT NULL CHECK(tipo_documento IN ('PDF_DIGITAL', 'PDF_IMAGEN', 'IMAGEN')),
  estrategia TEXT NOT NULL CHECK(estrategia IN ('REGEX', 'OCR_ZONES', 'PDF_TEXT', 'HYBRID')),
  config_extraccion TEXT NOT NULL, -- JSON con patrones/coordenadas

  -- Estadísticas
  emisores_usando INTEGER DEFAULT 0,
  facturas_procesadas INTEGER DEFAULT 0,
  facturas_exitosas INTEGER DEFAULT 0,
  confianza_promedio REAL DEFAULT 50.0,
  tasa_exito REAL GENERATED ALWAYS AS (
    CASE
      WHEN facturas_procesadas > 0
      THEN (facturas_exitosas * 100.0) / facturas_procesadas
      ELSE 0
    END
  ) STORED,

  -- Auditoría
  creado_desde_emisor_cuit TEXT,
  activo BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_templates_categoria ON templates_extraccion(categoria);
CREATE INDEX idx_templates_confianza ON templates_extraccion(confianza_promedio DESC);
CREATE INDEX idx_templates_activo ON templates_extraccion(activo);
CREATE INDEX idx_templates_nombre ON templates_extraccion(nombre);

-- =============================================================================
-- EMISORES
-- =============================================================================

CREATE TABLE IF NOT EXISTS emisores (
  cuit TEXT PRIMARY KEY,                        -- Formato: XX-XXXXXXXX-X
  cuit_numerico TEXT NOT NULL UNIQUE,           -- Sin guiones (XXXXXXXXXXX)
  nombre TEXT NOT NULL,
  razon_social TEXT,
  aliases TEXT,                                 -- JSON array de strings (nombres cortos)

  -- Relación con template
  template_preferido_id INTEGER,
  template_auto_detectado BOOLEAN DEFAULT 1,
  config_override TEXT,                         -- JSON con ajustes específicos

  -- Metadata
  tipo_persona TEXT CHECK(tipo_persona IN ('FISICA', 'JURIDICA')),
  activo BOOLEAN DEFAULT 1,
  primera_factura_fecha DATE,
  ultima_factura_fecha DATE,
  total_facturas INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (template_preferido_id) REFERENCES templates_extraccion(id)
);

CREATE INDEX idx_emisores_nombre ON emisores(nombre);
CREATE INDEX idx_emisores_cuit_num ON emisores(cuit_numerico);
CREATE INDEX idx_emisores_template ON emisores(template_preferido_id);

-- =============================================================================
-- FACTURAS
-- =============================================================================

CREATE TABLE IF NOT EXISTS facturas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emisor_cuit TEXT NOT NULL,
  template_usado_id INTEGER,

  -- Datos de la factura
  fecha_emision DATE NOT NULL,
  tipo_comprobante TEXT NOT NULL CHECK(tipo_comprobante IN ('A', 'B', 'C', 'E', 'M', 'X')),
  punto_venta INTEGER NOT NULL,
  numero_comprobante INTEGER NOT NULL,
  comprobante_completo TEXT NOT NULL,           -- "A-0001-00000123"
  total REAL,                                   -- Opcional: útil pero no crítico para procesamiento
  moneda TEXT DEFAULT 'ARS' CHECK(moneda IN ('ARS', 'USD', 'EUR')),

  -- Archivos
  archivo_original TEXT NOT NULL,
  archivo_procesado TEXT NOT NULL UNIQUE,
  tipo_archivo TEXT NOT NULL CHECK(tipo_archivo IN ('PDF_DIGITAL', 'PDF_IMAGEN', 'IMAGEN')),
  file_hash TEXT,                                -- SHA256 del archivo

  -- Calidad de extracción
  metodo_extraccion TEXT NOT NULL CHECK(metodo_extraccion IN ('TEMPLATE', 'GENERICO', 'MANUAL')),
  confianza_extraccion REAL,
  validado_manualmente BOOLEAN DEFAULT 0,
  requiere_revision BOOLEAN DEFAULT 0,

  procesado_en DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (emisor_cuit) REFERENCES emisores(cuit) ON DELETE CASCADE,
  FOREIGN KEY (template_usado_id) REFERENCES templates_extraccion(id) ON DELETE SET NULL,

  -- Restricción: no duplicar facturas del mismo emisor
  UNIQUE(emisor_cuit, tipo_comprobante, punto_venta, numero_comprobante)
);

CREATE INDEX idx_facturas_emisor ON facturas(emisor_cuit);
CREATE INDEX idx_facturas_fecha ON facturas(fecha_emision);
CREATE INDEX idx_facturas_comprobante ON facturas(comprobante_completo);
CREATE INDEX idx_facturas_total ON facturas(total);
CREATE INDEX idx_facturas_template ON facturas(template_usado_id);
CREATE INDEX idx_facturas_hash ON facturas(file_hash);
CREATE INDEX idx_facturas_revision ON facturas(requiere_revision);

-- =============================================================================
-- HISTORIAL DE TEMPLATES POR EMISOR
-- =============================================================================

CREATE TABLE IF NOT EXISTS emisor_templates_historial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emisor_cuit TEXT NOT NULL,
  template_id INTEGER NOT NULL,

  intentos INTEGER DEFAULT 0,
  exitos INTEGER DEFAULT 0,
  fallos INTEGER DEFAULT 0,
  tasa_exito REAL GENERATED ALWAYS AS (
    CASE
      WHEN intentos > 0
      THEN (exitos * 100.0) / intentos
      ELSE 0
    END
  ) STORED,

  ultima_prueba DATETIME,
  promovido_a_preferido BOOLEAN DEFAULT 0,

  FOREIGN KEY (emisor_cuit) REFERENCES emisores(cuit) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES templates_extraccion(id) ON DELETE CASCADE,

  UNIQUE(emisor_cuit, template_id)
);

CREATE INDEX idx_historial_emisor ON emisor_templates_historial(emisor_cuit);
CREATE INDEX idx_historial_template ON emisor_templates_historial(template_id);
CREATE INDEX idx_historial_tasa ON emisor_templates_historial(tasa_exito DESC);

-- =============================================================================
-- CORRECCIONES DE FACTURAS (para aprendizaje)
-- =============================================================================

CREATE TABLE IF NOT EXISTS facturas_correcciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  factura_id INTEGER NOT NULL,
  campo TEXT NOT NULL,
  valor_original TEXT,
  valor_corregido TEXT NOT NULL,
  corregido_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  aplicado_a_template BOOLEAN DEFAULT 0,

  FOREIGN KEY (factura_id) REFERENCES facturas(id) ON DELETE CASCADE
);

CREATE INDEX idx_correcciones_factura ON facturas_correcciones(factura_id);
CREATE INDEX idx_correcciones_campo ON facturas_correcciones(campo);

-- =============================================================================
-- TRIGGERS PARA MANTENER ESTADÍSTICAS ACTUALIZADAS
-- =============================================================================

-- Trigger: Actualizar estadísticas de emisor al insertar factura
CREATE TRIGGER IF NOT EXISTS trg_facturas_insert_update_emisor
AFTER INSERT ON facturas
BEGIN
  UPDATE emisores
  SET
    total_facturas = total_facturas + 1,
    ultima_factura_fecha = NEW.fecha_emision,
    primera_factura_fecha = COALESCE(primera_factura_fecha, NEW.fecha_emision),
    updated_at = CURRENT_TIMESTAMP
  WHERE cuit = NEW.emisor_cuit;

  -- Actualizar contador de template
  UPDATE templates_extraccion
  SET
    facturas_procesadas = facturas_procesadas + 1,
    facturas_exitosas = facturas_exitosas + CASE WHEN NEW.confianza_extraccion >= 70 THEN 1 ELSE 0 END,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.template_usado_id;
END;

-- Trigger: Actualizar timestamp de emisor al modificar
CREATE TRIGGER IF NOT EXISTS trg_emisores_update_timestamp
AFTER UPDATE ON emisores
BEGIN
  UPDATE emisores SET updated_at = CURRENT_TIMESTAMP WHERE cuit = NEW.cuit;
END;

-- Trigger: Actualizar timestamp de template al modificar
CREATE TRIGGER IF NOT EXISTS trg_templates_update_timestamp
AFTER UPDATE ON templates_extraccion
BEGIN
  UPDATE templates_extraccion SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- =============================================================================
-- VISTAS ÚTILES
-- =============================================================================

-- Vista: Facturas con información completa del emisor
CREATE VIEW IF NOT EXISTS v_facturas_completas AS
SELECT
  f.*,
  e.nombre as emisor_nombre,
  e.razon_social as emisor_razon_social,
  t.nombre as template_nombre,
  t.categoria as template_categoria
FROM facturas f
JOIN emisores e ON f.emisor_cuit = e.cuit
LEFT JOIN templates_extraccion t ON f.template_usado_id = t.id;

-- Vista: Estadísticas por emisor
CREATE VIEW IF NOT EXISTS v_estadisticas_emisores AS
SELECT
  e.cuit,
  e.nombre,
  e.total_facturas,
  COUNT(DISTINCT f.tipo_comprobante) as tipos_comprobante_usados,
  SUM(f.total) as total_facturado,
  AVG(f.confianza_extraccion) as confianza_promedio,
  t.nombre as template_preferido_nombre,
  SUM(CASE WHEN f.requiere_revision THEN 1 ELSE 0 END) as facturas_pendientes_revision
FROM emisores e
LEFT JOIN facturas f ON e.cuit = f.emisor_cuit
LEFT JOIN templates_extraccion t ON e.template_preferido_id = t.id
GROUP BY e.cuit;

-- Vista: Estadísticas por template
CREATE VIEW IF NOT EXISTS v_estadisticas_templates AS
SELECT
  t.*,
  COUNT(DISTINCT e.cuit) as emisores_activos_usando
FROM templates_extraccion t
LEFT JOIN emisores e ON t.id = e.template_preferido_id AND e.activo = 1
GROUP BY t.id;
