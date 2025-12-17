-- Migración a códigos numéricos ARCA para tipos de comprobante
-- Convierte invoice_type de VARCHAR (A/B/C/E/M/X) a INTEGER (códigos ARCA)
-- Mapeo: A→1, B→6, C→11, E→19, M→51, X→NULL

-- ============================================================================
-- TABLA: facturas
-- ============================================================================

-- Crear nueva columna temporal para códigos ARCA
ALTER TABLE `facturas` ADD COLUMN `tipo_comprobante_new` integer;

-- Migrar datos existentes
UPDATE `facturas` SET `tipo_comprobante_new` = 1 WHERE `tipo_comprobante` = 'A';
UPDATE `facturas` SET `tipo_comprobante_new` = 6 WHERE `tipo_comprobante` = 'B';
UPDATE `facturas` SET `tipo_comprobante_new` = 11 WHERE `tipo_comprobante` = 'C';
UPDATE `facturas` SET `tipo_comprobante_new` = 19 WHERE `tipo_comprobante` = 'E';
UPDATE `facturas` SET `tipo_comprobante_new` = 51 WHERE `tipo_comprobante` = 'M';
UPDATE `facturas` SET `tipo_comprobante_new` = NULL WHERE `tipo_comprobante` = 'X';

-- Eliminar columna antigua y renombrar
ALTER TABLE `facturas` DROP COLUMN `tipo_comprobante`;
ALTER TABLE `facturas` RENAME COLUMN `tipo_comprobante_new` TO `tipo_comprobante`;

-- Actualizar comprobante_completo para usar friendlyType
-- Formato anterior: "A-0001-00000123"
-- Formato nuevo: "FACA 0001-00000123"
UPDATE `facturas` SET `comprobante_completo` =
  'FACA ' || substr(`comprobante_completo`, 3)
  WHERE `tipo_comprobante` = 1;

UPDATE `facturas` SET `comprobante_completo` =
  'FACB ' || substr(`comprobante_completo`, 3)
  WHERE `tipo_comprobante` = 6;

UPDATE `facturas` SET `comprobante_completo` =
  'FACC ' || substr(`comprobante_completo`, 3)
  WHERE `tipo_comprobante` = 11;

UPDATE `facturas` SET `comprobante_completo` =
  'FACE ' || substr(`comprobante_completo`, 3)
  WHERE `tipo_comprobante` = 19;

UPDATE `facturas` SET `comprobante_completo` =
  'FACM ' || substr(`comprobante_completo`, 3)
  WHERE `tipo_comprobante` = 51;

-- ============================================================================
-- TABLA: expected_invoices
-- ============================================================================

-- Crear nueva columna temporal
ALTER TABLE `expected_invoices` ADD COLUMN `invoice_type_new` integer;

-- Migrar datos existentes
UPDATE `expected_invoices` SET `invoice_type_new` = 1 WHERE `invoice_type` = 'A';
UPDATE `expected_invoices` SET `invoice_type_new` = 6 WHERE `invoice_type` = 'B';
UPDATE `expected_invoices` SET `invoice_type_new` = 11 WHERE `invoice_type` = 'C';
UPDATE `expected_invoices` SET `invoice_type_new` = 19 WHERE `invoice_type` = 'E';
UPDATE `expected_invoices` SET `invoice_type_new` = 51 WHERE `invoice_type` = 'M';
UPDATE `expected_invoices` SET `invoice_type_new` = NULL WHERE `invoice_type` = 'X';

-- Eliminar columna antigua y renombrar
ALTER TABLE `expected_invoices` DROP COLUMN `invoice_type`;
ALTER TABLE `expected_invoices` RENAME COLUMN `invoice_type_new` TO `invoice_type`;

-- ============================================================================
-- TABLA: pending_files
-- ============================================================================

-- Crear nueva columna temporal
ALTER TABLE `pending_files` ADD COLUMN `extracted_type_new` integer;

-- Migrar datos existentes
UPDATE `pending_files` SET `extracted_type_new` = 1 WHERE `extracted_type` = 'A';
UPDATE `pending_files` SET `extracted_type_new` = 6 WHERE `extracted_type` = 'B';
UPDATE `pending_files` SET `extracted_type_new` = 11 WHERE `extracted_type` = 'C';
UPDATE `pending_files` SET `extracted_type_new` = 19 WHERE `extracted_type` = 'E';
UPDATE `pending_files` SET `extracted_type_new` = 51 WHERE `extracted_type` = 'M';
UPDATE `pending_files` SET `extracted_type_new` = NULL WHERE `extracted_type` = 'X' OR `extracted_type` IS NULL;

-- Eliminar columna antigua y renombrar
ALTER TABLE `pending_files` DROP COLUMN `extracted_type`;
ALTER TABLE `pending_files` RENAME COLUMN `extracted_type_new` TO `extracted_type`;
