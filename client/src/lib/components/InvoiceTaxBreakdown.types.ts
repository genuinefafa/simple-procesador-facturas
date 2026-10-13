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
  | 'OTHER_TAXES'
  | 'UNDISCRIMINATED';

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
  /**
   * Breakdown informed by ARCA (linked expected invoice) when the invoice has
   * no lines of its own; null otherwise. Perceptions come in OTHER_TAXES.
   */
  arcaSuggestion: TaxLineInput[] | null;
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
  { value: 'UNDISCRIMINATED', label: 'No discriminado' },
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

/** Props shared by both modes of InvoiceTaxBreakdown. */
interface InvoiceTaxBreakdownBaseProps {
  total?: number | null;
  /** Invoice letter (A, B, C, M...). Falls back to the one returned by the API. */
  letter?: string | null;
  /**
   * ARCA document type code. Drives the "does not itemize VAT" behavior
   * (B, C, E, no letter); unknown or missing keeps every concept available.
   */
  invoiceType?: number | null;
}

/** Persisted mode: loads and saves the breakdown of an existing invoice. */
export interface InvoiceTaxBreakdownPersistedProps extends InvoiceTaxBreakdownBaseProps {
  invoiceId: number;
  /**
   * Suggested lines to review when the invoice has no breakdown. Takes
   * precedence over the ARCA suggestion returned by the API
   * (`data.arcaSuggestion`, from the linked expected invoice). The form only
   * starts with them on an explicit click and they are never saved
   * automatically.
   */
  prefill?: TaxLineInput[];
  /** When set, a "Comparar con ARCA" button is shown next to the header actions */
  oncompare?: () => void;
  /** The comparison is already open: the button is hidden (the section has its own close) */
  compareActive?: boolean;
  lockedLines?: never;
  initialLines?: never;
  ondraftchange?: never;
}

/**
 * Draft mode: no invoice yet. The editor starts open, never fetches or saves,
 * and reports its state through `ondraftchange`. Locked lines (e.g. taken
 * as-is from ARCA) are shown disabled and cannot be removed; only the
 * perception / other-taxes concepts can be added or edited.
 * The initial lines are read once on mount: remount (`{#key}`) to reset.
 */
export interface InvoiceTaxBreakdownDraftProps extends InvoiceTaxBreakdownBaseProps {
  invoiceId?: never;
  lockedLines: TaxLineInput[];
  initialLines: TaxLineInput[];
  /** Called on every change with the editable (non-locked) lines and whether the draft is valid */
  ondraftchange: (editableLines: TaxLineInput[], valid: boolean) => void;
  prefill?: never;
  oncompare?: never;
  compareActive?: never;
}

export type InvoiceTaxBreakdownProps =
  | InvoiceTaxBreakdownPersistedProps
  | InvoiceTaxBreakdownDraftProps;
