import { describe, it, expect } from 'vitest';
import {
  arcaFingerprint,
  reconcileTaxBreakdown,
  type ReconciliationInput,
} from '../../../services/tax-breakdown-reconciliation';

interface L {
  concept: string;
  rate: number | null;
  amount: number;
}
const line = (concept: string, rate: number | null, amount: number): L => ({
  concept,
  rate,
  amount,
});

function input(
  over: Partial<ReconciliationInput> & { lines?: L[]; total?: number | null }
): ReconciliationInput {
  return {
    invoice: { total: over.total === undefined ? 1210 : over.total, lines: over.lines ?? [] },
    expected: over.expected === undefined ? { id: 7, netTaxed21: 1000, vat21: 210 } : over.expected,
    ack: over.ack ?? null,
  };
}

const okLines = [line('NET_TAXED', 21, 1000), line('VAT', 21, 210)];

describe('reconcileTaxBreakdown - invoice without lines', () => {
  it('is completable when ARCA is consistent with the total', () => {
    const r = reconcileTaxBreakdown(input({}));
    expect(r.status).toBe('completable');
    expect(r.arcaLines).toHaveLength(2);
    expect(r.buckets).toEqual([]);
  });

  it.each([
    ['no_total', { total: null }],
    ['no_expected', { expected: null }],
    ['arca_no_breakdown', { expected: { id: 7 } }],
    ['arca_sum_mismatch', { total: 5000 }],
  ] as const)('is manual: %s', (reason, over) => {
    const r = reconcileTaxBreakdown(input(over));
    expect(r.status).toBe('manual');
    expect(r.reason).toBe(reason);
  });

  it('treats all-zero ARCA columns as no breakdown', () => {
    const r = reconcileTaxBreakdown(input({ expected: { id: 7, netTaxed21: 0 } }));
    expect(r.reason).toBe('arca_no_breakdown');
  });

  it('credit notes: negative ARCA values with positive total are completable', () => {
    const r = reconcileTaxBreakdown(
      input({ expected: { id: 7, netTaxed21: -1000, vat21: -210 }, total: 1210 })
    );
    expect(r.status).toBe('completable');
    const r2 = reconcileTaxBreakdown(
      input({ expected: { id: 7, netTaxed21: -1000, vat21: -210 }, total: -1210 })
    );
    expect(r2.status).toBe('completable');
  });

  it('accepts ARCA sum within 0.05 of the total', () => {
    expect(reconcileTaxBreakdown(input({ total: 1210.05 })).status).toBe('completable');
    expect(reconcileTaxBreakdown(input({ total: 1210.06 })).reason).toBe('arca_sum_mismatch');
  });
});

