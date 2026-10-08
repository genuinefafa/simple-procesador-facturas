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
  | 'IIBB_PERCEPTION'
  | 'OTHER_TAXES';

export interface TaxLineInput {
  concept: TaxLineConcept;
  /**
   * NET_TAXED/VAT: VAT rate in % (fixed list). Perceptions/other taxes: optional
   * free rate in %. NET_UNTAXED/EXEMPT: null.
   */
  rate: number | null;
  amount: number;
  /** Free text, only for perceptions / OTHER_TAXES (IIBB: jurisdiction) */
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
  { value: 'IIBB_PERCEPTION', label: 'Percepción IIBB' },
  { value: 'OTHER_TAXES', label: 'Otros tributos' },
];

/** Shorter names for the editor select: the detail panel is narrow. */
const SHORT_CONCEPT_LABELS: Partial<Record<TaxLineConcept, string>> = {
  VAT_PERCEPTION: 'Perc. IVA',
  IIBB_PERCEPTION: 'Perc. IIBB',
};

export const EDITOR_CONCEPT_OPTIONS: ReadonlyArray<{ value: TaxLineConcept; label: string }> =
  CONCEPT_OPTIONS.map((o) => ({ value: o.value, label: SHORT_CONCEPT_LABELS[o.value] ?? o.label }));

export const RATES_BY_CONCEPT: Partial<Record<TaxLineConcept, readonly number[]>> = {
  NET_TAXED: [0, 2.5, 5, 10.5, 21, 27],
  VAT: [2.5, 5, 10.5, 21, 27],
};

/** Concepts with an optional free rate (%) and the percentage calculator. */
export const FREE_RATE_CONCEPTS: readonly TaxLineConcept[] = [
  'VAT_PERCEPTION',
  'IIBB_PERCEPTION',
  'OTHER_TAXES',
];

export const LABEL_CONCEPTS: readonly TaxLineConcept[] = FREE_RATE_CONCEPTS;

/** Concepts that may appear several times in a breakdown. */
export const REPEATABLE_CONCEPTS: readonly TaxLineConcept[] = FREE_RATE_CONCEPTS;
