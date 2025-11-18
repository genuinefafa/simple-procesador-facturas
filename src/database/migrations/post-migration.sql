-- =============================================================================
-- Post-migration SQL
-- Triggers, views y columnas generadas que Drizzle no puede crear directamente
-- Este archivo se ejecuta después de las migraciones de Drizzle
-- =============================================================================

-- =============================================================================
-- COLUMNAS GENERADAS (se agregan con ALTER TABLE)
-- =============================================================================

-- Nota: SQLite no soporta ALTER TABLE ADD COLUMN con GENERATED ALWAYS
-- Estas columnas deben definirse en el CREATE TABLE original
-- Por ahora se manejan en la aplicación o en futuras migraciones

-- =============================================================================
-- TRIGGERS PARA MANTENER ESTADÍSTICAS ACTUALIZADAS
-- =============================================================================

-- Trigger: Actualizar estadísticas de emisor al insertar factura
DROP TRIGGER IF EXISTS trg_facturas_insert_update_emisor;
CREATE TRIGGER trg_facturas_insert_update_emisor
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
DROP TRIGGER IF EXISTS trg_emisores_update_timestamp;
CREATE TRIGGER trg_emisores_update_timestamp
AFTER UPDATE ON emisores
BEGIN
  UPDATE emisores SET updated_at = CURRENT_TIMESTAMP WHERE cuit = NEW.cuit;
END;

-- Trigger: Actualizar timestamp de template al modificar
DROP TRIGGER IF EXISTS trg_templates_update_timestamp;
CREATE TRIGGER trg_templates_update_timestamp
AFTER UPDATE ON templates_extraccion
BEGIN
  UPDATE templates_extraccion SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- =============================================================================
-- VISTAS ÚTILES
-- =============================================================================

-- Vista: Facturas con información completa del emisor
DROP VIEW IF EXISTS v_facturas_completas;
CREATE VIEW v_facturas_completas AS
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
DROP VIEW IF EXISTS v_estadisticas_emisores;
CREATE VIEW v_estadisticas_emisores AS
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
DROP VIEW IF EXISTS v_estadisticas_templates;
CREATE VIEW v_estadisticas_templates AS
SELECT
  t.*,
  COUNT(DISTINCT e.cuit) as emisores_activos_usando
FROM templates_extraccion t
LEFT JOIN emisores e ON t.id = e.template_preferido_id AND e.activo = 1
GROUP BY t.id;
