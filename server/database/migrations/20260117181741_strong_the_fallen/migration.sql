CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`key` text NOT NULL UNIQUE,
	`description` text NOT NULL,
	`active` integer DEFAULT true,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `emisor_templates_historial` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`emisor_cuit` text NOT NULL,
	`template_id` integer NOT NULL,
	`intentos` integer DEFAULT 0,
	`exitos` integer DEFAULT 0,
	`fallos` integer DEFAULT 0,
	`ultima_prueba` text,
	`promovido_a_preferido` integer DEFAULT false,
	CONSTRAINT `fk_emisor_templates_historial_emisor_cuit_emisores_cuit_fk` FOREIGN KEY (`emisor_cuit`) REFERENCES `emisores`(`cuit`) ON DELETE CASCADE,
	CONSTRAINT `fk_emisor_templates_historial_template_id_templates_extraccion_id_fk` FOREIGN KEY (`template_id`) REFERENCES `templates_extraccion`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `emisores` (
	`cuit` text PRIMARY KEY,
	`cuit_numerico` text NOT NULL,
	`nombre` text NOT NULL,
	`razon_social` text,
	`aliases` text,
	`template_preferido_id` integer,
	`template_auto_detectado` integer DEFAULT true,
	`config_override` text,
	`tipo_persona` text,
	`activo` integer DEFAULT true,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `fk_emisores_template_preferido_id_templates_extraccion_id_fk` FOREIGN KEY (`template_preferido_id`) REFERENCES `templates_extraccion`(`id`)
);
--> statement-breakpoint
CREATE TABLE `expected_invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
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
	`matched_file_id` integer,
	`match_confidence` real,
	`import_date` text DEFAULT CURRENT_TIMESTAMP,
	`notes` text,
	CONSTRAINT `fk_expected_invoices_import_batch_id_import_batches_id_fk` FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `facturas` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`emisor_cuit` text NOT NULL,
	`template_usado_id` integer,
	`file_id` integer,
	`fecha_emision` text NOT NULL,
	`tipo_comprobante` integer,
	`punto_venta` integer NOT NULL,
	`numero_comprobante` integer NOT NULL,
	`comprobante_completo` text NOT NULL,
	`total` real,
	`moneda` text DEFAULT 'ARS',
	`tipo_archivo` text NOT NULL,
	`metodo_extraccion` text NOT NULL,
	`confianza_extraccion` real,
	`validado_manualmente` integer DEFAULT false,
	`requiere_revision` integer DEFAULT false,
	`expected_invoice_id` integer,
	`category_id` integer,
	`procesado_en` text DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `fk_facturas_emisor_cuit_emisores_cuit_fk` FOREIGN KEY (`emisor_cuit`) REFERENCES `emisores`(`cuit`) ON DELETE RESTRICT,
	CONSTRAINT `fk_facturas_template_usado_id_templates_extraccion_id_fk` FOREIGN KEY (`template_usado_id`) REFERENCES `templates_extraccion`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_facturas_expected_invoice_id_expected_invoices_id_fk` FOREIGN KEY (`expected_invoice_id`) REFERENCES `expected_invoices`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_facturas_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `facturas_correcciones` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`factura_id` integer NOT NULL,
	`campo` text NOT NULL,
	`valor_original` text,
	`valor_corregido` text NOT NULL,
	`corregido_en` text DEFAULT CURRENT_TIMESTAMP,
	`aplicado_a_template` integer DEFAULT false,
	CONSTRAINT `fk_facturas_correcciones_factura_id_facturas_id_fk` FOREIGN KEY (`factura_id`) REFERENCES `facturas`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `facturas_zonas_anotadas` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`factura_id` integer NOT NULL,
	`campo` text NOT NULL,
	`x` integer NOT NULL,
	`y` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`valor_extraido` text,
	`anotado_en` text DEFAULT CURRENT_TIMESTAMP,
	`anotado_por` text DEFAULT 'usuario',
	`usado_para_template` integer DEFAULT false,
	CONSTRAINT `fk_facturas_zonas_anotadas_factura_id_facturas_id_fk` FOREIGN KEY (`factura_id`) REFERENCES `facturas`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `file_extraction_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
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
	CONSTRAINT `fk_file_extraction_results_file_id_files_id_fk` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_file_extraction_results_template_id_templates_extraccion_id_fk` FOREIGN KEY (`template_id`) REFERENCES `templates_extraccion`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`original_filename` text NOT NULL,
	`file_type` text NOT NULL,
	`file_size` integer,
	`file_hash` text NOT NULL,
	`storage_path` text NOT NULL,
	`status` text DEFAULT 'uploaded' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`filename` text NOT NULL,
	`total_rows` integer NOT NULL,
	`imported_rows` integer NOT NULL,
	`skipped_rows` integer DEFAULT 0,
	`error_rows` integer DEFAULT 0,
	`import_date` text DEFAULT CURRENT_TIMESTAMP,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `templates_extraccion` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`nombre` text NOT NULL,
	`descripcion` text,
	`categoria` text NOT NULL,
	`tipo_documento` text NOT NULL,
	`estrategia` text NOT NULL,
	`config_extraccion` text NOT NULL,
	`emisores_usando` integer DEFAULT 0,
	`facturas_procesadas` integer DEFAULT 0,
	`facturas_exitosas` integer DEFAULT 0,
	`confianza_promedio` real DEFAULT 50,
	`creado_desde_emisor_cuit` text,
	`activo` integer DEFAULT true,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `idx_historial_emisor` ON `emisor_templates_historial` (`emisor_cuit`);--> statement-breakpoint
