/**
 * Types for the layer consistency check (invoice vs expected/file).
 * Mirrors the /api/reconciliation/consistency contract.
 */

export type ConsistencyField = 'category' | 'total' | 'date' | 'type';
export type ConsistencySource = 'expected' | 'file';
export type DivergenceKind = 'missing' | 'different';

export interface Divergence {
  field: ConsistencyField;
  source: ConsistencySource;
  kind: DivergenceKind;
  invoiceValue: string | number | null;
  sourceValue: string | number | null;
  acked: boolean;
  /** Note of the accepted difference; null when not accepted */
  note: string | null;
}

/** Fields of the invoice that can be aligned with an input value (one at a time). */
export type InvoiceCorrection =
  | { categoryId: number }
  | { total: number }
  | { issueDate: string }
  | { invoiceType: number };
