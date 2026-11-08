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
  /** net_taxed + net_untaxed + exempt + undiscriminated */
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

export interface IncomeVsExpensesMonth {
  /** YYYY-MM */
  month: string;
  /** Issued net (v_emitidas_oro), credit notes subtract */
  income: number;
  /** Received net (v_comprobantes_oro), same expression as the tax breakdown net */
  expenses: number;
  /** Issued VAT */
  vatDebit: number;
  /** Recoverable VAT (A/M) of received invoices, without perception */
  vatCredit: number;
  /** Recoverable VAT perception (A/M) of received invoices */
  vatPerception: number;
  /** vatDebit - (vatCredit + vatPerception); positive = payable */
  vatBalance: number;
  /** ARCA-informed received invoices of the month with no linked invoice */
  expectedNotLoadedCount: number;
  /** Their signed total (credit notes subtract) */
  expectedNotLoadedTotal: number;
}

export interface IncomeVsExpensesTotals {
  income: number;
  expenses: number;
  /** income - expenses */
  result: number;
  vatDebit: number;
  vatCredit: number;
  vatPerception: number;
  vatBalance: number;
}

export interface IncomeVsExpensesCoverage {
  /** Issued invoices in the period */
  issuedCount: number;
  /** Received ARS invoices with no tax breakdown (no net, not estimated) */
  invoicesWithoutBreakdown: number;
  /** Their signed_total (credit notes subtract), informative only */
  invoicesWithoutBreakdownTotal: number;
  /** Their absolute total (invoices and credit notes added), never negative */
  invoicesWithoutBreakdownGross: number;
  /** Months (YYYY-MM) with issued invoices and no received invoices loaded */
  monthsWithIncomeWithoutExpenses: string[];
  /** Same criterion as pendingExpected: received ARCA rows with no linked invoice */
  expectedNotLoaded: PendingExpectedStat;
  /** Months (YYYY-MM) with at least one expected invoice not loaded */
  monthsWithExpectedNotLoaded: string[];
}

export interface IncomeVsExpensesStats {
  months: IncomeVsExpensesMonth[];
  totals: IncomeVsExpensesTotals;
  coverage: IncomeVsExpensesCoverage;
}

export interface StatsSummary {
  totals: StatsTotals;
  byCategory: CategoryStat[];
  byMonth: MonthCategoryStat[];
  byLetter: LetterStat[];
  pendingExpected: PendingExpectedStat;
  taxBreakdown: TaxBreakdownStats;
  incomeVsExpenses: IncomeVsExpensesStats;
}

/**
 * Totals are in ARS only: amounts in other currencies are not converted, so
 * they are left out and counted apart (foreignCurrencyCount).
 */
const PERIOD_FILTER = "issue_date >= ? AND issue_date < ? AND COALESCE(currency, 'ARS') = 'ARS'";

/**
 * Issued invoices come from the ARCA Excel, where the currency is the literal
 * text of the sheet ("$" for pesos). Same ARS-only criterion as PERIOD_FILTER.
 * TODO: See issue #199 (multi-currency: convert instead of excluding)
 */
const ISSUED_PERIOD_FILTER =
  "issue_date >= ? AND issue_date < ? AND COALESCE(NULLIF(TRIM(currency), ''), '$') IN ('$', 'ARS')";

/**
 * Expected invoices informed by ARCA and not yet validated as an invoice.
 * Shared by getPendingExpected and the income vs expenses coverage so both
 * always count the same rows.
 */
const PENDING_EXPECTED_FROM = `FROM expected_invoices ei
         WHERE ei.status = 'pending'
           AND substr(ei.issue_date, 1, 10) >= ? AND substr(ei.issue_date, 1, 10) < ?
           AND COALESCE(ei.currency, 'ARS') = 'ARS'
           AND NOT EXISTS (SELECT 1 FROM facturas f WHERE f.expected_invoice_id = ei.id)`;

