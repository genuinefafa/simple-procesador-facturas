import { describe, it, expect } from 'vitest';
import { formatCurrency } from './formatters';

describe('formatCurrency', () => {
  it('formats positive amounts', () => {
    expect(formatCurrency(1234.56)).toBe('$1.234,56');
  });

  it('puts the minus sign before the currency symbol', () => {
    expect(formatCurrency(-497855.28)).toBe('-$497.855,28');
  });

  it('returns a dash for missing values', () => {
    expect(formatCurrency(null)).toBe('—');
    expect(formatCurrency(undefined)).toBe('—');
  });
});