CREATE INDEX `idx_historial_template` ON `emisor_templates_historial` (`template_id`);--> statement-breakpoint
CREATE INDEX `unique_emisor_template` ON `emisor_templates_historial` (`emisor_cuit`,`template_id`);--> statement-breakpoint
CREATE INDEX `idx_emisores_nombre` ON `emisores` (`nombre`);--> statement-breakpoint
CREATE INDEX `idx_emisores_cuit_num` ON `emisores` (`cuit_numerico`);--> statement-breakpoint
CREATE INDEX `idx_emisores_template` ON `emisores` (`template_preferido_id`);--> statement-breakpoint
CREATE INDEX `idx_expected_invoices_cuit` ON `expected_invoices` (`cuit`);--> statement-breakpoint
CREATE INDEX `idx_expected_invoices_status` ON `expected_invoices` (`status`);--> statement-breakpoint
CREATE INDEX `idx_expected_invoices_batch` ON `expected_invoices` (`import_batch_id`);--> statement-breakpoint
CREATE INDEX `idx_expected_invoices_date` ON `expected_invoices` (`issue_date`);--> statement-breakpoint
CREATE INDEX `unique_expected_invoice` ON `expected_invoices` (`cuit`,`invoice_type`,`point_of_sale`,`invoice_number`);--> statement-breakpoint
CREATE INDEX `idx_facturas_emisor` ON `facturas` (`emisor_cuit`);--> statement-breakpoint
CREATE INDEX `idx_facturas_fecha` ON `facturas` (`fecha_emision`);--> statement-breakpoint
CREATE INDEX `idx_facturas_comprobante` ON `facturas` (`comprobante_completo`);--> statement-breakpoint
CREATE INDEX `idx_facturas_total` ON `facturas` (`total`);--> statement-breakpoint
CREATE INDEX `idx_facturas_template` ON `facturas` (`template_usado_id`);--> statement-breakpoint
CREATE INDEX `idx_facturas_revision` ON `facturas` (`requiere_revision`);--> statement-breakpoint
CREATE INDEX `idx_facturas_expected_invoice` ON `facturas` (`expected_invoice_id`);--> statement-breakpoint
CREATE INDEX `idx_facturas_file` ON `facturas` (`file_id`);--> statement-breakpoint
CREATE INDEX `idx_facturas_category` ON `facturas` (`category_id`);--> statement-breakpoint
CREATE INDEX `unique_factura` ON `facturas` (`emisor_cuit`,`tipo_comprobante`,`punto_venta`,`numero_comprobante`);--> statement-breakpoint
CREATE INDEX `idx_correcciones_factura` ON `facturas_correcciones` (`factura_id`);--> statement-breakpoint
CREATE INDEX `idx_correcciones_campo` ON `facturas_correcciones` (`campo`);--> statement-breakpoint
CREATE INDEX `idx_zonas_factura` ON `facturas_zonas_anotadas` (`factura_id`);--> statement-breakpoint
CREATE INDEX `idx_zonas_campo` ON `facturas_zonas_anotadas` (`campo`);--> statement-breakpoint
CREATE INDEX `idx_zonas_template` ON `facturas_zonas_anotadas` (`usado_para_template`);--> statement-breakpoint
CREATE INDEX `idx_file_extraction_file` ON `file_extraction_results` (`file_id`);--> statement-breakpoint
CREATE INDEX `idx_file_extraction_cuit` ON `file_extraction_results` (`extracted_cuit`);--> statement-breakpoint
CREATE INDEX `idx_file_extraction_date` ON `file_extraction_results` (`extracted_date`);--> statement-breakpoint
CREATE INDEX `idx_files_status` ON `files` (`status`);--> statement-breakpoint
CREATE INDEX `idx_files_hash` ON `files` (`file_hash`);--> statement-breakpoint
CREATE INDEX `idx_files_created` ON `files` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_templates_categoria` ON `templates_extraccion` (`categoria`);--> statement-breakpoint
CREATE INDEX `idx_templates_confianza` ON `templates_extraccion` (`confianza_promedio`);--> statement-breakpoint
CREATE INDEX `idx_templates_activo` ON `templates_extraccion` (`activo`);--> statement-breakpoint
CREATE INDEX `idx_templates_nombre` ON `templates_extraccion` (`nombre`);