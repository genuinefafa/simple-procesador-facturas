/**
 * Pure helpers for the dashboard charts: period handling, deep-link query
 * building, category color assignment and percentages.
 */

import type { CategoryStat, LetterStat, MonthCategoryStat } from '$lib/services/StatsService.types';

// ============================================================================
// Periods
// ============================================================================

export type PeriodKind = 'year' | 'quarter' | 'month';

export interface ParsedPeriod {
  kind: PeriodKind;
  year: number;
  /** 1-4, only for quarters */
  quarter?: number;
  /** 1-12, only for months */
  month?: number;
}

const PERIOD_REGEX = /^(\d{4})(?:-Q([1-4])|-(0[1-9]|1[0-2]))?$/;

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export function parsePeriod(key: string | null | undefined): ParsedPeriod | null {
  if (!key) return null;
  const match = PERIOD_REGEX.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  if (match[2]) return { kind: 'quarter', year, quarter: Number(match[2]) };
  if (match[3]) return { kind: 'month', year, month: Number(match[3]) };
  return { kind: 'year', year };
}

export function buildPeriodKey(period: ParsedPeriod): string {
  if (period.kind === 'quarter') return `${period.year}-Q${period.quarter ?? 1}`;
  if (period.kind === 'month') return `${period.year}-${pad2(period.month ?? 1)}`;
  return String(period.year);
}

/** Default period: the current year */
export function defaultPeriodKey(now: Date = new Date()): string {
  return String(now.getFullYear());
}

/** Valid period from a URL param, or the current year */
export function resolvePeriodKey(param: string | null | undefined, now: Date = new Date()): string {
  return parsePeriod(param) ? (param as string) : defaultPeriodKey(now);
}

/** Switches the kind of a period keeping the year (and a sensible sub-value) */
export function changePeriodKind(
  period: ParsedPeriod,
  kind: PeriodKind,
  now: Date = new Date()
): ParsedPeriod {
  if (kind === period.kind) return period;
  const currentMonth = now.getMonth() + 1;
  if (kind === 'year') return { kind, year: period.year };
  if (kind === 'quarter') {
    const month = period.month ?? currentMonth;
    return { kind, year: period.year, quarter: period.quarter ?? Math.ceil(month / 3) };
  }
  const month = period.quarter ? (period.quarter - 1) * 3 + 1 : currentMonth;
  return { kind, year: period.year, month };
}

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? String(month);
}

export function periodLabel(key: string): string {
  const p = parsePeriod(key);
  if (!p) return key;
  if (p.kind === 'quarter') return `${p.quarter}.º trimestre de ${p.year}`;
  if (p.kind === 'month') return `${monthName(p.month ?? 1)} de ${p.year}`;
  return String(p.year);
}

/** Inclusive [first day, last day] of a quarter, YYYY-MM-DD */
export function quarterRange(year: number, quarter: number): { from: string; to: string } {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  return {
    from: `${year}-${pad2(startMonth)}-01`,
    to: `${year}-${pad2(endMonth)}-${pad2(daysInMonth(year, endMonth))}`,
  };
}

/** Months (YYYY-MM) covered by a period, in order */
export function monthsOfPeriod(key: string): string[] {
  const p = parsePeriod(key);
  if (!p) return [];
  if (p.kind === 'month') return [`${p.year}-${pad2(p.month ?? 1)}`];
  const first = p.kind === 'quarter' ? ((p.quarter ?? 1) - 1) * 3 + 1 : 1;
  const count = p.kind === 'quarter' ? 3 : 12;
  return Array.from({ length: count }, (_, i) => `${p.year}-${pad2(first + i)}`);
}

/** Search `fecha:` filter that matches the whole period */
export function periodDateFilter(key: string): string {
  const p = parsePeriod(key);
  if (!p) return '';
  if (p.kind === 'year') return `fecha:${p.year}`;
  if (p.kind === 'month') return `fecha:${p.year}-${pad2(p.month ?? 1)}`;
  const { from, to } = quarterRange(p.year, p.quarter ?? 1);
  return `fecha:${from}..${to}`;
}

/** "ene", "feb"... for a YYYY-MM string */
export function shortMonthLabel(month: string): string {
  const m = Number(month.slice(5, 7));
  return monthName(m).slice(0, 3);
}

// ============================================================================
// Deep links into /comprobantes
// ============================================================================

export function comprobantesUrl(q: string): string {
  return `/comprobantes?q=${encodeURIComponent(q)}`;
}

function categoryFilter(categoryKey: string | null): string {
  return `categoria:${categoryKey ?? 'sin'}`;
}

export function categoryQuery(categoryKey: string | null, period: string): string {
  return `${categoryFilter(categoryKey)} ${periodDateFilter(period)}`.trim();
}

export function monthCategoryQuery(categoryKey: string | null, month: string): string {
  return `${categoryFilter(categoryKey)} fecha:${month}`;
}

export function letterQuery(letter: LetterStat['letter'], period: string): string {
  return `letra:${letter === 'other' ? 'otro' : letter} ${periodDateFilter(period)}`.trim();
}

