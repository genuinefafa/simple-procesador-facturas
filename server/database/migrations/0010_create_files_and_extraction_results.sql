-- Migración: Crear tablas files y file_extraction_results
-- Fecha: 2026-01-11
-- Descripción: Primera parte de la simplificación de arquitectura (#40)
-- Crea las nuevas tablas sin tocar las existentes (migración gradual)

-- =============================================================================
-- TABLA: files (reemplaza pending_files)
-- =============================================================================

CREATE TABLE `files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`original_filename` text NOT NULL,
	`file_type` text NOT NULL,
	`file_size` integer,
	`file_hash` text NOT NULL,
	`storage_path` text NOT NULL,
	`status` text DEFAULT 'uploaded' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);--> statement-breakpoint

CREATE UNIQUE INDEX `files_file_hash_unique` ON `files` (`file_hash`);--> statement-breakpoint
CREATE INDEX `idx_files_status` ON `files` (`status`);--> statement-breakpoint
CREATE INDEX `idx_files_hash` ON `files` (`file_hash`);--> statement-breakpoint
CREATE INDEX `idx_files_created` ON `files` (`created_at`);--> statement-breakpoint

-- =============================================================================
-- TABLA: file_extraction_results (nueva entidad para datos de extracción)
-- =============================================================================

CREATE TABLE `file_extraction_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_id` integer NOT NULL,
	`extracted_cuit` text,
	`extracted_date` text,
	`extracted_total` real,
	`extracted_type` integer,
	`extracted_point_of_sale` integer,
	`extracted_invoice_number` integer,
	`confidence` integer,
	`method` text,
	`template_id` integer,
	`errors` text,
	`extracted_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `templates_extraccion`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint

CREATE INDEX `idx_file_extraction_file` ON `file_extraction_results` (`file_id`);--> statement-breakpoint
CREATE INDEX `idx_file_extraction_cuit` ON `file_extraction_results` (`extracted_cuit`);--> statement-breakpoint
CREATE INDEX `idx_file_extraction_date` ON `file_extraction_results` (`extracted_date`);--> statement-breakpoint

-- =============================================================================
-- AGREGAR FKs A TABLAS EXISTENTES (conviven con campos legacy temporalmente)
-- =============================================================================

-- Agregar FK file_id a facturas (temporal, convive con pending_file_id)
ALTER TABLE `facturas` ADD `file_id` integer REFERENCES files(id);--> statement-breakpoint
CREATE INDEX `idx_facturas_file` ON `facturas` (`file_id`);--> statement-breakpoint

-- Agregar FK matched_file_id a expected_invoices (temporal, convive con matched_pending_file_id)
ALTER TABLE `expected_invoices` ADD `matched_file_id` integer REFERENCES files(id);--> statement-breakpoint
