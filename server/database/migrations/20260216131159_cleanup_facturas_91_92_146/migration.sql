-- Migration: Cleanup facturas table (#91, #92, #146)
-- #91: Rename procesado_en → created_at
-- #92: Remove 7 deprecated columns from facturas
-- #146: Derive expected_invoices status (no schema change, behavior only)

-- SQLite requires table recreation to rename a column and drop others simultaneously.
-- Drizzle runs each statement-breakpoint separated block individually in a transaction.

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
);--> statement-breakpoint
INSERT INTO `facturas_new` (
  `id`, `emisor_cuit`, `fecha_emision`, `tipo_comprobante`, `punto_venta`, `numero_comprobante`,
  `total`, `moneda`, `expected_invoice_id`, `category_id`, `created_at`, `file_id`
)
SELECT
  `id`, `emisor_cuit`, `fecha_emision`, `tipo_comprobante`, `punto_venta`, `numero_comprobante`,
  `total`, `moneda`, `expected_invoice_id`, `category_id`, `procesado_en`, `file_id`
FROM `facturas`;--> statement-breakpoint
DROP TABLE `facturas`;--> statement-breakpoint
ALTER TABLE `facturas_new` RENAME TO `facturas`;--> statement-breakpoint
CREATE INDEX `idx_facturas_emisor` ON `facturas`(`emisor_cuit`);--> statement-breakpoint
CREATE INDEX `idx_facturas_fecha` ON `facturas`(`fecha_emision`);--> statement-breakpoint
CREATE INDEX `idx_facturas_total` ON `facturas`(`total`);--> statement-breakpoint
CREATE INDEX `idx_facturas_expected_invoice` ON `facturas`(`expected_invoice_id`);--> statement-breakpoint
CREATE INDEX `idx_facturas_file` ON `facturas`(`file_id`);--> statement-breakpoint
CREATE INDEX `idx_facturas_category` ON `facturas`(`category_id`);--> statement-breakpoint
CREATE INDEX `unique_factura` ON `facturas`(`emisor_cuit`, `tipo_comprobante`, `punto_venta`, `numero_comprobante`);
