/**
 * computeDivergences: invoice (source of truth) vs expected invoice / file (#191).
 * Fictitious data only.
 */
import { describe, it, expect } from 'vitest';
import {
  computeDivergences,
  consistencyAckKind,
  type ConsistencyInput,
} from '../../../services/consistency';

function input(over: {
  invoice?: Partial<ConsistencyInput['invoice']>;
  expected?: Partial<NonNullable<ConsistencyInput['expected']>> | null;
  file?: Partial<NonNullable<ConsistencyInput['file']>> | null;
  acks?: Record<string, string>;
}): ConsistencyInput {
  return {
    invoice: {
      categoryId: 5,
      total: 121,
      currency: 'ARS',
      issueDate: '2026-01-06',
      invoiceType: 1,
      ...over.invoice,
    },
    expected:
      over.expected === null
        ? null
        : {
            categoryId: 5,
            total: 121,
            currency: 'ARS',
            issueDate: '2026-01-06',
            invoiceType: 1,
            ...over.expected,
          },
    file: over.file === null || over.file === undefined ? null : { categoryId: 5, ...over.file },
    acks: over.acks ?? {},
  };
}

describe('computeDivergences', () => {
  it('returns nothing without links', () => {
    expect(computeDivergences(input({ expected: null, file: null }))).toEqual([]);
  });

  it('returns nothing when everything matches', () => {
    expect(computeDivergences(input({ file: {} }))).toEqual([]);
  });

  it('flags an empty input category as missing, for expected and file', () => {
    const d = computeDivergences(
      input({ expected: { categoryId: null }, file: { categoryId: null } })
    );
    expect(d).toEqual([
      {
        field: 'category',
        source: 'expected',
        kind: 'missing',
        invoiceValue: 5,
        sourceValue: null,
        acked: false,
      },
      {
        field: 'category',
        source: 'file',
        kind: 'missing',
        invoiceValue: 5,
        sourceValue: null,
        acked: false,
      },
    ]);
  });

  it('flags a different category, and an input category when the invoice has none', () => {
    const d = computeDivergences(input({ expected: { categoryId: 7 }, file: {} }));
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ source: 'expected', kind: 'different', sourceValue: 7 });

    const e = computeDivergences(input({ invoice: { categoryId: null }, expected: {} }));
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ field: 'category', kind: 'different', invoiceValue: null });

    expect(
      computeDivergences(input({ invoice: { categoryId: null }, expected: { categoryId: null } }))
    ).toEqual([]);
  });

  it('does not compare total, date or type against the file', () => {
    expect(computeDivergences(input({ expected: null, file: { categoryId: 5 } }))).toEqual([]);
  });

  it('ignores the time part of the invoice date', () => {
    expect(
      computeDivergences(input({ invoice: { issueDate: '2026-01-06T00:00:00.000Z' } }))
    ).toEqual([]);
    const d = computeDivergences(
      input({
        invoice: { issueDate: '2026-01-06T00:00:00.000Z' },
        expected: { issueDate: '2026-01-07' },
      })
    );
    expect(d).toMatchObject([
      { field: 'date', kind: 'different', invoiceValue: '2026-01-06', sourceValue: '2026-01-07' },
    ]);
  });

  it('tolerates rounding in the total but not real differences', () => {
    expect(computeDivergences(input({ expected: { total: 121.01 } }))).toEqual([]);
    const d = computeDivergences(input({ expected: { total: 130 } }));
    expect(d).toMatchObject([{ field: 'total', kind: 'different', sourceValue: 130 }]);
  });

  it('does not compare the total across different currencies', () => {
    expect(
      computeDivergences(input({ invoice: { currency: 'USD' }, expected: { total: 5 } }))
    ).toEqual([]);
  });

  it('flags a different type', () => {
    const d = computeDivergences(input({ expected: { invoiceType: 6 } }));
    expect(d).toMatchObject([
      { field: 'type', kind: 'different', invoiceValue: 1, sourceValue: 6 },
    ]);
  });

  it('ignores null total, date and type in the expected, but flags a null invoice value', () => {
    expect(
      computeDivergences(input({ expected: { total: null, issueDate: null, invoiceType: null } }))
    ).toEqual([]);
    const d = computeDivergences(input({ invoice: { total: null, invoiceType: null } }));
    expect(d.map((x) => [x.field, x.kind])).toEqual([
      ['total', 'different'],
      ['type', 'different'],
    ]);
  });

  it('marks as acked only while the stored fingerprint matches the input value', () => {
    const kind = consistencyAckKind('category', 'expected');
    const acked = computeDivergences(input({ expected: { categoryId: 7 }, acks: { [kind]: '7' } }));
    expect(acked[0]?.acked).toBe(true);

    // the input changed after the ack: the divergence comes back
    const stale = computeDivergences(input({ expected: { categoryId: 8 }, acks: { [kind]: '7' } }));
    expect(stale[0]?.acked).toBe(false);

    const total = computeDivergences(
      input({
        expected: { total: 130 },
        acks: { [consistencyAckKind('total', 'expected')]: '130.00' },
      })
    );
    expect(total[0]?.acked).toBe(true);
  });

  it('never acks a missing divergence', () => {
    const kind = consistencyAckKind('category', 'file');
    const d = computeDivergences(input({ file: { categoryId: null }, acks: { [kind]: '' } }));
    expect(d[0]).toMatchObject({ kind: 'missing', acked: false });
  });
});
