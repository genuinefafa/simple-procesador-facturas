ALTER TABLE `expected_invoices` ADD `balanced_with_id` integer REFERENCES expected_invoices(id);--> statement-breakpoint
CREATE INDEX `idx_expected_invoices_balanced` ON `expected_invoices` (`balanced_with_id`);--> statement-breakpoint
ALTER TABLE `expected_invoices` DROP COLUMN `matched_file_id`;--> statement-breakpoint
ALTER TABLE `expected_invoices` DROP COLUMN `match_confidence`;