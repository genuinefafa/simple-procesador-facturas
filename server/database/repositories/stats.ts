/**
 * Repository for dashboard stats (gold layer, #189).
 *
 * Totals read ONLY from v_comprobantes_oro (invoices = source of truth).
 * Pending expected invoices (ARCA, not yet validated) are reported apart and
 * never added to the totals.
 */

import { getRawDb } from '../db';
import { getInvoiceSign, type InvoiceLetter } from '../../utils/afip-codes';
import type { PeriodRange } from '../../contracts/stats';

export interface StatsTotals {
  count: number;
  total: number;
  vatRecoverableTotal: number;
  /** Invoices in the period left out of every total because they are not in ARS */
  foreignCurrencyCount: number;
}

export interface CategoryStat {
  /** null = "Sin categoría" bucket */
  categoryId: number | null;
  categoryKey: string | null;
  categoryDescription: string | null;
  count: number;
  total: number;
}

export interface MonthCategoryStat {
  /** YYYY-MM */
  month: string;
  categoryId: number | null;
  categoryKey: string | null;
  total: number;
}

export interface LetterStat {
  letter: InvoiceLetter;
  vatRecoverable: boolean;
  count: number;
  total: number;
}

export interface PendingExpectedStat {
  count: number;
  total: number;
}

export interface TaxBreakdownMonth {
  /** YYYY-MM */
  month: string;
  /** net_taxed + net_untaxed + exempt */
  net: number;
  /** vat + vat_perception */
  vat: number;
  /** iibb_perception + other_taxes */
  other: number;
}

export interface TaxBreakdownStats {
  /** Only invoices with a loaded breakdown (any letter), signed */
  byMonth: TaxBreakdownMonth[];
  /** SUM(vat + vat_perception) over A/M invoices with a loaded breakdown */
  vatCredit: number;
  /** Coverage over A/M invoices (vat_recoverable = 1) */
  coverage: { withBreakdown: number; total: number };
}

export interface StatsSummary {
  totals: StatsTotals;
  byCategory: CategoryStat[];
  byMonth: MonthCategoryStat[];
  byLetter: LetterStat[];
  pendingExpected: PendingExpectedStat;
  taxBreakdown: TaxBreakdownStats;
}

/**
 * Totals are in ARS only: amounts in other currencies are not converted, so
 * they are left out and counted apart (foreignCurrencyCount).
 */
const PERIOD_FILTER = "issue_date >= ? AND issue_date < ? AND COALESCE(currency, 'ARS') = 'ARS'";

export class StatsRepository {
  getSummary(range: PeriodRange): StatsSummary {
    return {
      totals: this.getTotals(range),
      byCategory: this.getByCategory(range),
      byMonth: this.getByMonth(range),
      byLetter: this.getByLetter(range),
      pendingExpected: this.getPendingExpected(range),
      taxBreakdown: this.getTaxBreakdown(range),
    };
  }

  getTotals({ from, to }: PeriodRange): StatsTotals {
    const row = getRawDb()
      .prepare(
        `SELECT
           COUNT(*) AS count,
           COALESCE(SUM(signed_total), 0) AS total,
           COALESCE(SUM(CASE WHEN vat_recoverable = 1 THEN signed_total END), 0) AS vatRecoverableTotal,
           (SELECT COUNT(*) FROM v_comprobantes_oro
            WHERE issue_date >= ? AND issue_date < ? AND COALESCE(currency, 'ARS') <> 'ARS') AS foreignCurrencyCount
         FROM v_comprobantes_oro
         WHERE ${PERIOD_FILTER}`
      )
      .get(from, to, from, to) as StatsTotals;
    return row;
  }

  /** Ordered by total, descending. Includes the uncategorized bucket. */
  getByCategory({ from, to }: PeriodRange): CategoryStat[] {
    return getRawDb()
      .prepare(
        `SELECT
           category_id AS categoryId,
           category_key AS categoryKey,
           category_description AS categoryDescription,
           COUNT(*) AS count,
           COALESCE(SUM(signed_total), 0) AS total
         FROM v_comprobantes_oro
         WHERE ${PERIOD_FILTER}
         GROUP BY category_id
         ORDER BY total DESC`
      )
      .all(from, to) as CategoryStat[];
  }