describe('reconcileTaxBreakdown - invoice with lines', () => {
  it('ok when exact', () => {
    const r = reconcileTaxBreakdown(input({ lines: okLines }));
    expect(r).toMatchObject({ status: 'ok', reason: 'matches_arca', ackStale: false });
    expect(r.buckets.map((b) => b.key)).toEqual(['NET_TAXED:21', 'VAT:21']);
  });

  it('ok with 1-4 cents of difference per bucket', () => {
    for (const cents of [0.01, 0.02, 0.03, 0.04, 0.05]) {
      const r = reconcileTaxBreakdown(
        input({ lines: [line('NET_TAXED', 21, 1000 + cents), line('VAT', 21, 210 - cents)] })
      );
      expect(r.status).toBe('ok');
    }
  });

  it('divergent with 0.06 of difference', () => {
    const r = reconcileTaxBreakdown(
      input({ lines: [line('NET_TAXED', 21, 1000.06), line('VAT', 21, 210)] })
    );
    expect(r).toMatchObject({ status: 'divergent', reason: 'differs' });
    expect(r.buckets.find((b) => b.key === 'NET_TAXED:21')).toMatchObject({
      diff: 0.06,
      matches: false,
    });
  });

  it('divergent when a bucket exists on one side only', () => {
    const r = reconcileTaxBreakdown(input({ lines: [...okLines, line('NET_UNTAXED', null, 50)] }));
    expect(r.status).toBe('divergent');
    expect(r.buckets.find((b) => b.key === 'NET_UNTAXED')).toMatchObject({ invoice: 50, arca: 0 });
  });

  it('reclassified perceptions still match ARCA other taxes', () => {
    const r = reconcileTaxBreakdown(
      input({
        total: 1240,
        expected: { id: 7, netTaxed21: 1000, vat21: 210, otherTaxes: 30 },
        lines: [...okLines, line('VAT_PERCEPTION', null, 20), line('IIBB_PERCEPTION', null, 10)],
      })
    );
    expect(r).toMatchObject({ status: 'ok', reason: 'matches_arca' });
    expect(r.buckets.find((b) => b.key === 'OTHER')).toMatchObject({ invoice: 30, arca: 30 });
  });

  it('credit note: positive invoice lines vs negative ARCA are ok', () => {
    const r = reconcileTaxBreakdown(
      input({ lines: okLines, expected: { id: 7, netTaxed21: -1000, vat21: -210 } })
    );
    expect(r.status).toBe('ok');
  });

  it('ok / no_arca_reference without an expected or without breakdown', () => {
    expect(reconcileTaxBreakdown(input({ lines: okLines, expected: null }))).toMatchObject({
      status: 'ok',
      reason: 'no_arca_reference',
      arcaFingerprint: null,
    });
    expect(reconcileTaxBreakdown(input({ lines: okLines, expected: { id: 7 } })).reason).toBe(
      'no_arca_reference'
    );
  });

  it('orders buckets: net by rate, untaxed, exempt, vat by rate, other', () => {
    const r = reconcileTaxBreakdown(
      input({
        total: 1000,
        lines: [
          line('OTHER_TAXES', null, 1),
          line('VAT', 21, 1),
          line('VAT', 10.5, 1),
          line('EXEMPT', null, 1),
          line('NET_UNTAXED', null, 1),
          line('NET_TAXED', 21, 1),
          line('NET_TAXED', 10.5, 1),
        ],
      })
    );
    expect(r.buckets.map((b) => b.key)).toEqual([
      'NET_TAXED:10.5',
      'NET_TAXED:21',
      'NET_UNTAXED',
      'EXEMPT',
      'VAT:10.5',
      'VAT:21',
      'OTHER',
    ]);
  });
});

describe('acks', () => {
  const diverging = [line('NET_TAXED', 21, 900), line('VAT', 21, 189)];
  const fp = arcaFingerprint(7, [
    { concept: 'NET_TAXED', rate: 21, amount: 1000 },
    { concept: 'VAT', rate: 21, amount: 210 },
  ]);

  it('current pin turns divergent into ok/accepted', () => {
    const r = reconcileTaxBreakdown(input({ lines: diverging, ack: { arcaFingerprint: fp } }));
    expect(r).toMatchObject({ status: 'ok', reason: 'accepted', ackStale: false });
  });

  it('stale pin is divergent with ackStale', () => {
    const r = reconcileTaxBreakdown(
      input({ lines: diverging, ack: { arcaFingerprint: 'e7|NET_TAXED:21=999.00' } })
    );
    expect(r).toMatchObject({ status: 'divergent', ackStale: true });
  });
});

describe('arcaFingerprint', () => {
  it('is deterministic, order independent and includes the expected id', () => {
    const a = arcaFingerprint(7, [
      { concept: 'VAT', rate: 21, amount: 210 },
      { concept: 'NET_TAXED', rate: 21, amount: 1000 },
      { concept: 'OTHER_TAXES', rate: null, amount: 5 },
    ]);
    expect(a).toBe('e7|NET_TAXED:21=1000.00|VAT:21=210.00|OTHER_TAXES=5.00');
    const b = arcaFingerprint(7, [
      { concept: 'OTHER_TAXES', rate: null, amount: 5 },
      { concept: 'NET_TAXED', rate: 21, amount: 1000 },
      { concept: 'VAT', rate: 21, amount: 210 },
    ]);
    expect(b).toBe(a);
    expect(arcaFingerprint(8, [{ concept: 'VAT', rate: 21, amount: 210 }])).not.toBe(
      arcaFingerprint(7, [{ concept: 'VAT', rate: 21, amount: 210 }])
    );
  });
});
