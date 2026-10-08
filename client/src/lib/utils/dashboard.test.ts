import { describe, it, expect } from 'vitest';
import { parseSearchQuery } from '$lib/search/query-parser';
import {
  assignCategoryColors,
  buildCategoryRows,
  buildLetterSlices,
  buildCumulativeData,
  buildMonthlyData,
  buildPeriodKey,
  categoryColor,
  categoryQuery,
  changePeriodKind,
  cumulativeCategoryQuery,
  currentMonth,
  comprobantesUrl,
  formatPercent,
  letterAggregates,
  letterQuery,
  monthCategoryQuery,
  monthsOfPeriod,
  parsePeriod,
  pendingExpectedQuery,
  pendingFilesQuery,
  percentOf,
  periodDateFilter,
  quarterRange,
  resolvePeriodKey,
} from './dashboard';

describe('periods', () => {
  it('parses year, quarter and month keys', () => {
    expect(parsePeriod('2026')).toEqual({ kind: 'year', year: 2026 });
    expect(parsePeriod('2026-Q3')).toEqual({ kind: 'quarter', year: 2026, quarter: 3 });
    expect(parsePeriod('2026-09')).toEqual({ kind: 'month', year: 2026, month: 9 });
  });

  it('rejects invalid keys', () => {
    for (const bad of ['', null, undefined, '26', '2026-Q5', '2026-13', '2026-9', 'abc']) {
      expect(parsePeriod(bad)).toBeNull();
    }
  });

  it('roundtrips keys', () => {
    for (const key of ['2026', '2026-Q1', '2026-09']) {
      expect(buildPeriodKey(parsePeriod(key)!)).toBe(key);
    }
  });

  it('falls back to the current year', () => {
    const now = new Date(2026, 9, 7);
    expect(resolvePeriodKey(null, now)).toBe('2026');
    expect(resolvePeriodKey('bad', now)).toBe('2026');
    expect(resolvePeriodKey('2025-Q2', now)).toBe('2025-Q2');
  });

  it('keeps the year when switching kind', () => {
    const now = new Date(2026, 9, 7);
    expect(changePeriodKind({ kind: 'year', year: 2025 }, 'quarter', now)).toEqual({
      kind: 'quarter',
      year: 2025,
      quarter: 4,
    });
    expect(changePeriodKind({ kind: 'quarter', year: 2025, quarter: 2 }, 'month', now)).toEqual({
      kind: 'month',
      year: 2025,
      month: 4,
    });
    expect(changePeriodKind({ kind: 'month', year: 2025, month: 11 }, 'quarter', now)).toEqual({
      kind: 'quarter',
      year: 2025,
      quarter: 4,
    });
  });

  it('computes quarter ranges (inclusive end)', () => {
    expect(quarterRange(2026, 1)).toEqual({ from: '2026-01-01', to: '2026-03-31' });
    expect(quarterRange(2026, 2)).toEqual({ from: '2026-04-01', to: '2026-06-30' });
    expect(quarterRange(2026, 3)).toEqual({ from: '2026-07-01', to: '2026-09-30' });
    expect(quarterRange(2026, 4)).toEqual({ from: '2026-10-01', to: '2026-12-31' });
  });

  it('lists the months of a period', () => {
    expect(monthsOfPeriod('2026')).toHaveLength(12);
    expect(monthsOfPeriod('2026-Q3')).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(monthsOfPeriod('2026-09')).toEqual(['2026-09']);
  });
});

