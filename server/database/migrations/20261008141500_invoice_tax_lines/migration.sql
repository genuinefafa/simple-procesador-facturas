-- Migration: tax breakdown per invoice (#190, silver layer)
--
-- One row per concept of the invoice tax breakdown. facturas stays the
-- source of truth for the total; these lines are a projection that the user
-- loads/validates. Credit notes are stored with POSITIVE amounts (same as
-- facturas.total); the sign is applied by the gold layer.
--
-- concept: NET_TAXED | NET_UNTAXED | EXEMPT | VAT | VAT_PERCEPTION | OTHER_TAXES
-- rate:    VAT rate in %, only for NET_TAXED and VAT (NULL otherwise)
-- label:   optional free text for VAT_PERCEPTION / OTHER_TAXES
--
-- Idempotent on purpose: migrations are applied by hand in production
-- (drizzle migration tracking is out of sync there).

CREATE TABLE IF NOT EXISTS `invoice_tax_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`invoice_id` integer NOT NULL,
	`concept` text NOT NULL,
	`rate` real,
	`amount` real NOT NULL,
	`label` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `fk_invoice_tax_lines_invoice_id_facturas_id_fk` FOREIGN KEY (`invoice_id`) REFERENCES `facturas`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_invoice_tax_lines_invoice` ON `invoice_tax_lines` (`invoice_id`);
