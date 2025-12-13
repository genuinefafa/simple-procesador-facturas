-- Move categoryId from expected_invoices to facturas
-- Add expected_invoice_id and pending_file_id to facturas for linking
-- Add new columns to facturas
ALTER TABLE `facturas`
ADD `expected_invoice_id` integer REFERENCES expected_invoices(id) ON DELETE
SET NULL;
--> statement-breakpoint
ALTER TABLE `facturas`
ADD `pending_file_id` integer REFERENCES pending_files(id) ON DELETE
SET NULL;
--> statement-breakpoint
ALTER TABLE `facturas`
ADD `category_id` integer REFERENCES categories(id) ON DELETE
SET NULL;
--> statement-breakpoint
-- Create indexes for the new foreign keys
CREATE INDEX `idx_facturas_expected_invoice` ON `facturas` (`expected_invoice_id`);
--> statement-breakpoint
CREATE INDEX `idx_facturas_pending_file` ON `facturas` (`pending_file_id`);
--> statement-breakpoint
CREATE INDEX `idx_facturas_category` ON `facturas` (`category_id`);
