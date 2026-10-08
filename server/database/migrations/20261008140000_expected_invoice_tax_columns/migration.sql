-- Migration: ARCA tax breakdown as columns on expected_invoices (#129)
--
-- expected_invoices is the bronze layer: what ARCA reports, as-is. The
-- "Mis Comprobantes Recibidos" Excel has a fixed layout, so the breakdown is
-- stored as nullable columns (no projection to rows). Re-importing the Excel
-- backfills them through the regular "updated" path.
--
-- NOT idempotent: SQLite has no ADD COLUMN IF NOT EXISTS, so each ALTER TABLE
-- fails with "duplicate column name" if it was already applied. In production
-- this is applied by hand; run it exactly once, with
--   sqlite3 -bail data/database.sqlite < migration.sql
-- (-bail stops at the first error). If it fails with "duplicate column", the
-- columns are already there and nothing else needs to be done.
--
-- All columns are REAL and nullable (old / simple Excel formats do not have them).
ALTER TABLE `expected_invoices` ADD `net_taxed_0` real;
--> statement-breakpoint
ALTER TABLE `expected_invoices` ADD `net_taxed_2_5` real;
--> statement-breakpoint
ALTER TABLE `expected_invoices` ADD `net_taxed_5` real;
--> statement-breakpoint
ALTER TABLE `expected_invoices` ADD `net_taxed_10_5` real;
--> statement-breakpoint
ALTER TABLE `expected_invoices` ADD `net_taxed_21` real;
--> statement-breakpoint
ALTER TABLE `expected_invoices` ADD `net_taxed_27` real;
--> statement-breakpoint
ALTER TABLE `expected_invoices` ADD `vat_2_5` real;
--> statement-breakpoint
ALTER TABLE `expected_invoices` ADD `vat_5` real;
--> statement-breakpoint
ALTER TABLE `expected_invoices` ADD `vat_10_5` real;
--> statement-breakpoint
ALTER TABLE `expected_invoices` ADD `vat_21` real;
--> statement-breakpoint
ALTER TABLE `expected_invoices` ADD `vat_27` real;
--> statement-breakpoint
ALTER TABLE `expected_invoices` ADD `net_taxed_total` real;
--> statement-breakpoint
ALTER TABLE `expected_invoices` ADD `net_untaxed` real;
--> statement-breakpoint
ALTER TABLE `expected_invoices` ADD `exempt` real;
--> statement-breakpoint
ALTER TABLE `expected_invoices` ADD `other_taxes` real;
--> statement-breakpoint
ALTER TABLE `expected_invoices` ADD `vat_total` real;
--> statement-breakpoint
ALTER TABLE `expected_invoices` ADD `exchange_rate` real;
