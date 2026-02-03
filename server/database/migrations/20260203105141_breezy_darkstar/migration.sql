DROP INDEX IF EXISTS `idx_emisores_cuit_num`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_file_extraction_file_method` ON `file_extraction_results` (`file_id`,`method`);--> statement-breakpoint
ALTER TABLE `emisores` DROP COLUMN `cuit_numerico`;