describe('deep link queries', () => {
  it('builds the date filter per period kind', () => {
    expect(periodDateFilter('2026')).toBe('fecha:2026');
    expect(periodDateFilter('2026-09')).toBe('fecha:2026-09');
    expect(periodDateFilter('2026-Q3')).toBe('fecha:2026-07-01..2026-09-30');
  });

  it('builds category, month, letter and pending queries', () => {
    expect(categoryQuery('servicios', '2026')).toBe('categoria:servicios fecha:2026');
    expect(categoryQuery(null, '2026-Q3')).toBe('categoria:sin fecha:2026-07-01..2026-09-30');
    expect(monthCategoryQuery('servicios', '2026-09')).toBe('categoria:servicios fecha:2026-09');
    expect(monthCategoryQuery(null, '2026-09')).toBe('categoria:sin fecha:2026-09');
    expect(letterQuery('A', '2026')).toBe('letra:A fecha:2026');
    expect(letterQuery('other', '2026-09')).toBe('letra:otro fecha:2026-09');
    expect(pendingExpectedQuery('2026')).toBe('estado:esperadas fecha:2026');
  });

  it('produces queries the search parser accepts without errors', () => {
    const queries = [
      categoryQuery('servicios', '2026-Q3'),
      categoryQuery(null, '2026'),
      monthCategoryQuery('servicios', '2026-09'),
      letterQuery('M', '2026-09'),
      letterQuery('other', '2026'),
      pendingExpectedQuery('2026-Q1'),
      pendingFilesQuery(),
      cumulativeCategoryQuery('servicios', '2026-Q2', '2026-05'),
    ];
    for (const q of queries) {
      const { errors, filters } = parseSearchQuery(q);
      expect(errors).toEqual([]);
      expect(filters.length).toBe(q.split(' ').length);
    }
  });

  it('builds the unprocessed files query without a count', () => {
    expect(pendingFilesQuery()).toBe('estado:pendientes');
  });

  it('encodes the query in the URL', () => {
    expect(comprobantesUrl('letra:A fecha:2026')).toBe('/comprobantes?q=letra%3AA%20fecha%3A2026');
  });
});

