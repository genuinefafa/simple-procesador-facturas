/**
 * Pure divergence detection between an invoice (silver, source of truth) and
 * its inputs: the linked expected invoice (ARCA, bronze) and the linked file (#191).
 *
 * Category is compared against both inputs. Total, date and type are compared
 * only against the expected invoice: what OCR extracts from the file is noise.
 * No DB access, nothing is copied here; this only classifies what a human may act on.
 */

import { TAX_LINES_SUM_TOLERANCE } from '../contracts/invoice-tax-lines';

export type ConsistencyField = 'category' | 'total' | 'date' | 'type';
export type ConsistencySource = 'expected' | 'file';
export type DivergenceKind = 'missing' | 'different';

export type DivergenceValue = string | number | null;

export interface Divergence {
  field: ConsistencyField;
  source: ConsistencySource;
  /** missing: invoice has a value and the input has none. different: anything else. */
  kind: DivergenceKind;
  invoiceValue: DivergenceValue;
  sourceValue: DivergenceValue;
  /** An accepted difference whose fingerprint still matches the current input value */
  acked: boolean;
}

export interface ConsistencyInput {
  invoice: {
    categoryId: number | null;
    total: number | null;
    currency: string | null;
    /** YYYY-MM-DD, possibly with a time part */
    issueDate: string | null;
    invoiceType: number | null;
  };
  expected: {
    categoryId: number | null;
    total: number | null;
    currency: string | null;
    issueDate: string | null;
    invoiceType: number | null;
  } | null;
  file: { categoryId: number | null } | null;
  /** Accepted differences: ack kind -> fingerprint stored when it was accepted */
  acks: Record<string, string>;
}

/** Total differences up to this amount are rounding, not a divergence (same as the tax breakdown). */
export const TOTAL_TOLERANCE = TAX_LINES_SUM_TOLERANCE;

export function consistencyAckKind(field: ConsistencyField, source: ConsistencySource): string {
  return `consistency_${field}_${source}`;
}

/** Serializes an input value so an ack is only valid while the input keeps that value. */
export function consistencyFingerprint(field: ConsistencyField, value: DivergenceValue): string {
  if (value === null) return '';
  if (field === 'total') return Number(value).toFixed(2);
  if (field === 'date') return String(value).slice(0, 10);
  return String(value);
}

function normalize(field: ConsistencyField, value: DivergenceValue): DivergenceValue {
  if (value === null) return null;
  if (field === 'date') return String(value).slice(0, 10);
  return value;
}

function differs(field: ConsistencyField, a: DivergenceValue, b: DivergenceValue): boolean {
  if (field === 'total') {
    return Math.abs(Number(a) - Number(b)) > TOTAL_TOLERANCE + 1e-9;
  }
  return a !== b;
}

function compare(
  field: ConsistencyField,
  source: ConsistencySource,
  rawInvoice: DivergenceValue,
  rawSource: DivergenceValue,
  acks: Record<string, string>,
  reportsMissing: boolean
): Divergence | null {
  const invoiceValue = normalize(field, rawInvoice);
  const sourceValue = normalize(field, rawSource);

  let kind: DivergenceKind;
  if (sourceValue === null) {
    // Only category reports an empty input; for the rest ARCA without a value says nothing
    if (invoiceValue === null || !reportsMissing) return null;
    kind = 'missing';
  } else if (invoiceValue === null || differs(field, invoiceValue, sourceValue)) {
    kind = 'different';
  } else {
    return null;
  }

  const stored = acks[consistencyAckKind(field, source)];
  const acked =
    kind === 'different' &&
    stored !== undefined &&
    stored === consistencyFingerprint(field, sourceValue);
  return { field, source, kind, invoiceValue, sourceValue, acked };
}

export function computeDivergences(input: ConsistencyInput): Divergence[] {
  const { invoice, expected, file, acks } = input;
  const out: Divergence[] = [];
  const push = (d: Divergence | null) => {
    if (d) out.push(d);
  };

  if (expected) {
    push(compare('category', 'expected', invoice.categoryId, expected.categoryId, acks, true));
    const sameCurrency = (invoice.currency ?? 'ARS') === (expected.currency ?? 'ARS');
    if (sameCurrency) {
      push(compare('total', 'expected', invoice.total, expected.total, acks, false));
    }
    push(compare('date', 'expected', invoice.issueDate, expected.issueDate, acks, false));
    push(compare('type', 'expected', invoice.invoiceType, expected.invoiceType, acks, false));
  }
  if (file) {
    push(compare('category', 'file', invoice.categoryId, file.categoryId, acks, true));
  }
  return out;
}
