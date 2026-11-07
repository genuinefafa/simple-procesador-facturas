/** Successful response of POST /api/expected-invoices/import. */
export interface ArcaImportResult {
  success: true;
  batchId: number | string;
  filename: string;
  totalRows: number;
  imported: number;
  updated: number;
  unchanged: number;
  emittersCreated: number;
  emittersExisting: number;
  errors: Array<{ row: number; error: string }>;
  withBreakdown: number;
  /** Distinct years ('YYYY') found in the file, ascending. */
  periods: string[];
}

/** Successful response when the file was an "Emitidos" export (issued invoices). */
export interface ArcaIssuedImportResult {
  success: true;
  kind: 'issued';
  filename: string;
  totalRows: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: Array<{ row: number; error: string }>;
  /** Distinct years ('YYYY') found in the file, ascending. */
  periods: string[];
}

export type ArcaImportEntry =
  | { filename: string; status: 'loading' }
  | { filename: string; status: 'done'; result: ArcaImportResult }
  | { filename: string; status: 'issued'; result: ArcaIssuedImportResult }
  | { filename: string; status: 'error'; error: string };

export interface ReconciliationSummary {
  completable: number;
  divergent: number;
}
