/**
 * buildArcaBreakdown: invoice breakdown derived from an expected invoice.
 * Fictitious data only.
 */
import { describe, it, expect } from 'vitest';
import { buildArcaBreakdown, type BreakdownLine } from '../../../utils/expected-tax-lines';
import { makeTaxLinesBodySchema } from '../../../contracts/invoice-tax-lines';

const iibb = (amount: number, label: string): BreakdownLine => ({
  concept: 'IIBB_PERCEPTION',
  rate: null,
  amount,
  label,
});

describe('buildArcaBreakdown', () => {
  const typeA = { invoiceType: 1, total: 131, netTaxed21: 100, vat21: 21, otherTaxes: 10 };

  it('A: fixed lines plus a single ARCA OTHER_TAXES line by default', () => {
    const b = buildArcaBreakdown(typeA);
    expect(b.fixed.map((l) => l.concept)).toEqual(['NET_TAXED', 'VAT']);
    expect(b.others).toEqual([{ concept: 'OTHER_TAXES', rate: null, amount: 10, label: null }]);
    expect(b.lines).toHaveLength(3);
    expect(makeTaxLinesBodySchema(131, 1).safeParse({ lines: b.lines }).success).toBe(true);
  });

  it('A: other taxes split into two IIBB lines with labels', () => {
    const b = buildArcaBreakdown(typeA, [iibb(6, 'Buenos Aires'), iibb(4, 'CABA')]);
    expect(b.others).toHaveLength(2);
    const r = makeTaxLinesBodySchema(131, 1).safeParse({ lines: b.lines });
    expect(r.success).toBe(true);
    if (r.success)
      expect(r.data.lines.map((l) => l.label)).toEqual([null, null, 'Buenos Aires', 'CABA']);
  });

  it('A: no other taxes means no others', () => {
    const b = buildArcaBreakdown({ invoiceType: 1, total: 121, netTaxed21: 100, vat21: 21 });
    expect(b.others).toEqual([]);
  });

  it('B: undiscriminated is fixed, other taxes are editable', () => {
    const b = buildArcaBreakdown({ invoiceType: 6, total: 110, otherTaxes: 10 });
    expect(b.fixed).toEqual([{ concept: 'UNDISCRIMINATED', rate: null, amount: 100, label: null }]);
    expect(b.others).toHaveLength(1);
    expect(makeTaxLinesBodySchema(110, 6).safeParse({ lines: b.lines }).success).toBe(true);
  });

  it('rejects a split whose sum does not match the total', () => {
    const b = buildArcaBreakdown(typeA, [iibb(6, 'Buenos Aires'), iibb(1, 'CABA')]);
    expect(makeTaxLinesBodySchema(131, 1).safeParse({ lines: b.lines }).success).toBe(false);
  });

  it('returns empty lines without any breakdown column', () => {
    const b = buildArcaBreakdown({ invoiceType: 1, total: 100 });
    expect(b.lines).toEqual([]);
  });
});
