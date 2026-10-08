/**
 * Contracts for /api/stats (dashboard, gold layer #189).
 */

import * as z from 'zod';

/**
 * Reporting period: a year (`2026`), a quarter (`2026-Q3`) or a month (`2026-09`).
 */
export const periodSchema = z
  .string()
  .regex(/^\d{4}(-Q[1-4]|-(0[1-9]|1[0-2]))?$/, 'Período inválido (usar AAAA, AAAA-Qn o AAAA-MM)');

export const StatsQuerySchema = z.object({
  period: periodSchema,
});

export type StatsQueryInput = z.infer<typeof StatsQuerySchema>;

export interface PeriodRange {
  /** Inclusive, YYYY-MM-DD */
  from: string;
  /** Exclusive, YYYY-MM-DD */
  to: string;
}

function monthStart(year: number, month: number): string {
  // month is 1-based and may overflow into the next year
  const y = year + Math.floor((month - 1) / 12);
  const m = ((month - 1) % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

/**
 * Converts a validated period into a [from, to) date range.
 *
 * @example
 * periodToRange('2026')    // { from: '2026-01-01', to: '2027-01-01' }
 * periodToRange('2026-Q3') // { from: '2026-07-01', to: '2026-10-01' }
 * periodToRange('2026-12') // { from: '2026-12-01', to: '2027-01-01' }
 */
export function periodToRange(period: string): PeriodRange {
  const year = Number(period.slice(0, 4));
  const rest = period.slice(5);

  if (rest === '') {
    return { from: monthStart(year, 1), to: monthStart(year, 13) };
  }
  if (rest.startsWith('Q')) {
    const firstMonth = (Number(rest.slice(1)) - 1) * 3 + 1;
    return { from: monthStart(year, firstMonth), to: monthStart(year, firstMonth + 3) };
  }
  const month = Number(rest);
  return { from: monthStart(year, month), to: monthStart(year, month + 1) };
}
