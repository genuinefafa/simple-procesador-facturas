/**
 * Repository for the invoice vs expected/file consistency check (#191).
 *
 * Reads what the pure `computeDivergences` needs in one query, and writes
 * exactly one thing: the category of the linked input. Total, date and type
 * of an expected invoice are never written (ARCA is not overwritten).
 */

import { getRawDb } from '../db';
import type { ConsistencyInput, ConsistencySource } from '../../services/consistency';

export interface ConsistencyContext {
  input: ConsistencyInput;
  expectedId: number | null;
  fileId: number | null;
  invoiceCategoryId: number | null;
  /** ack kind -> note */
  notes: Record<string, string | null>;
}

type Row = Record<string, unknown>;

const SQL = `
  SELECT
    f.id AS id,
    f.category_id AS categoryId,
    f.total AS total,
    f.moneda AS currency,
    f.fecha_emision AS issueDate,
    f.tipo_comprobante AS invoiceType,
    e.id AS x_id,
    e.category_id AS x_categoryId,
    e.total AS x_total,
    e.currency AS x_currency,
    e.issue_date AS x_issueDate,
    e.invoice_type AS x_invoiceType,
    fl.id AS fl_id,
    fl.category_id AS fl_categoryId
  FROM facturas f
  LEFT JOIN expected_invoices e ON e.id = f.expected_invoice_id
  LEFT JOIN files fl ON fl.id = f.file_id
  WHERE f.id = ?
`;

export class ConsistencyRepository {
  findContext(invoiceId: number): ConsistencyContext | null {
    const db = getRawDb();
    const r = db.prepare(SQL).get(invoiceId) as Row | null;
    if (!r) return null;

    const acks: Record<string, string> = {};
    const notes: Record<string, string | null> = {};
    const ackRows = db
      .prepare(
        `SELECT kind, arca_fingerprint AS fingerprint, note FROM reconciliation_acks
         WHERE invoice_id = ? AND kind LIKE 'consistency\\_%' ESCAPE '\\'`
      )
      .all(invoiceId) as Array<{ kind: string; fingerprint: string; note: string | null }>;
    for (const a of ackRows) {
      acks[a.kind] = a.fingerprint;
      notes[a.kind] = a.note;
    }

    const num = (v: unknown): number | null =>
      v === null || v === undefined ? null : (v as number);
    const str = (v: unknown): string | null =>
      v === null || v === undefined ? null : (v as string);

    return {
      expectedId: num(r.x_id),
      fileId: num(r.fl_id),
      invoiceCategoryId: num(r.categoryId),
      notes,
      input: {
        invoice: {
          categoryId: num(r.categoryId),
          total: num(r.total),
          currency: str(r.currency),
          issueDate: str(r.issueDate),
          invoiceType: num(r.invoiceType),
        },
        expected:
          r.x_id === null || r.x_id === undefined
            ? null
            : {
                categoryId: num(r.x_categoryId),
                total: num(r.x_total),
                currency: str(r.x_currency),
                issueDate: str(r.x_issueDate),
                invoiceType: num(r.x_invoiceType),
              },
        file:
          r.fl_id === null || r.fl_id === undefined ? null : { categoryId: num(r.fl_categoryId) },
        acks,
      },
    };
  }

  /** Sets the category of the linked expected invoice or file. Touches nothing else. */
  setInputCategory(source: ConsistencySource, inputId: number, categoryId: number): void {
    const db = getRawDb();
    if (source === 'expected') {
      db.prepare('UPDATE expected_invoices SET category_id = ? WHERE id = ?').run(
        categoryId,
        inputId
      );
    } else {
      db.prepare(
        'UPDATE files SET category_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(categoryId, inputId);
    }
  }
}
