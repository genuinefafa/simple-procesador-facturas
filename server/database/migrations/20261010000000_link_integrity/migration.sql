-- Migration: link integrity between facturas, files and expected_invoices (#203)
--
-- Invariants enforced by the DB from now on:
--   1. A file has at most one invoice          (idx_facturas_file, partial UNIQUE)
--   2. An expected invoice has at most one     (idx_facturas_expected_invoice, partial UNIQUE)
--   3. No two invoices with the same emitter + type + POS + number (unique_factura, UNIQUE;
--      it was declared with index() and created without UNIQUE despite its name)
--   4. unique_expected_invoice aligned with the import dedupe key
--      (cuit, invoice_type, point_of_sale, invoice_number). Some databases had a
--      hand-made UNIQUE (cuit, point_of_sale, invoice_number, issue_date) instead.
--
-- Idempotent (DROP IF EXISTS + CREATE): safe to apply by hand and again later.
-- PRECONDITION: the UNIQUE indexes fail if duplicates exist. Check first with:
--   SELECT group_concat(id) FROM facturas
--     GROUP BY emisor_cuit, tipo_comprobante, punto_venta, numero_comprobante HAVING count(*) > 1;
--   SELECT expected_invoice_id, group_concat(id) FROM facturas
--     WHERE expected_invoice_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
--   SELECT file_id, group_concat(id) FROM facturas
--     WHERE file_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
--   SELECT count(*) FROM (SELECT 1 FROM expected_invoices
--     GROUP BY cuit, invoice_type, point_of_sale, invoice_number HAVING count(*) > 1);

DROP INDEX IF EXISTS `unique_factura`;--> statement-breakpoint
CREATE UNIQUE INDEX `unique_factura` ON `facturas` (`emisor_cuit`,`tipo_comprobante`,`punto_venta`,`numero_comprobante`);--> statement-breakpoint
DROP INDEX IF EXISTS `idx_facturas_expected_invoice`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_facturas_expected_invoice` ON `facturas` (`expected_invoice_id`) WHERE "facturas"."expected_invoice_id" IS NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS `idx_facturas_file`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_facturas_file` ON `facturas` (`file_id`) WHERE "facturas"."file_id" IS NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS `unique_expected_invoice`;--> statement-breakpoint
CREATE UNIQUE INDEX `unique_expected_invoice` ON `expected_invoices` (`cuit`,`invoice_type`,`point_of_sale`,`invoice_number`);
