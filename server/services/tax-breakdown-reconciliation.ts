/**
 * Pure reconciliation of an invoice tax breakdown (silver) against the ARCA
 * breakdown of its linked expected invoice (bronze). No DB access, so it can
 * be reused by other reconciliations (#191).
 *
 * Principle: "paper beats data". Nothing is copied automatically; this module
 * only classifies what a human may then act on. Invoice -> ARCA never.
 */

import {
  expectedToTaxLines,
  type ExpectedTaxColumns,
  type ExpectedTaxLine,
} from '../utils/expected-tax-lines';
import { checkTaxLinesSum, TAX_LINES_SUM_TOLERANCE } from '../contracts/invoice-tax-lines';

export type ReconciliationStatus = 'completable' | 'manual' | 'ok' | 'divergent';

export type ReconciliationReason =
  | 'no_total' // manual: invoice without total
  | 'no_expected' // manual: not linked to an expected invoice
  | 'arca_no_breakdown' // manual: expected has no breakdown columns
  | 'arca_sum_mismatch' // manual: ARCA lines sum != invoice total (+-0.05)
  | 'arca_available' // completable: no breakdown yet, ARCA has a consistent one
  | 'matches_arca' // ok
  | 'no_arca_reference' // ok: invoice has breakdown but there is nothing in ARCA to compare
  | 'accepted' // ok: divergent but pinned with the current fingerprint
  | 'differs'; // divergent

export type BucketKey = string; // 'NET_TAXED:21', 'VAT:10.5', 'NET_UNTAXED', 'EXEMPT', 'OTHER'

export type BucketConcept = 'NET_TAXED' | 'VAT' | 'NET_UNTAXED' | 'EXEMPT' | 'OTHER';

export interface BucketDiff {
  key: BucketKey;
  concept: BucketConcept;
  rate: number | null;
  invoice: number;
  arca: number;
  /** invoice - arca, rounded to 2 decimals */
  diff: number;
  matches: boolean;
}

export interface ReconciliationInput {
  invoice: {
    total: number | null;
    lines: Array<{ concept: string; rate: number | null; amount: number }>;
  };
  expected: ({ id: number } & Partial<ExpectedTaxColumns>) | null;
  ack: { arcaFingerprint: string } | null;
}

