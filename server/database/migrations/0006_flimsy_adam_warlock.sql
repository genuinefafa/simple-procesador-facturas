PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_expected_invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`import_batch_id` integer,
	`cuit` text NOT NULL,
	`emitter_name` text,
	`issue_date` text NOT NULL,
	`invoice_type` integer,
	`point_of_sale` integer NOT NULL,
	`invoice_number` integer NOT NULL,
	`total` real,
	`cae` text,
	`cae_expiration` text,
	`currency` text DEFAULT 'ARS',
	`status` text DEFAULT 'pending',
	`matched_pending_file_id` integer,
	`match_confidence` real,
	`import_date` text DEFAULT CURRENT_TIMESTAMP,
	`notes` text,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`matched_pending_file_id`) REFERENCES `pending_files`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_expected_invoices`("id", "import_batch_id", "cuit", "emitter_name", "issue_date", "invoice_type", "point_of_sale", "invoice_number", "total", "cae", "cae_expiration", "currency", "status", "matched_pending_file_id", "match_confidence", "import_date", "notes") SELECT "id", "import_batch_id", "cuit", "emitter_name", "issue_date", CASE "invoice_type" WHEN 'A' THEN 1 WHEN 'B' THEN 6 WHEN 'C' THEN 11 WHEN 'E' THEN 19 WHEN 'M' THEN 51 ELSE NULL END, "point_of_sale", "invoice_number", "total", "cae", "cae_expiration", "currency", "status", "matched_pending_file_id", "match_confidence", "import_date", "notes" FROM `expected_invoices`;--> statement-breakpoint
DROP TABLE `expected_invoices`;--> statement-breakpoint
ALTER TABLE `__new_expected_invoices` RENAME TO `expected_invoices`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_expected_invoices_cuit` ON `expected_invoices` (`cuit`);--> statement-breakpoint
CREATE INDEX `idx_expected_invoices_status` ON `expected_invoices` (`status`);--> statement-breakpoint
CREATE INDEX `idx_expected_invoices_batch` ON `expected_invoices` (`import_batch_id`);--> statement-breakpoint
CREATE INDEX `idx_expected_invoices_date` ON `expected_invoices` (`issue_date`);--> statement-breakpoint
CREATE INDEX `unique_expected_invoice` ON `expected_invoices` (`cuit`,`invoice_type`,`point_of_sale`,`invoice_number`);--> statement-breakpoint
CREATE TABLE `__new_pending_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`original_filename` text NOT NULL,
	`file_path` text NOT NULL,
	`file_size` integer,
	`upload_date` text DEFAULT CURRENT_TIMESTAMP,
	`extracted_cuit` text,
	`extracted_date` text,
	`extracted_total` real,
	`extracted_type` integer,
	`extracted_point_of_sale` integer,
	`extracted_invoice_number` integer,
	`extraction_confidence` integer,
	`extraction_method` text,
	`extraction_errors` text,
	`status` text DEFAULT 'pending',
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
INSERT INTO `__new_pending_files`("id", "original_filename", "file_path", "file_size", "upload_date", "extracted_cuit", "extracted_date", "extracted_total", "extracted_type", "extracted_point_of_sale", "extracted_invoice_number", "extraction_confidence", "extraction_method", "extraction_errors", "status", "created_at", "updated_at") SELECT "id", "original_filename", "file_path", "file_size", "upload_date", "extracted_cuit", "extracted_date", "extracted_total", CASE "extracted_type" WHEN 'A' THEN 1 WHEN 'B' THEN 6 WHEN 'C' THEN 11 WHEN 'E' THEN 19 WHEN 'M' THEN 51 ELSE NULL END, "extracted_point_of_sale", "extracted_invoice_number", "extraction_confidence", "extraction_method", "extraction_errors", "status", "created_at", "updated_at" FROM `pending_files`;--> statement-breakpoint
DROP TABLE `pending_files`;--> statement-breakpoint
ALTER TABLE `__new_pending_files` RENAME TO `pending_files`;--> statement-breakpoint
CREATE INDEX `idx_pending_status` ON `pending_files` (`status`);--> statement-breakpoint
CREATE INDEX `idx_pending_upload_date` ON `pending_files` (`upload_date`);--> statement-breakpoint
CREATE TABLE `__new_facturas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`emisor_cuit` text NOT NULL,
	`template_usado_id` integer,
	`fecha_emision` text NOT NULL,
	`tipo_comprobante` integer,
	`punto_venta` integer NOT NULL,
	`numero_comprobante` integer NOT NULL,
	`comprobante_completo` text NOT NULL,
	`total` real,
	`moneda` text DEFAULT 'ARS',
	`archivo_original` text NOT NULL,
	`archivo_procesado` text NOT NULL,
	`tipo_archivo` text NOT NULL,
	`file_hash` text,
	`metodo_extraccion` text NOT NULL,
	`confianza_extraccion` real,
	`validado_manualmente` integer DEFAULT false,
	`requiere_revision` integer DEFAULT false,
	`expected_invoice_id` integer,
	`pending_file_id` integer,
	`category_id` integer,
	`procesado_en` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`emisor_cuit`) REFERENCES `emisores`(`cuit`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_usado_id`) REFERENCES `templates_extraccion`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`expected_invoice_id`) REFERENCES `expected_invoices`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`pending_file_id`) REFERENCES `pending_files`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_facturas`("id", "emisor_cuit", "template_usado_id", "fecha_emision", "tipo_comprobante", "punto_venta", "numero_comprobante", "comprobante_completo", "total", "moneda", "archivo_original", "archivo_procesado", "tipo_archivo", "file_hash", "metodo_extraccion", "confianza_extraccion", "validado_manualmente", "requiere_revision", "expected_invoice_id", "pending_file_id", "category_id", "procesado_en") SELECT "id", "emisor_cuit", "template_usado_id", "fecha_emision", CASE "tipo_comprobante" WHEN 'A' THEN 1 WHEN 'B' THEN 6 WHEN 'C' THEN 11 WHEN 'E' THEN 19 WHEN 'M' THEN 51 ELSE NULL END, "punto_venta", "numero_comprobante", CASE "tipo_comprobante" WHEN 'A' THEN 'FACA ' || substr("comprobante_completo", 3) WHEN 'B' THEN 'FACB ' || substr("comprobante_completo", 3) WHEN 'C' THEN 'FACC ' || substr("comprobante_completo", 3) WHEN 'E' THEN 'FACE ' || substr("comprobante_completo", 3) WHEN 'M' THEN 'FACM ' || substr("comprobante_completo", 3) ELSE "comprobante_completo" END, "total", "moneda", "archivo_original", "archivo_procesado", "tipo_archivo", "file_hash", "metodo_extraccion", "confianza_extraccion", "validado_manualmente", "requiere_revision", "expected_invoice_id", "pending_file_id", "category_id", "procesado_en" FROM `facturas`;--> statement-breakpoint
DROP TABLE `facturas`;--> statement-breakpoint
ALTER TABLE `__new_facturas` RENAME TO `facturas`;--> statement-breakpoint
CREATE UNIQUE INDEX `facturas_archivo_procesado_unique` ON `facturas` (`archivo_procesado`);--> statement-breakpoint
CREATE INDEX `idx_facturas_emisor` ON `facturas` (`emisor_cuit`);--> statement-breakpoint
CREATE INDEX `idx_facturas_fecha` ON `facturas` (`fecha_emision`);--> statement-breakpoint
CREATE INDEX `idx_facturas_comprobante` ON `facturas` (`comprobante_completo`);--> statement-breakpoint
CREATE INDEX `idx_facturas_total` ON `facturas` (`total`);--> statement-breakpoint
CREATE INDEX `idx_facturas_template` ON `facturas` (`template_usado_id`);--> statement-breakpoint
CREATE INDEX `idx_facturas_hash` ON `facturas` (`file_hash`);--> statement-breakpoint
CREATE INDEX `idx_facturas_revision` ON `facturas` (`requiere_revision`);--> statement-breakpoint
CREATE INDEX `idx_facturas_expected_invoice` ON `facturas` (`expected_invoice_id`);--> statement-breakpoint
CREATE INDEX `idx_facturas_pending_file` ON `facturas` (`pending_file_id`);--> statement-breakpoint
CREATE INDEX `idx_facturas_category` ON `facturas` (`category_id`);--> statement-breakpoint
CREATE INDEX `unique_factura` ON `facturas` (`emisor_cuit`,`tipo_comprobante`,`punto_venta`,`numero_comprobante`);