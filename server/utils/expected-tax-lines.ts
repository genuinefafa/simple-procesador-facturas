/**
 * ARCA tax breakdown helpers for expected invoices (bronze layer, #129).
 *
 * The columns mirror the "Mis Comprobantes Recibidos" Excel. `expectedToTaxLines`
 * converts them to the line concepts used by the silver layer (#190).
 */

import { doesNotItemizeVat } from '@shared/arca';

/** Breakdown columns of expected_invoices (all nullable). */
export const EXPECTED_TAX_COLUMN_KEYS = [
  'netTaxed0',
  'netTaxed2_5',
  'netTaxed5',
  'netTaxed10_5',
  'netTaxed21',
  'netTaxed27',
  'vat2_5',
  'vat5',
  'vat10_5',
  'vat21',
  'vat27',
  'netTaxedTotal',
  'netUntaxed',
  'exempt',
  'otherTaxes',
  'vatTotal',
  'exchangeRate',
] as const;

export type ExpectedTaxColumnKey = (typeof EXPECTED_TAX_COLUMN_KEYS)[number];

export type ExpectedTaxColumns = { [K in ExpectedTaxColumnKey]: number | null };

export type ExpectedTaxLineConcept =
  | 'NET_TAXED'
  | 'NET_UNTAXED'
  | 'EXEMPT'
  | 'VAT'
  | 'OTHER_TAXES'
  | 'UNDISCRIMINATED';

export interface ExpectedTaxLine {
  concept: ExpectedTaxLineConcept;
  rate: number | null;
  amount: number;
}

/** Expected invoice data needed to derive lines (columns + total and type). */
export type ExpectedTaxSource = Partial<ExpectedTaxColumns> & {
  total?: number | null;
  invoiceType?: number | null;
};

/** True when at least one breakdown column has a value. */
export function hasTaxColumns(expected: Partial<ExpectedTaxColumns>): boolean {
  return EXPECTED_TAX_COLUMN_KEYS.some((k) => expected[k] !== null && expected[k] !== undefined);
}

const NET_TAXED_BY_RATE: Array<[ExpectedTaxColumnKey, number]> = [
  ['netTaxed0', 0],
  ['netTaxed2_5', 2.5],
  ['netTaxed5', 5],
  ['netTaxed10_5', 10.5],
  ['netTaxed21', 21],
  ['netTaxed27', 27],
];

const VAT_BY_RATE: Array<[ExpectedTaxColumnKey, number]> = [
  ['vat2_5', 2.5],
  ['vat5', 5],
  ['vat10_5', 10.5],
  ['vat21', 21],
  ['vat27', 27],
];

/**
 * Converts the ARCA breakdown columns to tax lines (#190 concepts).
 *
 * - Null or zero amounts are omitted; amounts are positive (credit notes keep
 *   positive amounts, the sign is applied by the gold layer).
 * - ARCA does not separate VAT perceptions: "Otros Tributos" goes to OTHER_TAXES.
 * - `netTaxedTotal`, `vatTotal` and `exchangeRate` are not lines (derived / not an amount).
 * - Returns null when the expected invoice has no breakdown column at all.
 * - Documents that do not itemize VAT (known type, e.g. B/C/no letter) ignore the
 *   VAT columns: ARCA reports zeros/nulls and only the total, so the result is
 *   UNDISCRIMINATED = total - otherTaxes (only when > 0) plus OTHER_TAXES.
 *   Requires `expected.total`; without it the regular column mapping applies.
 *   `invoiceType` (the linked invoice, the source of truth) takes precedence
 *   over the type of the expected invoice itself.
 */
export function expectedToTaxLines(
  expected: ExpectedTaxSource | null | undefined,
  invoiceType?: number | null
): ExpectedTaxLine[] | null {
  if (!expected) return null;

  const type = invoiceType ?? expected.invoiceType ?? null;
  const total = expected.total;
  if (doesNotItemizeVat(type) && total !== null && total !== undefined) {
    const other = Math.abs(expected.otherTaxes ?? 0);
    const net = Math.round((Math.abs(total) - other + Number.EPSILON) * 100) / 100;
    const out: ExpectedTaxLine[] = [];
    if (net > 0) out.push({ concept: 'UNDISCRIMINATED', rate: null, amount: net });
    if (other > 0) out.push({ concept: 'OTHER_TAXES', rate: null, amount: other });
    return out;
  }

  if (!hasTaxColumns(expected)) return null;

  const lines: ExpectedTaxLine[] = [];
  const push = (
    concept: ExpectedTaxLineConcept,
    rate: number | null,
    value?: number | null
  ): void => {
    if (value === null || value === undefined || value === 0) return;
    lines.push({ concept, rate, amount: Math.abs(value) });
  };

  for (const [key, rate] of NET_TAXED_BY_RATE) push('NET_TAXED', rate, expected[key]);
  push('NET_UNTAXED', null, expected.netUntaxed);
  push('EXEMPT', null, expected.exempt);
  for (const [key, rate] of VAT_BY_RATE) push('VAT', rate, expected[key]);
  push('OTHER_TAXES', null, expected.otherTaxes);

  return lines;
}

/**
 * Parses an amount coming from an Excel cell: a number, or text in Argentine
 * format ("1.234,56") or plain format ("1234.56"). Empty or unparseable -> null.
 */
export function parseAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;

  let s = raw.trim().replace(/[\s$]/g, '');
  if (s === '' || s === '-') return null;
  if (s.includes(',')) {
    // Argentine format: dots are thousands separators, comma is the decimal one
    s = s.replace(/\./g, '').replace(',', '.');
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
