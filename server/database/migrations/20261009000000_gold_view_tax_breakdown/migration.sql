-- Migration: tax breakdown columns in the gold view (v_comprobantes_oro)
--
-- Same view as 20261008023350_gold_view (all previous columns are kept, same
-- rules) plus the per-concept tax breakdown loaded in invoice_tax_lines
-- (silver layer, positive amounts also for credit notes).
--
-- New columns:
--   * has_tax_breakdown: 1 if the invoice has at least one tax line, else 0.
--   * net_taxed, net_untaxed, exempt, vat, vat_perception, iibb_perception,
--     other_taxes: sum of the lines of that concept multiplied by `sign`
--     (same sign as signed_total, so credit notes are negative).
--
-- NULL vs 0: an invoice WITHOUT tax lines has NULL in the 7 concept columns
-- (unknown breakdown, never estimated). An invoice WITH lines but none of a
-- given concept has 0 in that column.
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
  base.balance_group_id,
  CASE WHEN tl.invoice_id IS NOT NULL THEN 1 ELSE 0 END AS has_tax_breakdown,
  base.sign * tl.net_taxed AS net_taxed,
  base.sign * tl.net_untaxed AS net_untaxed,
  base.sign * tl.exempt AS exempt,
  base.sign * tl.vat AS vat,
  base.sign * tl.vat_perception AS vat_perception,
  base.sign * tl.iibb_perception AS iibb_perception,
  base.sign * tl.other_taxes AS other_taxes
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
) base
LEFT JOIN (
  SELECT
    invoice_id,
    SUM(CASE WHEN concept = 'NET_TAXED' THEN amount ELSE 0 END) AS net_taxed,
    SUM(CASE WHEN concept = 'NET_UNTAXED' THEN amount ELSE 0 END) AS net_untaxed,
    SUM(CASE WHEN concept = 'EXEMPT' THEN amount ELSE 0 END) AS exempt,
    SUM(CASE WHEN concept = 'VAT' THEN amount ELSE 0 END) AS vat,
    SUM(CASE WHEN concept = 'VAT_PERCEPTION' THEN amount ELSE 0 END) AS vat_perception,
    SUM(CASE WHEN concept = 'IIBB_PERCEPTION' THEN amount ELSE 0 END) AS iibb_perception,
    SUM(CASE WHEN concept = 'OTHER_TAXES' THEN amount ELSE 0 END) AS other_taxes
  FROM invoice_tax_lines
  GROUP BY invoice_id
) tl ON tl.invoice_id = base.invoice_id;
