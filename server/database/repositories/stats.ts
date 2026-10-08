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

export interface StatsSummary {
  totals: StatsTotals;
  byCategory: CategoryStat[];
  byMonth: MonthCategoryStat[];
  byLetter: LetterStat[];
  pendingExpected: PendingExpectedStat;
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