  getByMonth({ from, to }: PeriodRange): MonthCategoryStat[] {
    return getRawDb()
      .prepare(
        `SELECT
           issue_month AS month,
           category_id AS categoryId,
           category_key AS categoryKey,
           COALESCE(SUM(signed_total), 0) AS total
         FROM v_comprobantes_oro
         WHERE ${PERIOD_FILTER}
         GROUP BY issue_month, category_id
         ORDER BY issue_month, total DESC`
      )
      .all(from, to) as MonthCategoryStat[];
  }

  getByLetter({ from, to }: PeriodRange): LetterStat[] {
    const rows = getRawDb()
      .prepare(
        `SELECT
           letter,
           vat_recoverable AS vatRecoverable,
           COUNT(*) AS count,
           COALESCE(SUM(signed_total), 0) AS total
         FROM v_comprobantes_oro
         WHERE ${PERIOD_FILTER}
         GROUP BY letter
         ORDER BY total DESC`
      )
      .all(from, to) as Array<Omit<LetterStat, 'vatRecoverable'> & { vatRecoverable: number }>;
    return rows.map((r) => ({ ...r, vatRecoverable: r.vatRecoverable === 1 }));
  }

  /**
   * Net / VAT / other by month, VAT fiscal credit and coverage. Invoices
   * without a loaded breakdown are never estimated: they only count in the
   * coverage total.
   */
  getTaxBreakdown({ from, to }: PeriodRange): TaxBreakdownStats {
    const db = getRawDb();
    const byMonth = db
      .prepare(
        `SELECT
           issue_month AS month,
           COALESCE(SUM(net_taxed + net_untaxed + exempt), 0) AS net,
           COALESCE(SUM(vat + vat_perception), 0) AS vat,
           COALESCE(SUM(iibb_perception + other_taxes), 0) AS other
         FROM v_comprobantes_oro
         WHERE ${PERIOD_FILTER} AND has_tax_breakdown = 1
         GROUP BY issue_month
         ORDER BY issue_month`
      )
      .all(from, to) as TaxBreakdownMonth[];

    const credit = db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN has_tax_breakdown = 1 THEN vat + vat_perception END), 0) AS vatCredit,
           COALESCE(SUM(has_tax_breakdown), 0) AS withBreakdown,
           COUNT(*) AS total
         FROM v_comprobantes_oro
         WHERE ${PERIOD_FILTER} AND vat_recoverable = 1`
      )
      .get(from, to) as { vatCredit: number; withBreakdown: number; total: number };

    return {
      byMonth,
      vatCredit: credit.vatCredit,
      coverage: { withBreakdown: credit.withBreakdown, total: credit.total },
    };
  }

  /**
   * Expected invoices informed by ARCA and not yet validated as an invoice.
   * Signed with the same ARCA map as the gold view (credit notes subtract).
   */
  getPendingExpected({ from, to }: PeriodRange): PendingExpectedStat {
    const rows = getRawDb()
      .prepare(
        `SELECT ei.invoice_type AS invoiceType, ei.total AS total
         FROM expected_invoices ei
         WHERE ei.status = 'pending'
           AND substr(ei.issue_date, 1, 10) >= ? AND substr(ei.issue_date, 1, 10) < ?
           AND COALESCE(ei.currency, 'ARS') = 'ARS'
           AND NOT EXISTS (SELECT 1 FROM facturas f WHERE f.expected_invoice_id = ei.id)`
      )
      .all(from, to) as Array<{ invoiceType: number | null; total: number | null }>;

    return {
      count: rows.length,
      total: rows.reduce((sum, r) => sum + getInvoiceSign(r.invoiceType) * (r.total ?? 0), 0),
    };
  }
}
