import { describe, it, expect } from 'vitest';
import { periodSchema, periodToRange } from '../../../contracts/stats';

describe('periodSchema', () => {
  it.each(['2026', '2026-Q1', '2026-Q4', '2026-01', '2026-12'])('accepts %s', (p) => {
    expect(periodSchema.safeParse(p).success).toBe(true);
  });

  it.each(['26', '2026-Q5', '2026-13', '2026-1', '2026-00', '', 'abc'])('rejects %s', (p) => {
    expect(periodSchema.safeParse(p).success).toBe(false);
  });
});

describe('periodToRange', () => {
  it.each([
    ['2026', '2026-01-01', '2027-01-01'],
    ['2026-Q1', '2026-01-01', '2026-04-01'],
    ['2026-Q4', '2026-10-01', '2027-01-01'],
    ['2026-02', '2026-02-01', '2026-03-01'],
    ['2026-12', '2026-12-01', '2027-01-01'],
  ])('%s → [%s, %s)', (period, from, to) => {
    expect(periodToRange(period)).toEqual({ from, to });
  });
});
