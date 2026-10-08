-- Migration: gold layer view for reporting (#189)
--
-- One row per invoice (facturas = silver layer, the source of truth).
-- Expected invoices (ARCA) and files are inputs and are NOT read here.
--
-- Rules:
--   * letter: A / B / C / M / other, from the ARCA code.
--   * sign: -1 for credit notes (stored positive in facturas), +1 otherwise.
--   * signed_total = sign * total.
--   * vat_recoverable: 1 for A and M.
--   * Balance group secondaries are NOT excluded: every invoice counts with
--     its sign, so a group (e.g. invoice + credit note) nets out by itself.
--     balance_group_id is informative (principal expected invoice id).
--   * issue_date is normalized to YYYY-MM-DD (some rows carry a full ISO
--     timestamp).
--
-- The letter/sign CASE lists mirror server/utils/afip-types.json.
-- tests/api/gold-view.test.ts checks every code against getInvoiceLetter()
-- and getInvoiceSign(); update both together.
--
-- Idempotent on purpose: migrations are applied by hand in production
-- (drizzle migration tracking is out of sync there).

DROP VIEW IF EXISTS `v_comprobantes_oro`;
--> statement-breakpoint
CREATE VIEW `v_comprobantes_oro` AS
SELECT
  base.invoice_id,
  base.issue_date,
  substr(base.issue_date, 1, 7) AS issue_month,
  base.cuit,
  base.invoice_type,
  base.letter,
  base.sign,
  base.total,
  base.sign * base.total AS signed_total,
  CASE WHEN base.letter IN ('A', 'M') THEN 1 ELSE 0 END AS vat_recoverable,
  base.currency,
  base.category_id,
  base.category_key,
  base.category_description,
  base.expected_invoice_id,
  base.balance_group_id
FROM (
  SELECT
    f.id AS invoice_id,
    substr(f.fecha_emision, 1, 10) AS issue_date,
    f.emisor_cuit AS cuit,
    f.tipo_comprobante AS invoice_type,
    CASE
      WHEN f.tipo_comprobante IN (1, 2, 3, 4, 5, 60, 63, 81, 201, 202, 203) THEN 'A'
      WHEN f.tipo_comprobante IN (6, 7, 8, 9, 10, 61, 64, 82, 206, 207, 208) THEN 'B'
      WHEN f.tipo_comprobante IN (11, 12, 13, 15, 111, 211, 212, 213) THEN 'C'
      WHEN f.tipo_comprobante IN (51, 52, 53, 118) THEN 'M'
      ELSE 'other'
    END AS letter,
    CASE
      WHEN f.tipo_comprobante IN (3, 8, 13, 21, 53, 203, 208, 213) THEN -1
      ELSE 1
    END AS sign,
    f.total,
    f.moneda AS currency,
    f.category_id,
    c.key AS category_key,
    c.description AS category_description,
    f.expected_invoice_id,
    CASE
      WHEN ei.balanced_with_id IS NOT NULL THEN ei.balanced_with_id
      WHEN EXISTS (
        SELECT 1 FROM expected_invoices child WHERE child.balanced_with_id = ei.id
      ) THEN ei.id
    END AS balance_group_id
  FROM facturas f
  LEFT JOIN categories c ON c.id = f.category_id
  LEFT JOIN expected_invoices ei ON ei.id = f.expected_invoice_id
) base;
