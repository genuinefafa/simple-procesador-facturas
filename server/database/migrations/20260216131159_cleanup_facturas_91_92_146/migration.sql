-- Migration: Cleanup facturas table (#91, #92, #146)
-- #91: Rename procesado_en → created_at
-- #92: Remove 7 deprecated columns from facturas
-- #146: Derive expected_invoices status (no schema change, behavior only)

-- SQLite requires table recreation to drop columns and rename simultaneously
BEGIN TRANSACTION;

-- Create new table with only desired columns
CREATE TABLE `facturas_new` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `emisor_cuit` text NOT NULL,
  `fecha_emision` text NOT NULL,
  `tipo_comprobante` integer,
  `punto_venta` integer NOT NULL,
  `numero_comprobante` integer NOT NULL,
  `total` real,
  `moneda` text DEFAULT 'ARS',
  `expected_invoice_id` integer,
  `category_id` integer,
  `created_at` text DEFAULT CURRENT_TIMESTAMP,
  `file_id` integer
);

-- Copy data from old table (procesado_en → created_at)
INSERT INTO `facturas_new` (
  `id`, `emisor_cuit`, `fecha_emision`, `tipo_comprobante`, `punto_venta`, `numero_comprobante`,
  `total`, `moneda`, `expected_invoice_id`, `category_id`, `created_at`, `file_id`
)
SELECT
  `id`, `emisor_cuit`, `fecha_emision`, `tipo_comprobante`, `punto_venta`, `numero_comprobante`,
  `total`, `moneda`, `expected_invoice_id`, `category_id`, `procesado_en`, `file_id`
FROM `facturas`;

-- Drop old table
DROP TABLE `facturas`;

-- Rename new table
ALTER TABLE `facturas_new` RENAME TO `facturas`;

-- Recreate indexes (removed: idx_facturas_comprobante, idx_facturas_template, idx_facturas_revision)
CREATE INDEX `idx_facturas_emisor` ON `facturas`(`emisor_cuit`);
CREATE INDEX `idx_facturas_fecha` ON `facturas`(`fecha_emision`);
CREATE INDEX `idx_facturas_total` ON `facturas`(`total`);
CREATE INDEX `idx_facturas_expected_invoice` ON `facturas`(`expected_invoice_id`);
CREATE INDEX `idx_facturas_file` ON `facturas`(`file_id`);
CREATE INDEX `idx_facturas_category` ON `facturas`(`category_id`);
CREATE INDEX `unique_factura` ON `facturas`(`emisor_cuit`, `tipo_comprobante`, `punto_venta`, `numero_comprobante`);

COMMIT;
