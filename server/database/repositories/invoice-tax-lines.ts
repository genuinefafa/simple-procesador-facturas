/**
 * Repository for the invoice tax breakdown (#190, silver layer).
 *
 * One row per concept. Amounts are positive, also for credit notes.
 */

import { asc, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { expectedInvoices, facturas, invoiceTaxLines, type InvoiceTaxLine } from '../schema';
import { expectedToTaxLines } from '../../utils/expected-tax-lines';

export type { InvoiceTaxLine };

export interface TaxLineInsert {
  concept: InvoiceTaxLine['concept'];
  rate: number | null;
  amount: number;
  label: string | null;
}

/** Minimal invoice data needed to validate/present a breakdown. */
export interface InvoiceTaxContext {
  id: number;
  /** null when the invoice has no total (facturas.total is nullable) */
  total: number | null;
  currency: string;
  invoiceType: number | null;
  /** Linked expected invoice (ARCA, bronze layer), if any */
  expectedInvoiceId: number | null;
}

export interface IInvoiceTaxLinesRepository {
  findInvoiceContext(invoiceId: number): Promise<InvoiceTaxContext | null>;
  findByInvoiceId(invoiceId: number): Promise<InvoiceTaxLine[]>;
  findArcaSuggestion(ctx: InvoiceTaxContext): Promise<TaxLineInsert[] | null>;
  replaceForInvoice(invoiceId: number, lines: TaxLineInsert[]): Promise<InvoiceTaxLine[]>;
}

export class InvoiceTaxLinesRepository implements IInvoiceTaxLinesRepository {
  async findInvoiceContext(invoiceId: number): Promise<InvoiceTaxContext | null> {
    const rows = await getDb()
      .select({
        id: facturas.id,
        total: facturas.total,
        currency: facturas.moneda,
        invoiceType: facturas.tipoComprobante,
        expectedInvoiceId: facturas.expectedInvoiceId,
      })
      .from(facturas)
      .where(eq(facturas.id, invoiceId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      total: row.total ?? null,
      currency: row.currency ?? 'ARS',
      invoiceType: row.invoiceType ?? null,
      expectedInvoiceId: row.expectedInvoiceId ?? null,
    };
  }

  async findByInvoiceId(invoiceId: number): Promise<InvoiceTaxLine[]> {
    return getDb()
      .select()
      .from(invoiceTaxLines)
      .where(eq(invoiceTaxLines.invoiceId, invoiceId))
      .orderBy(asc(invoiceTaxLines.id));
  }

  /**
   * Breakdown suggested by ARCA: only when the invoice has NO lines of its own
   * and its linked expected invoice carries a breakdown. Never persisted here.
   * ARCA does not separate perceptions, so they come grouped in OTHER_TAXES.
   */
  async findArcaSuggestion(ctx: InvoiceTaxContext): Promise<TaxLineInsert[] | null> {
    if (ctx.expectedInvoiceId === null) return null;
    const own = await getDb()
      .select({ id: invoiceTaxLines.id })
      .from(invoiceTaxLines)
      .where(eq(invoiceTaxLines.invoiceId, ctx.id))
      .limit(1);
    if (own.length > 0) return null;

    const rows = await getDb()
      .select()
      .from(expectedInvoices)
      .where(eq(expectedInvoices.id, ctx.expectedInvoiceId))
      .limit(1);
    const lines = expectedToTaxLines(rows[0]);
    if (!lines || lines.length === 0) return null;
    return lines.map((l) => ({ ...l, label: null }));
  }

  /**
   * Replaces the whole breakdown of an invoice in one transaction.
   * An empty array removes it.
   */
  async replaceForInvoice(invoiceId: number, lines: TaxLineInsert[]): Promise<InvoiceTaxLine[]> {
    getDb().transaction((tx) => {
      tx.delete(invoiceTaxLines).where(eq(invoiceTaxLines.invoiceId, invoiceId)).run();
      if (lines.length > 0) {
        tx.insert(invoiceTaxLines)
          .values(lines.map((l) => ({ ...l, invoiceId })))
          .run();
      }
    });
    return this.findByInvoiceId(invoiceId);
  }
}
