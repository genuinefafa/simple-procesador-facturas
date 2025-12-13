-- Remove category_id from expected_invoices (no se usa en revisión)
ALTER TABLE `expected_invoices` DROP COLUMN `category_id`;
