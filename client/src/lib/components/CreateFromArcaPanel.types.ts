/**
 * Types for creating an invoice straight from an ARCA expected invoice.
 * Mirrors the server contract of /api/expected-invoices/:id/arca-breakdown and /match.
 */

import type { TaxLineInput } from './InvoiceTaxBreakdown.types';

/** Subset of the expected invoice the panel needs to render its read-only summary */
export interface CreateFromArcaExpected {
  id: number;
  cuit: string;
  emitterName?: string | null;
  issueDate: string;
  invoiceType: number | null;
  pointOfSale: number;
  invoiceNumber: number;
  total?: number | null;
  categoryId?: number | null;
}

export interface ArcaBreakdownResponse {
  expectedId: number;
  total: number;
  invoiceType: number | null;
  currency: string;
  /** Lines taken as-is from ARCA (net, VAT, exempt...): read-only */
  fixed: TaxLineInput[];
  /** Editable lines (perceptions / other taxes) prefilled from ARCA */
  others: TaxLineInput[];
  /** Raw "otros tributos" amount informed by ARCA, before the user splits it */
  arcaOtherTaxes: number;
}

export interface CreateFromExpectedBody {
  fileId: number;
  categoryId?: number | null;
  otherTaxLines?: TaxLineInput[];
}

export interface CreatedInvoiceSummary {
  id: number;
  fullInvoiceNumber: string;
  emitterCuit: string;
  total: number;
  issueDate: string;
  filePath: string | null;
}

export interface CreateFromExpectedResponse {
  success: true;
  invoice: CreatedInvoiceSummary;
}
