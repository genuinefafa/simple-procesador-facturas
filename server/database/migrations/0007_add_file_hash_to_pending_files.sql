ALTER TABLE `pending_files` ADD `file_hash` text;--> statement-breakpoint
CREATE INDEX `idx_pending_files_hash` ON `pending_files` (`file_hash`);
