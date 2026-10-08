/**
 * Types for the tax breakdown reconciliation (invoice vs ARCA).
 * Mirrors the /api/reconciliation/tax-breakdown contract.
 */

export type ReconciliationStatus = 'completable' | 'manual' | 'ok' | 'divergent';

export type ReconciliationReason =
  | 'no_total'
  | 'no_expected'
  | 'arca_no_breakdown'
  | 'arca_sum_mismatch'
  | 'arca_available'
  | 'matches_arca'
  | 'no_arca_reference'
  | 'accepted'
  | 'differs';

export type BucketConcept = 'NET_TAXED' | 'VAT' | 'NET_UNTAXED' | 'EXEMPT' | 'OTHER';

export interface BucketDiff {
  key: string;
  concept: BucketConcept;
  rate: number | null;
  invoice: number;
  arca: number;
  diff: number;
  matches: boolean;
}

export interface ReconciliationLine {
  concept: string;
  rate: number | null;
  amount: number;
}

export interface TaxReconciliationItem {
  invoiceId: number;
  issueDate: string;
  emitterCuit: string;
  emitterName: string | null;
  invoiceType: number | null;
  pointOfSale: number;
  invoiceNumber: number;
  total: number | null;
  currency: string;
  expectedInvoiceId: number | null;
  status: ReconciliationStatus;
  reason: ReconciliationReason;
  invoiceLines: Array<ReconciliationLine & { label: string | null }>;
  arcaLines: ReconciliationLine[] | null;
  arcaFingerprint: string | null;
  /** Only when both sides have lines */
  buckets: BucketDiff[];
  ack: { arcaFingerprint: string; note: string | null; createdAt: string } | null;
  /** There is an ack but ARCA changed since */
  ackStale: boolean;
}

export interface ReconciliationCounts {
  completable: number;
  manual: number;
  ok: number;
  divergent: number;
}

export interface ReconciliationListResponse {
  period: string;
  counts: ReconciliationCounts;
  items: TaxReconciliationItem[];
}

export interface CompleteResponse {
  applied: number[];
  skipped: Array<{ invoiceId: number; status: ReconciliationStatus; reason: ReconciliationReason }>;
}

export const STATUS_LABELS: Record<ReconciliationStatus, string> = {
  completable: 'Completable',
  manual: 'Manual',
  ok: 'OK',
  divergent: 'Divergente',
};

export const REASON_LABELS: Record<ReconciliationReason, string> = {
  no_total: 'Sin total cargado',
  no_expected: 'Sin vincular a ARCA',
  arca_no_breakdown: 'Sin desglose de ARCA: reimporte el Excel de ARCA del período',
  arca_sum_mismatch: 'El desglose de ARCA no suma el total',
  arca_available: 'ARCA informa un desglose que cuadra con el total',
  matches_arca: 'Igual a ARCA',
  no_arca_reference: 'Sin datos de ARCA para comparar',
  accepted: 'Diferencia aceptada',
  differs: 'Distinto de ARCA',
};

/** Label for a concept key like `NET_TAXED:21` or `OTHER`. */
export function bucketLabel(concept: string, rate: number | null): string {
  const pct = rate != null ? `${String(rate).replace('.', ',')}%` : null;
  switch (concept) {
    case 'NET_TAXED':
      return pct ? `Neto gravado · IVA ${pct}` : 'Neto gravado';
    case 'VAT':
      return pct ? `IVA ${pct}` : 'IVA';
    case 'NET_UNTAXED':
      return 'No gravado';
    case 'EXEMPT':
      return 'Exento';
    case 'OTHER':
    case 'OTHER_TAXES':
      return 'Percepciones y otros tributos';
    case 'VAT_PERCEPTION':
      return 'Percepción IVA';
    case 'IIBB_PERCEPTION':
      return 'Percepción IIBB';
    default:
      return concept;
  }
}
