/**
 * Types for the invoice tax breakdown (#190). Mirrors server/contracts/invoice-tax-lines.ts.
 * Credit notes are stored with POSITIVE amounts.
 */

export type TaxLineConcept =
  | 'NET_TAXED'
  | 'NET_UNTAXED'
  | 'EXEMPT'
  | 'VAT'
  | 'VAT_PERCEPTION'
  | 'OTHER_TAXES';

export interface TaxLineInput {
  concept: TaxLineConcept;
  /** VAT rate in %, only for NET_TAXED and VAT */
  rate: number | null;
  amount: number;
  /** Free text, only for VAT_PERCEPTION / OTHER_TAXES */
  label: string | null;
}

export interface TaxLine extends TaxLineInput {
  id: number;
}

export interface TaxLinesResponse {
  invoiceId: number;
  total: number | null;
  currency: string;
  letter: string;
  lines: TaxLine[];
  sum: number;
  diff: number | null;
  /** null = no breakdown loaded */
  sumMatches: boolean | null;
}

export const TAX_SUM_TOLERANCE = 0.05;

export const CONCEPT_OPTIONS: ReadonlyArray<{ value: TaxLineConcept; label: string }> = [
  { value: 'NET_TAXED', label: 'Neto gravado' },
  { value: 'NET_UNTAXED', label: 'Neto no gravado' },
  { value: 'EXEMPT', label: 'Exento' },
  { value: 'VAT', label: 'IVA' },
  { value: 'VAT_PERCEPTION', label: 'Percepción IVA' },
  { value: 'OTHER_TAXES', label: 'Otros tributos' },
];

export const RATES_BY_CONCEPT: Partial<Record<TaxLineConcept, readonly number[]>> = {
  NET_TAXED: [0, 2.5, 5, 10.5, 21, 27],
  VAT: [2.5, 5, 10.5, 21, 27],
};

export const LABEL_CONCEPTS: readonly TaxLineConcept[] = ['VAT_PERCEPTION', 'OTHER_TAXES'];