describe('colors', () => {
  it('assigns slots by ascending category id, not by input order', () => {
    const colors = assignCategoryColors([7, 2, 5]);
    expect(colors.get(2)).toBe('var(--color-chart-1)');
    expect(colors.get(5)).toBe('var(--color-chart-2)');
    expect(colors.get(7)).toBe('var(--color-chart-3)');
  });

  it('does not cycle: the 9th category and beyond get the neutral color', () => {
    const colors = assignCategoryColors([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(colors.get(8)).toBe('var(--color-chart-8)');
    expect(colors.get(9)).toBe('var(--color-chart-other)');
    expect(colors.get(10)).toBe('var(--color-chart-other)');
  });

  it('uses the neutral color for no category and unknown ids', () => {
    const colors = assignCategoryColors([1]);
    expect(categoryColor(null, colors)).toBe('var(--color-chart-other)');
    expect(categoryColor(99, colors)).toBe('var(--color-chart-other)');
  });
});

describe('percentages', () => {
  it('computes shares and guards against a zero total', () => {
    expect(percentOf(25, 100)).toBe(25);
    expect(percentOf(10, 0)).toBeNull();
    expect(percentOf(-10, 100)).toBe(-10);
    // Negative or zero net totals (credit notes dominate): no meaningful share
    expect(percentOf(50, -100)).toBeNull();
    expect(percentOf(100, -20)).toBeNull();
  });

  it('formats with es-AR decimals', () => {
    expect(formatPercent(12.34)).toBe('12,3%');
    expect(formatPercent(null)).toBe('—');
  });
});

describe('chart data', () => {
  const colors = assignCategoryColors([1, 2]);
  const byCategory = [
    { categoryId: 2, categoryKey: 'b', categoryDescription: 'Beta', count: 1, total: 300 },
    { categoryId: 1, categoryKey: 'a', categoryDescription: 'Alfa', count: 2, total: 600 },
    { categoryId: null, categoryKey: null, categoryDescription: null, count: 1, total: -100 },
  ];

  it('sorts category rows desc with percent, color and label', () => {
    const rows = buildCategoryRows(byCategory, 800, colors);
    expect(rows.map((r) => r.label)).toEqual(['Alfa', 'Beta', 'Sin categoría']);
    expect(rows[0].percent).toBe(75);
    expect(rows[0].color).toBe('var(--color-chart-1)');
    expect(rows[2].total).toBe(-100);
    expect(rows[2].color).toBe('var(--color-chart-other)');
  });

  it('builds zero-filled monthly stacks keeping category colors', () => {
    const rows = buildCategoryRows(byCategory, 800, colors);
    const data = buildMonthlyData(
      [
        { month: '2026-07', categoryId: 1, categoryKey: 'a', total: 600 },
        { month: '2026-08', categoryId: null, categoryKey: null, total: -100 },
      ],
      rows,
      monthsOfPeriod('2026-Q3')
    );
    expect(data.rows.map((r) => r.month)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(data.series.map((s) => s.key)).toEqual(['c1', 'sin']);
    expect(data.series[0].color).toBe('var(--color-chart-1)');
    expect(data.rows[0].c1).toBe(600);
    expect(data.rows[1].sin).toBe(-100);
    expect(data.rows[2].c1).toBe(0);
  });

  it('folds categories beyond the palette into "Otras"', () => {
    const ids = Array.from({ length: 10 }, (_, i) => i + 1);
    const palette = assignCategoryColors(ids);
    const stats = ids.map((id) => ({
      categoryId: id,
      categoryKey: `k${id}`,
      categoryDescription: `Cat ${id}`,
      count: 1,
      total: 100 - id,
    }));
    const rows = buildCategoryRows(stats, 900, palette);
    const data = buildMonthlyData(
      ids.map((id) => ({ month: '2026-01', categoryId: id, categoryKey: `k${id}`, total: 10 })),
      rows,
      ['2026-01']
    );
    expect(data.series).toHaveLength(9);
    expect(data.series[8]).toMatchObject({ key: 'otras', categoryKey: undefined });
    expect(data.rows[0].otras).toBe(20);
  });

  it('orders letter slices and aggregates IVA computable vs sin crédito', () => {
    const slices = buildLetterSlices([
      { letter: 'B', vatRecoverable: false, count: 1, total: 100 },
      { letter: 'A', vatRecoverable: true, count: 2, total: 300 },
      { letter: 'M', vatRecoverable: true, count: 1, total: 100 },
      { letter: 'other', vatRecoverable: false, count: 1, total: 100 },
    ]);
    expect(slices.map((s) => s.letter)).toEqual(['A', 'M', 'B', 'other']);
    expect(slices[0].color).toBe('var(--color-primary-600)');
    const agg = letterAggregates(slices);
    expect(agg.vat).toEqual({ total: 400, percent: (400 / 600) * 100 });
    expect(agg.noCredit.total).toBe(200);
  });
});

describe('buildCumulativeData', () => {
  const monthly = {
    series: [
      { key: 'c1', label: 'X', color: 'var(--color-chart-1)', categoryKey: 'x' },
      { key: 'sin', label: 'Sin categoría', color: 'var(--color-chart-other)', categoryKey: null },
    ],
    rows: [
      { month: '2026-01', c1: 100, sin: 0 },
      { month: '2026-02', c1: 0, sin: 50 },
      { month: '2026-03', c1: -30, sin: 10 },
      { month: '2026-04', c1: 0, sin: 0 },
    ],
  };

  it('accumulates each series month by month, credit notes included', () => {
    const { rows } = buildCumulativeData(monthly);
    expect(rows.map((r) => [r.month, r.c1, r.sin])).toEqual([
      ['2026-01', 100, 0],
      ['2026-02', 100, 50],
      ['2026-03', 70, 60],
      ['2026-04', 70, 60],
    ]);
    expect(rows[0].date).toEqual(new Date(2026, 0, 1));
  });

  it('drops months after untilMonth', () => {
    const { rows } = buildCumulativeData(monthly, '2026-02');
    expect(rows.map((r) => r.month)).toEqual(['2026-01', '2026-02']);
  });
});

describe('cumulativeCategoryQuery', () => {
  it('spans from the start of the period to the end of the month', () => {
    expect(cumulativeCategoryQuery('x', '2026', '2026-02')).toBe(
      'categoria:x fecha:2026-01-01..2026-02-28'
    );
    expect(cumulativeCategoryQuery(null, '2026-Q3', '2026-09')).toBe(
      'categoria:sin fecha:2026-07-01..2026-09-30'
    );
  });

  it('formats the current month', () => {
    expect(currentMonth(new Date(2026, 9, 8))).toBe('2026-10');
  });
});