/** Rounds to cents so float noise never reaches the API */
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export class StatsRepository {
  getSummary(range: PeriodRange): StatsSummary {
    return {
      totals: this.getTotals(range),
      byCategory: this.getByCategory(range),
      byMonth: this.getByMonth(range),
      byLetter: this.getByLetter(range),
      pendingExpected: this.getPendingExpected(range),
      taxBreakdown: this.getTaxBreakdown(range),
      incomeVsExpenses: this.getIncomeVsExpenses(range),
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
           COALESCE(SUM(net_taxed + net_untaxed + exempt + undiscriminated), 0) AS net,
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
   * Issued (v_emitidas_oro) vs received (v_comprobantes_oro) by month, all by
   * issue date. Expenses use the same net expression as getTaxBreakdown;
   * the VAT credit is the same criterion as TaxBreakdownStats.vatCredit
   * (vat_recoverable = 1) but split from the perception. Received invoices
   * without a breakdown contribute no net: they are only reported as coverage.
   * Issued amounts are filtered to pesos like the received side (no FX).
   * Coverage also reports ARCA-informed received rows with no linked invoice
   * (same rows as getPendingExpected), by month and in total.
   */
  getIncomeVsExpenses({ from, to }: PeriodRange): IncomeVsExpensesStats {
    const db = getRawDb();
    const issued = db
      .prepare(
        `SELECT
           issue_month AS month,
           COALESCE(SUM(net), 0) AS income,
           COALESCE(SUM(vat), 0) AS vatDebit,
           COUNT(*) AS count
         FROM v_emitidas_oro
         WHERE ${ISSUED_PERIOD_FILTER}
         GROUP BY issue_month`
      )
      .all(from, to) as Array<{ month: string; income: number; vatDebit: number; count: number }>;

    const received = db
      .prepare(
        `SELECT
           issue_month AS month,
           COALESCE(SUM(CASE WHEN has_tax_breakdown = 1 THEN
             COALESCE(net_taxed, 0) + COALESCE(net_untaxed, 0) + COALESCE(exempt, 0) + COALESCE(undiscriminated, 0)
           END), 0) AS expenses,
           COALESCE(SUM(CASE WHEN has_tax_breakdown = 1 AND vat_recoverable = 1 THEN COALESCE(vat, 0) END), 0) AS vatCredit,
           COALESCE(SUM(CASE WHEN has_tax_breakdown = 1 AND vat_recoverable = 1 THEN COALESCE(vat_perception, 0) END), 0) AS vatPerception
         FROM v_comprobantes_oro
         WHERE ${PERIOD_FILTER}
         GROUP BY issue_month`
      )
      .all(from, to) as Array<{
      month: string;
      expenses: number;
      vatCredit: number;
      vatPerception: number;
    }>;

    const noBreakdown = db
      .prepare(
        `SELECT COUNT(*) AS count,
                COALESCE(SUM(signed_total), 0) AS total,
                COALESCE(SUM(ABS(signed_total)), 0) AS gross
         FROM v_comprobantes_oro
         WHERE ${PERIOD_FILTER} AND has_tax_breakdown = 0`
      )
      .get(from, to) as { count: number; total: number; gross: number };

    const notLoaded = this.queryPendingExpected({ from, to });

    const loadedMonths = new Set(
      (
        db
          .prepare(
            `SELECT DISTINCT issue_month AS month FROM v_comprobantes_oro WHERE ${PERIOD_FILTER}`
          )
          .all(from, to) as Array<{ month: string }>
      ).map((r) => r.month)
    );

    const byMonth = new Map<string, IncomeVsExpensesMonth>();
    const rowOf = (month: string): IncomeVsExpensesMonth => {
      let row = byMonth.get(month);
      if (!row) {
        row = {
          month,
          income: 0,
          expenses: 0,
          vatDebit: 0,
          vatCredit: 0,
          vatPerception: 0,
          vatBalance: 0,
          expectedNotLoadedCount: 0,
          expectedNotLoadedTotal: 0,
        };
        byMonth.set(month, row);
      }
      return row;
    };
    for (const r of issued) {
      const row = rowOf(r.month);
      row.income = r.income;
      row.vatDebit = r.vatDebit;
    }
    for (const r of received) {
      const row = rowOf(r.month);
      row.expenses = r.expenses;
      row.vatCredit = r.vatCredit;
      row.vatPerception = r.vatPerception;
    }
    for (const r of notLoaded) {
      const row = rowOf(r.month);
      row.expectedNotLoadedCount += 1;
      row.expectedNotLoadedTotal += getInvoiceSign(r.invoiceType) * (r.total ?? 0);
    }
    const months = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
    for (const m of months) {
      m.vatBalance = m.vatDebit - m.vatCredit - m.vatPerception;
      m.income = round2(m.income);
      m.expenses = round2(m.expenses);
      m.vatDebit = round2(m.vatDebit);
      m.vatCredit = round2(m.vatCredit);
      m.vatPerception = round2(m.vatPerception);
      m.vatBalance = round2(m.vatBalance);
      m.expectedNotLoadedTotal = round2(m.expectedNotLoadedTotal);
    }

    const sum = (pick: (m: IncomeVsExpensesMonth) => number): number =>
      months.reduce((acc, m) => acc + pick(m), 0);
    const totals: IncomeVsExpensesTotals = {
      income: round2(sum((m) => m.income)),
      expenses: round2(sum((m) => m.expenses)),
      result: 0,
      vatDebit: round2(sum((m) => m.vatDebit)),
      vatCredit: round2(sum((m) => m.vatCredit)),
      vatPerception: round2(sum((m) => m.vatPerception)),
      vatBalance: round2(sum((m) => m.vatBalance)),
    };
    totals.result = round2(totals.income - totals.expenses);

    return {
      months,
      totals,
      coverage: {
        issuedCount: issued.reduce((acc, r) => acc + r.count, 0),
        invoicesWithoutBreakdown: noBreakdown.count,
        invoicesWithoutBreakdownTotal: round2(noBreakdown.total),
        invoicesWithoutBreakdownGross: round2(noBreakdown.gross),
        monthsWithIncomeWithoutExpenses: issued
          .filter((r) => !loadedMonths.has(r.month))
          .map((r) => r.month)
          .sort(),
        expectedNotLoaded: {
          count: notLoaded.length,
          total: round2(
            notLoaded.reduce((acc, r) => acc + getInvoiceSign(r.invoiceType) * (r.total ?? 0), 0)
          ),
        },
        monthsWithExpectedNotLoaded: months
          .filter((m) => m.expectedNotLoadedCount > 0)
          .map((m) => m.month),
      },
    };
  }

  /**
   * Expected invoices informed by ARCA and not yet validated as an invoice.
   * Signed with the same ARCA map as the gold view (credit notes subtract).
   */
  getPendingExpected(range: PeriodRange): PendingExpectedStat {
    const rows = this.queryPendingExpected(range);
    return {
      count: rows.length,
      total: rows.reduce((sum, r) => sum + getInvoiceSign(r.invoiceType) * (r.total ?? 0), 0),
    };
  }

  private queryPendingExpected({ from, to }: PeriodRange): Array<{
    month: string;
    invoiceType: number | null;
    total: number | null;
  }> {
    return getRawDb()
      .prepare(
        `SELECT substr(ei.issue_date, 1, 7) AS month, ei.invoice_type AS invoiceType, ei.total AS total
         ${PENDING_EXPECTED_FROM}`
      )
      .all(from, to) as Array<{
      month: string;
      invoiceType: number | null;
      total: number | null;
    }>;
  }
}
