-- Migration: reconciliation acks (#191, silver vs bronze)
--
-- Pins a difference between an invoice and its ARCA reference as "accepted".
-- The ack stores a fingerprint of the ARCA values at the time it was accepted:
-- if ARCA changes (or the invoice is linked to another expected invoice) the
-- fingerprint no longer matches and the difference shows up as divergent again.
--
-- kind: 'tax_breakdown' today; reusable for other reconciled fields.
--
-- Idempotent on purpose: migrations are applied by hand in production
-- (drizzle migration tracking is out of sync there).

CREATE TABLE IF NOT EXISTS `reconciliation_acks` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`invoice_id` integer NOT NULL,
	`kind` text NOT NULL,
	`arca_fingerprint` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `fk_reconciliation_acks_invoice_id_facturas_id_fk` FOREIGN KEY (`invoice_id`) REFERENCES `facturas`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_reconciliation_acks_invoice_kind` ON `reconciliation_acks` (`invoice_id`, `kind`);
