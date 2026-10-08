/**
 * Response types of GET /api/stats/summary.
 *
 * Mirrors server/database/repositories/stats.ts. Not imported from there
 * because that module pulls bun:sqlite into the client type-check.
 */

/** Reporting period key: `2026`, `2026-Q3` or `2026-09` */
export type PeriodKey = string;

/** Invoice letter buckets; anything other than A/B/C/M is `other` */
export type InvoiceLetter = 'A' | 'B' | 'C' | 'M' | 'other';

export interface StatsTotals {
  count: number;
  /** Signed total in ARS (credit notes subtract) */
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
  /** VAT fiscal credit: vat + vat_perception of A/M invoices with breakdown */
  vatCredit: number;
  /** Coverage over A/M invoices */
  coverage: { withBreakdown: number; total: number };
}

export interface StatsSummaryResponse {
  period: {
    key: PeriodKey;
    /** Inclusive, YYYY-MM-DD */
    from: string;
    /** Exclusive, YYYY-MM-DD */
    to: string;
  };
  totals: StatsTotals;
  byCategory: CategoryStat[];
  byMonth: MonthCategoryStat[];
  byLetter: LetterStat[];
  pendingExpected: PendingExpectedStat;
  taxBreakdown: TaxBreakdownStats;
}

export interface CategoryRef {
  id: number;
  key: string;
  description: string;
}