export function pendingExpectedQuery(period: string): string {
  return `estado:esperadas ${periodDateFilter(period)}`.trim();
}

/** Unprocessed files. Deliberately without a count: see issue #123. */
export function pendingFilesQuery(): string {
  return 'estado:pendientes';
}

// ============================================================================
// Colors
// ============================================================================

export const CHART_SLOTS = 8;
export const OTHER_COLOR = 'var(--color-chart-other)';

/**
 * Colors follow the ENTITY, not the ranking: slots are assigned by ascending
 * category id, so a category keeps its color across periods. Categories
 * beyond the 8th slot get the neutral "other" color (palette is never cycled).
 */
export function assignCategoryColors(categoryIds: number[]): Map<number, string> {
  const sorted = [...new Set(categoryIds)].sort((a, b) => a - b);
  const colors = new Map<number, string>();
  sorted.forEach((id, i) => {
    colors.set(id, i < CHART_SLOTS ? `var(--color-chart-${i + 1})` : OTHER_COLOR);
  });
  return colors;
}

export function categoryColor(categoryId: number | null, colors: Map<number, string>): string {
  if (categoryId === null) return OTHER_COLOR;
  return colors.get(categoryId) ?? OTHER_COLOR;
}

export const LETTER_COLORS: Record<LetterStat['letter'], string> = {
  A: 'var(--color-primary-600)',
  M: 'var(--color-primary-400)',
  B: 'var(--color-neutral-600)',
  C: 'var(--color-neutral-400)',
  other: 'var(--color-neutral-300)',
};

export const LETTER_LABELS: Record<LetterStat['letter'], string> = {
  A: 'Factura A',
  M: 'Factura M',
  B: 'Factura B',
  C: 'Factura C',
  other: 'Otras letras',
};

export const LETTER_ORDER: LetterStat['letter'][] = ['A', 'M', 'B', 'C', 'other'];

// ============================================================================
// Numbers
// ============================================================================

/**
 * Share of `part` in `whole` as a percentage. Null when `whole` is zero or
 * negative (e.g. a period dominated by credit notes), where a share is
 * meaningless.
 */
