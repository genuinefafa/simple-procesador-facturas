-- Migration: issued invoices (ARCA "Mis Comprobantes Emitidos") + gold view
--
-- Single layer: ARCA is the source of truth for what was issued, so a reimport
-- overwrites every field it carries. Unique key: (invoice_type, point_of_sale,
-- invoice_number). v_emitidas_oro mirrors v_comprobantes_oro's letter/sign
-- lists and exposes signed amounts (credit notes subtract).
--
-- Idempotent on purpose: migrations are applied by hand in production
-- (drizzle migration tracking is out of sync there).

CREATE TABLE IF NOT EXISTS `issued_invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`issue_date` text NOT NULL,
	`invoice_type` integer NOT NULL,
	`point_of_sale` integer NOT NULL,
	`invoice_number` integer NOT NULL,
	`invoice_number_to` integer,
	`cae` text,
	`receiver_doc_type` text,
	`receiver_doc_number` text,
	`receiver_name` text,
	`currency` text,
	`exchange_rate` real,
	`net_taxed_0` real,
	`net_taxed_2_5` real,
	`net_taxed_5` real,
	`net_taxed_10_5` real,
	`net_taxed_21` real,
	`net_taxed_27` real,
	`vat_2_5` real,
	`vat_5` real,
	`vat_10_5` real,
	`vat_21` real,
	`vat_27` real,
	`net_taxed_total` real,
	`net_untaxed` real,
	`exempt` real,
	`other_taxes` real,
	`vat_total` real,
	`total` real,
	`imported_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `unique_issued_invoice` ON `issued_invoices` (`invoice_type`, `point_of_sale`, `invoice_number`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_issued_invoices_date` ON `issued_invoices` (`issue_date`);
--> statement-breakpoint
DROP VIEW IF EXISTS `v_emitidas_oro`;
--> statement-breakpoint
CREATE VIEW `v_emitidas_oro` AS
SELECT
  base.id AS issued_invoice_id,
  base.issue_date,
  substr(base.issue_date, 1, 7) AS issue_month,
  base.invoice_type,
  base.letter,
  base.sign,
  base.point_of_sale,
  base.invoice_number,
  base.receiver_doc_number,
  base.receiver_name,
  base.currency,
  base.total,
  base.sign * COALESCE(base.total, 0) AS signed_total,
  base.sign * (
    COALESCE(base.net_taxed_total, 0) + COALESCE(base.net_untaxed, 0) + COALESCE(base.exempt, 0)
  ) AS net,
  base.sign * COALESCE(base.vat_total, 0) AS vat,
  base.sign * COALESCE(base.other_taxes, 0) AS other_taxes
FROM (
  SELECT
    i.*,
    CASE
      WHEN i.invoice_type IN (1, 2, 3, 4, 5, 39, 60, 63, 81, 112, 115, 201, 202, 203) THEN 'A'
      WHEN i.invoice_type IN (6, 7, 8, 9, 10, 40, 61, 64, 82, 113, 116, 206, 207, 208) THEN 'B'
      WHEN i.invoice_type IN (11, 12, 13, 15, 109, 111, 114, 117, 211, 212, 213) THEN 'C'
      WHEN i.invoice_type IN (51, 52, 53, 54, 118, 119, 120) THEN 'M'
      ELSE 'other'
    END AS letter,
    CASE
      WHEN i.invoice_type IN (3, 8, 13, 21, 53, 110, 112, 113, 114, 119, 203, 208, 213) THEN -1
      ELSE 1
    END AS sign
  FROM issued_invoices i
) base;
