CREATE TABLE `expected_invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`import_batch_id` integer,
	`cuit` text NOT NULL,
	`emitter_name` text,
	`issue_date` text NOT NULL,
	`invoice_type` text NOT NULL,
	`point_of_sale` integer NOT NULL,
	`invoice_number` integer NOT NULL,
	`total` real,
	`cae` text,
	`cae_expiration` text,
	`currency` text DEFAULT 'ARS',
	`status` text DEFAULT 'pending',
	`matched_pending_file_id` integer,
	`matched_invoice_id` integer,
	`match_confidence` real,
	`import_date` text DEFAULT CURRENT_TIMESTAMP,
	`notes` text,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`matched_pending_file_id`) REFERENCES `pending_files`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`matched_invoice_id`) REFERENCES `facturas`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_expected_invoices_cuit` ON `expected_invoices` (`cuit`);--> statement-breakpoint
CREATE INDEX `idx_expected_invoices_status` ON `expected_invoices` (`status`);--> statement-breakpoint
CREATE INDEX `idx_expected_invoices_batch` ON `expected_invoices` (`import_batch_id`);--> statement-breakpoint
CREATE INDEX `idx_expected_invoices_date` ON `expected_invoices` (`issue_date`);--> statement-breakpoint
CREATE INDEX `unique_expected_invoice` ON `expected_invoices` (`cuit`,`invoice_type`,`point_of_sale`,`invoice_number`);--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`filename` text NOT NULL,
	`total_rows` integer NOT NULL,
	`imported_rows` integer NOT NULL,
	`skipped_rows` integer DEFAULT 0,
	`error_rows` integer DEFAULT 0,
	`import_date` text DEFAULT CURRENT_TIMESTAMP,
	`notes` text
);
