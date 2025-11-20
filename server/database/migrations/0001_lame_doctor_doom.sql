CREATE TABLE `pending_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`original_filename` text NOT NULL,
	`file_path` text NOT NULL,
	`file_size` integer,
	`upload_date` text DEFAULT CURRENT_TIMESTAMP,
	`extracted_cuit` text,
	`extracted_date` text,
	`extracted_total` real,
	`extracted_type` text,
	`extracted_point_of_sale` integer,
	`extracted_invoice_number` integer,
	`extraction_confidence` integer,
	`extraction_errors` text,
	`status` text DEFAULT 'pending',
	`invoice_id` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`invoice_id`) REFERENCES `facturas`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_pending_files_status` ON `pending_files` (`status`);--> statement-breakpoint
CREATE INDEX `idx_pending_files_upload_date` ON `pending_files` (`upload_date`);--> statement-breakpoint
CREATE INDEX `idx_pending_files_invoice` ON `pending_files` (`invoice_id`);