export interface ReconciliationResult {
  status: ReconciliationStatus;
  reason: ReconciliationReason;
  /** expectedToTaxLines(expected) */
  arcaLines: ExpectedTaxLine[] | null;
  /** null when there are no ARCA lines */
  arcaFingerprint: string | null;
  /** Only when both sides have lines; [] otherwise */
  buckets: BucketDiff[];
  /** There is an ack but its fingerprint differs from the current one */
  ackStale: boolean;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const CONCEPT_ORDER: Record<string, number> = {
  NET_TAXED: 0,
  NET_UNTAXED: 1,
  EXEMPT: 2,
  VAT: 3,
  VAT_PERCEPTION: 4,
  IIBB_PERCEPTION: 4,
  OTHER_TAXES: 4,
};

/**
 * Deterministic fingerprint of the ARCA values (and the expected id, so that
 * relinking the invoice invalidates a previous pin).
 */
export function arcaFingerprint(expectedId: number, lines: ExpectedTaxLine[]): string {
  const sorted = [...lines].sort(
    (a, b) =>
      (CONCEPT_ORDER[a.concept] ?? 9) - (CONCEPT_ORDER[b.concept] ?? 9) ||
      (a.rate ?? -1) - (b.rate ?? -1)
  );
  const parts = sorted.map((l) => {
    const name = l.rate === null ? l.concept : `${l.concept}:${l.rate}`;
    return `${name}=${Math.abs(l.amount).toFixed(2)}`;
  });
  return [`e${expectedId}`, ...parts].join('|');
}

interface Bucket {
  concept: BucketConcept;
  rate: number | null;
  amount: number;
}

function bucketOf(concept: string, rate: number | null): Omit<Bucket, 'amount'> {
  switch (concept) {
    case 'NET_TAXED':
    case 'VAT':
      return { concept, rate };
    case 'NET_UNTAXED':
    case 'EXEMPT':
      return { concept, rate: null };
    default:
      // VAT_PERCEPTION, IIBB_PERCEPTION, OTHER_TAXES: ARCA does not separate them
      return { concept: 'OTHER', rate: null };
  }
}

function keyOf(b: Omit<Bucket, 'amount'>): BucketKey {
  return b.rate === null ? b.concept : `${b.concept}:${b.rate}`;
}

function toBuckets(
  lines: ReadonlyArray<{ concept: string; rate: number | null; amount: number }>
): Map<BucketKey, Bucket> {
  const map = new Map<BucketKey, Bucket>();
  for (const l of lines) {
    const b = bucketOf(l.concept, l.rate);
    const key = keyOf(b);
    const cur = map.get(key);
    const amount = Math.abs(l.amount);
    if (cur) cur.amount += amount;
    else map.set(key, { ...b, amount });
  }
  return map;
}

const BUCKET_ORDER: Record<BucketConcept, number> = {
  NET_TAXED: 0,
  NET_UNTAXED: 1,
  EXEMPT: 2,
  VAT: 3,
  OTHER: 4,
};

function compareBuckets(
  invoiceLines: ReconciliationInput['invoice']['lines'],
  arcaLines: ExpectedTaxLine[]
): BucketDiff[] {
  const inv = toBuckets(invoiceLines);
  const arca = toBuckets(arcaLines);
  const keys = new Set([...inv.keys(), ...arca.keys()]);
  const out: BucketDiff[] = [];
  for (const key of keys) {
    const i = inv.get(key);
    const a = arca.get(key);
    const ref = (i ?? a) as Bucket;
    const invoice = round2(i?.amount ?? 0);
    const arcaAmount = round2(a?.amount ?? 0);
    const diff = round2(invoice - arcaAmount);
    out.push({
      key,
      concept: ref.concept,
      rate: ref.rate,
      invoice,
      arca: arcaAmount,
      diff,
      matches: Math.abs(diff) <= TAX_LINES_SUM_TOLERANCE + 1e-9,
    });
  }
  return out.sort(
    (x, y) => BUCKET_ORDER[x.concept] - BUCKET_ORDER[y.concept] || (x.rate ?? 0) - (y.rate ?? 0)
  );
}

/** Classifies an invoice breakdown against its ARCA reference. */
export function reconcileTaxBreakdown(input: ReconciliationInput): ReconciliationResult {
  const { invoice, expected, ack } = input;
  const arcaLines = expectedToTaxLines(expected);
  const hasArca = arcaLines !== null && arcaLines.length > 0 && expected !== null;
  const fingerprint = hasArca ? arcaFingerprint(expected.id, arcaLines) : null;
  const ackStale = ack !== null && ack.arcaFingerprint !== fingerprint;

  const base = { arcaLines, arcaFingerprint: fingerprint, buckets: [] as BucketDiff[], ackStale };

  if (invoice.lines.length === 0) {
    const manual = (reason: ReconciliationReason): ReconciliationResult => ({
      ...base,
      status: 'manual',
      reason,
    });
    if (invoice.total === null) return manual('no_total');
    if (expected === null) return manual('no_expected');
    if (!hasArca) return manual('arca_no_breakdown');
    if (!checkTaxLinesSum(arcaLines, Math.abs(invoice.total)).ok) {
      return manual('arca_sum_mismatch');
    }
    return { ...base, status: 'completable', reason: 'arca_available' };
  }

  if (!hasArca) return { ...base, status: 'ok', reason: 'no_arca_reference' };

  const buckets = compareBuckets(invoice.lines, arcaLines);
  if (buckets.every((b) => b.matches)) {
    return { ...base, buckets, status: 'ok', reason: 'matches_arca' };
  }
  if (ack !== null && ack.arcaFingerprint === fingerprint) {
    return { ...base, buckets, status: 'ok', reason: 'accepted' };
  }
  return { ...base, buckets, status: 'divergent', reason: 'differs' };
}
