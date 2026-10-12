/**
 * ARCA (ex AFIP) document type codes: single source of truth for client and server.
 *
 * Data lives in arca-types.json (editable, one entry per official code).
 * Official references: ARCA CAE lookup (servicioscf.afip.gob.ar/publico/comprobantes/cae.aspx)
 * and RG 3561/13 Annex II (tiques), as reproduced in RG 4644/19.
 *
 * NOTE: the gold view (v_comprobantes_oro) mirrors getInvoiceLetter() and
 * getInvoiceSign() in SQL. server/tests/api/gold-view.test.ts checks every code.
 */

import arcaTypesData from "./arca-types.json";

export type DocumentKind = "FAC" | "NCR" | "NDB";

export interface AFIPDocumentType {
  code: number;
  /** Letter (A, B, C, E, M) or '' when the document has no letter (e.g. 83 Tique). */
  invoiceType: string;
  documentKind: DocumentKind;
  friendlyType: string;
  description: string;
  descriptionLong: string;
}

/** Every known ARCA code, keyed by the numeric code as string. */
export const AFIP_TYPES: Record<string, AFIPDocumentType> =
  arcaTypesData as Record<string, AFIPDocumentType>;

/** Reverse map: friendlyType → ARCA code. */
export const FRIENDLY_TYPE_TO_CODE: Record<string, number> = Object.values(
  AFIP_TYPES,
).reduce(
  (acc, type) => {
    acc[type.friendlyType] = type.code;
    return acc;
  },
  {} as Record<string, number>,
);

/**
 * Gets the document type for an ARCA code ("011" and 11 are the same code).
 */
export function getDocumentTypeFromARCACode(
  code: number | string,
): AFIPDocumentType | undefined {
  const codeStr =
    typeof code === "number"
      ? code.toString()
      : parseInt(code.trim(), 10).toString();
  return AFIP_TYPES[codeStr];
}

/** 4-letter friendly type (e.g. "FACA"), or undefined for unknown codes. */
export function getFriendlyType(
  code: number | null | undefined,
): string | undefined {
  if (code === null || code === undefined) return undefined;
  return getDocumentTypeFromARCACode(code)?.friendlyType;
}

/** Short description (e.g. "Factura A"), or undefined for unknown codes. */
export function getDescription(
  code: number | null | undefined,
): string | undefined {
  if (code === null || code === undefined) return undefined;
  return getDocumentTypeFromARCACode(code)?.description;
}

/** Long description, or undefined for unknown codes. */
export function getDescriptionLong(
  code: number | null | undefined,
): string | undefined {
  if (code === null || code === undefined) return undefined;
  return getDocumentTypeFromARCACode(code)?.descriptionLong;
}

/** ARCA code for a friendly type (case insensitive), or undefined. */
export function getARCACodeFromFriendlyType(
  friendlyType: string,
): number | undefined {
  return FRIENDLY_TYPE_TO_CODE[friendlyType.toUpperCase()];
}

/** Whether the code exists in arca-types.json. */
export function isValidARCACode(code: number | null | undefined): boolean {
  if (code === null || code === undefined) return false;
  return AFIP_TYPES[code.toString()] !== undefined;
}

/**
 * Letter used for financial reporting. 'other' covers export invoices (E),
 * documents without letter (83 Tique, 110 Tique NC, 49 Bienes Usados) and any
 * code missing from arca-types.json.
 */
export type InvoiceLetter = "A" | "B" | "C" | "M" | "other";

const REPORTING_LETTERS: ReadonlySet<string> = new Set(["A", "B", "C", "M"]);

/**
 * Gets the reporting letter for an ARCA code.
 *
 * @example
 * getInvoiceLetter(63) // "A" (Liquidación A)
 * getInvoiceLetter(19) // "other" (Factura E)
 */
export function getInvoiceLetter(
  code: number | null | undefined,
): InvoiceLetter {
  if (code === null || code === undefined) return "other";
  const letter = getDocumentTypeFromARCACode(code)?.invoiceType;
  return letter && REPORTING_LETTERS.has(letter)
    ? (letter as InvoiceLetter)
    : "other";
}

/**
 * Sign coefficient for totals: credit notes subtract (-1), everything else
 * adds (+1). Unknown codes add.
 */
export function getInvoiceSign(code: number | null | undefined): 1 | -1 {
  if (code === null || code === undefined) return 1;
  return getDocumentTypeFromARCACode(code)?.documentKind === "NCR" ? -1 : 1;
}

/**
 * Whether VAT on this letter is recoverable as tax credit (IVA discriminado).
 */
export function isVatRecoverable(letter: InvoiceLetter): boolean {
  return letter === "A" || letter === "M";
}

/**
 * Whether documents of this code itemize VAT (net + VAT). A and M do; B, C,
 * E and documents without letter (83 Tique, 110 Tique NC) only report the
 * total. Single rule for reconciliation, breakdown prefill and the UI.
 *
 * @example
 * discriminatesVat(81) // true (Tique Factura A)
 * discriminatesVat(83) // false (Tique)
 */
export function discriminatesVat(code: number | null | undefined): boolean {
  return isVatRecoverable(getInvoiceLetter(code));
}