export function percentOf(part: number, whole: number): number | null {
  if (!(whole > 0)) return null;
  return (part / whole) * 100;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

const compactFormatter = new Intl.NumberFormat('es-AR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** Short amount for chart axes, e.g. "1,2 M" */
export function formatCompact(value: number): string {
  return compactFormatter.format(value);
}

// ============================================================================
// Chart data
// ============================================================================

export interface CategoryBarRow {
  /** Unique row id */
  id: string;
  categoryId: number | null;
  categoryKey: string | null;
  label: string;
  total: number;
  count: number;
  percent: number | null;
  color: string;
}

export function categoryLabel(stat: {
  categoryDescription: string | null;
  categoryKey: string | null;
}): string {
  return stat.categoryDescription ?? stat.categoryKey ?? 'Sin categoría';
}

export function buildCategoryRows(
  byCategory: CategoryStat[],
  grandTotal: number,
  colors: Map<number, string>
): CategoryBarRow[] {
  return [...byCategory]
    .sort((a, b) => b.total - a.total)
    .map((c) => ({
      id: c.categoryId === null ? 'sin' : `c${c.categoryId}`,
      categoryId: c.categoryId,
      categoryKey: c.categoryKey,
      label: categoryLabel(c),
      total: c.total,
      count: c.count,
      percent: percentOf(c.total, grandTotal),
      color: categoryColor(c.categoryId, colors),
    }));
}

export interface MonthlySeries {
  /** Key of the column in the wide rows */
  key: string;
  label: string;
  color: string;
  /** undefined for the folded "Otras" series (no single category to link to) */
  categoryKey: string | null | undefined;
}

export type MonthlyRow = { month: string } & Record<string, number | string>;

export interface MonthlyChartData {
  series: MonthlySeries[];
  rows: MonthlyRow[];
}

/**
 * Wide rows (one per month of the period, zero-filled) plus the series list.
 * Series follow the order of the category totals; categories beyond the
 * palette (8 slots) are folded into a single "Otras" series.
 */
export function buildMonthlyData(
  byMonth: MonthCategoryStat[],
  categoryRows: CategoryBarRow[],
  periodMonths: string[]
): MonthlyChartData {
  const known = new Map(categoryRows.map((r) => [r.id, r]));
  const idOf = (m: MonthCategoryStat) => (m.categoryId === null ? 'sin' : `c${m.categoryId}`);

  // Categories present in the monthly data, ranked by total (rows are already sorted desc)
  const present = new Set(byMonth.map(idOf));
  const ordered = categoryRows.filter((r) => present.has(r.id));
  // Defensive: monthly rows whose category is missing from the totals
  for (const m of byMonth) {
    if (!known.has(idOf(m)) && !ordered.some((r) => r.id === idOf(m))) {
      ordered.push({
        id: idOf(m),
        categoryId: m.categoryId,
        categoryKey: m.categoryKey,
        label: m.categoryKey ?? 'Sin categoría',
        total: 0,
        count: 0,
        percent: null,
        color: OTHER_COLOR,
      });
    }
  }

  const palette = ordered.filter((r) => r.categoryId !== null && r.color !== OTHER_COLOR);
  const sin = ordered.filter((r) => r.categoryId === null);
  const folded = ordered.filter((r) => r.categoryId !== null && r.color === OTHER_COLOR);

  const series: MonthlySeries[] = [
    ...palette.map((r) => ({
      key: r.id,
      label: r.label,
      color: r.color,
      categoryKey: r.categoryKey as string | null,
    })),
    ...sin.map((r) => ({
      key: r.id,
      label: r.label,
      color: r.color,
      categoryKey: null as string | null,
    })),
  ];
  const foldedIds = new Set(folded.map((r) => r.id));
  if (folded.length > 0) {
    series.push({ key: 'otras', label: 'Otras', color: OTHER_COLOR, categoryKey: undefined });
  }

  const months = [...new Set([...periodMonths, ...byMonth.map((m) => m.month)])].sort();
  const rows: MonthlyRow[] = months.map((month) => {
    const row: MonthlyRow = { month };
    for (const s of series) row[s.key] = 0;
    return row;
  });
  const byMonthIndex = new Map(rows.map((r) => [r.month, r]));
  for (const m of byMonth) {
    const row = byMonthIndex.get(m.month);
    if (!row) continue;
    const id = idOf(m);
    const key = foldedIds.has(id) ? 'otras' : id;
    row[key] = (Number(row[key]) || 0) + m.total;
  }
  return { series, rows };
}

/** Wide row with running totals; `date` is the first day of the month (time x axis) */
export type CumulativeRow = { month: string; date: Date } & Record<string, number | string | Date>;

export interface CumulativeChartData {
  series: MonthlySeries[];
  rows: CumulativeRow[];
}

/**
 * Running total per series, month by month, from the monthly wide rows.
 * Months after `untilMonth` (YYYY-MM, usually the current month) are dropped
 * so the chart does not end in a flat plateau of months that have not
 * happened yet.
 */
export function buildCumulativeData(
  monthly: MonthlyChartData,
  untilMonth?: string
): CumulativeChartData {
  const running = new Map(monthly.series.map((s) => [s.key, 0]));
  const rows = monthly.rows
    .filter((r) => untilMonth === undefined || r.month <= untilMonth)
    .map((r) => {
      const row: CumulativeRow = {
        month: r.month,
        date: new Date(Number(r.month.slice(0, 4)), Number(r.month.slice(5, 7)) - 1, 1),
      };
      for (const s of monthly.series) {
        const total = (running.get(s.key) ?? 0) + (Number(r[s.key]) || 0);
        running.set(s.key, total);
        row[s.key] = total;
      }
      return row;
    });
  return { series: monthly.series, rows };
}

/** Current month as YYYY-MM */
export function currentMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Deep link for a point of the cumulative chart: the category from the start
 * of the period up to the end of that month.
 */
export function cumulativeCategoryQuery(
  categoryKey: string | null,
  period: string,
  month: string
): string {
  const from = `${monthsOfPeriod(period)[0]}-01`;
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${categoryFilter(categoryKey)} fecha:${from}..${month}-${String(lastDay).padStart(2, '0')}`;
}

export interface LetterSlice {
  letter: LetterStat['letter'];
  label: string;
  color: string;
  total: number;
  count: number;
  vatRecoverable: boolean;
  percent: number | null;
}

/** Slices in fixed letter order; percentages are over the sum of all letters */
export function buildLetterSlices(byLetter: LetterStat[]): LetterSlice[] {
  const grand = byLetter.reduce((acc, l) => acc + l.total, 0);
  return LETTER_ORDER.flatMap((letter) => {
    const stat = byLetter.find((l) => l.letter === letter);
    if (!stat) return [];
    return [
      {
        letter,
        label: LETTER_LABELS[letter],
        color: LETTER_COLORS[letter],
        total: stat.total,
        count: stat.count,
        vatRecoverable: stat.vatRecoverable,
        percent: percentOf(stat.total, grand),
      },
    ];
  });
}

/** "IVA computable" (A+M) vs "Sin crédito fiscal" (everything else) */
export function letterAggregates(slices: LetterSlice[]): {
  vat: { total: number; percent: number | null };
  noCredit: { total: number; percent: number | null };
} {
  const vatTotal = slices.filter((s) => s.vatRecoverable).reduce((a, s) => a + s.total, 0);
  const noCreditTotal = slices.filter((s) => !s.vatRecoverable).reduce((a, s) => a + s.total, 0);
  const grand = vatTotal + noCreditTotal;
  return {
    vat: { total: vatTotal, percent: percentOf(vatTotal, grand) },
    noCredit: { total: noCreditTotal, percent: percentOf(noCreditTotal, grand) },
  };
}

// ============================================================================
// Internals
// ============================================================================

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}
