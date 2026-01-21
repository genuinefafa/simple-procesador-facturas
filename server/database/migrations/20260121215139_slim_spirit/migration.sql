ALTER TABLE `expected_invoices` ADD `category_id` integer REFERENCES categories(id);--> statement-breakpoint
ALTER TABLE `files` ADD `category_id` integer REFERENCES categories(id);--> statement-breakpoint
CREATE INDEX `idx_expected_invoices_category` ON `expected_invoices` (`category_id`);--> statement-breakpoint
CREATE INDEX `idx_files_category` ON `files` (`category_id`);