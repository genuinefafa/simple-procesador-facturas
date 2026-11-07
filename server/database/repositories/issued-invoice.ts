/**
 * Repository for issued invoices (ARCA "Mis Comprobantes Emitidos").
 *
 * Single layer: ARCA is the source of truth, so an upsert overwrites every
 * field the Excel carries. Unique key: (invoice_type, point_of_sale, invoice_number).
 */

import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { getDb } from '../db.js';
import { issuedInvoices, type IssuedInvoice, type NewIssuedInvoice } from '../schema.js';

/** Fields coming from ARCA (everything except id and bookkeeping timestamps). */
export type IssuedInvoiceInput = Omit<NewIssuedInvoice, 'id' | 'importedAt' | 'updatedAt'>;

export interface IssuedUpsertResult {
  created: number;
  updated: number;
  unchanged: number;
}

export class IssuedInvoiceRepository {
  /** Inserts new rows, updates rows that differ and leaves identical ones alone. */
  upsertMany(rows: ReadonlyArray<IssuedInvoiceInput>): IssuedUpsertResult {
    const db = getDb();
    const result: IssuedUpsertResult = { created: 0, updated: 0, unchanged: 0 };

    db.transaction((tx) => {
      for (const row of rows) {
        const existing = tx
          .select()
          .from(issuedInvoices)
          .where(
            and(
              eq(issuedInvoices.invoiceType, row.invoiceType),
              eq(issuedInvoices.pointOfSale, row.pointOfSale),
              eq(issuedInvoices.invoiceNumber, row.invoiceNumber)
            )
          )
          .get();

        if (!existing) {
          tx.insert(issuedInvoices).values(row).run();
          result.created++;
          continue;
        }

        const changed = (Object.keys(row) as Array<keyof IssuedInvoiceInput>).some(
          (k) => (row[k] ?? null) !== (existing[k] ?? null)
        );
        if (!changed) {
          result.unchanged++;
          continue;
        }

        tx.update(issuedInvoices)
          .set({ ...row, updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19) })
          .where(eq(issuedInvoices.id, existing.id))
          .run();
        result.updated++;
      }
    });

    return result;
  }

  /** Lists issued invoices, optionally bounded by issue date (inclusive, YYYY-MM-DD). */
  list(range: { from?: string; to?: string } = {}): IssuedInvoice[] {
    const conditions = [];
    if (range.from) conditions.push(gte(issuedInvoices.issueDate, range.from));
    if (range.to) conditions.push(lte(issuedInvoices.issueDate, range.to));
    return getDb()
      .select()
      .from(issuedInvoices)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(
        asc(issuedInvoices.issueDate),
        asc(issuedInvoices.pointOfSale),
        asc(issuedInvoices.invoiceNumber)
      )
      .all();
  }
}
