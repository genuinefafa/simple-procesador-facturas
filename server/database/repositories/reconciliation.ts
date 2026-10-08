/**
 * Repository for invoice vs ARCA reconciliation (#191).
 *
 * Reads candidates (invoice + linked expected invoice + own tax lines + ack)
 * in a single query, and manages the acks (accepted differences).
 */

import { eq, sql } from 'drizzle-orm';
import { getDb, getRawDb } from '../db';
import { invoiceTaxLines } from '../schema';
import type { PeriodRange } from '../../contracts/stats';
import { EXPECTED_TAX_COLUMN_KEYS, type ExpectedTaxColumns } from '../../utils/expected-tax-lines';

export const TAX_BREAKDOWN_KIND = 'tax_breakdown';

export interface CandidateTaxLine {
  concept: string;
  rate: number | null;
  amount: number;
  label: string | null;
}

export interface TaxBreakdownCandidate {
  invoiceId: number;
  issueDate: string;
  emitterCuit: string;
  emitterName: string | null;
  invoiceType: number | null;
  pointOfSale: number;
  invoiceNumber: number;
  total: number | null;
  currency: string;
  expectedInvoiceId: number | null;
  /** Breakdown columns of the linked expected invoice; null when not linked */
  expected: ({ id: number } & ExpectedTaxColumns) | null;
  lines: CandidateTaxLine[];
  ack: { arcaFingerprint: string; note: string | null; createdAt: string } | null;
}

function toSnake(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/([a-z])(\d)/g, '$1_$2')
    .toLowerCase();
}

const EXPECTED_SELECT = EXPECTED_TAX_COLUMN_KEYS.map((k) => `e.${toSnake(k)} AS x_${k}`).join(
  ',\n    '
);

const BASE_SQL = `
  SELECT
    f.id AS invoiceId,
    f.fecha_emision AS issueDate,
    f.emisor_cuit AS emitterCuit,
    em.nombre AS emitterName,
    f.tipo_comprobante AS invoiceType,
    f.punto_venta AS pointOfSale,
    f.numero_comprobante AS invoiceNumber,
    f.total AS total,
    COALESCE(f.moneda, 'ARS') AS currency,
    f.expected_invoice_id AS expectedInvoiceId,
    e.id AS x_id,
    ${EXPECTED_SELECT},
    (
      SELECT json_group_array(json_object(
        'concept', t.concept, 'rate', t.rate, 'amount', t.amount, 'label', t.label))
      FROM (SELECT * FROM invoice_tax_lines WHERE invoice_id = f.id ORDER BY id) t
    ) AS linesJson,
    a.arca_fingerprint AS ackFingerprint,
    a.note AS ackNote,
    a.created_at AS ackCreatedAt
  FROM facturas f
  LEFT JOIN emisores em ON em.cuit = f.emisor_cuit
  LEFT JOIN expected_invoices e ON e.id = f.expected_invoice_id
  LEFT JOIN reconciliation_acks a ON a.invoice_id = f.id AND a.kind = '${TAX_BREAKDOWN_KIND}'
`;

type Row = Record<string, unknown>;

function mapRow(r: Row): TaxBreakdownCandidate {
  let expected: TaxBreakdownCandidate['expected'] = null;
  if (r.x_id !== null && r.x_id !== undefined) {
    const cols = {} as ExpectedTaxColumns;
    for (const k of EXPECTED_TAX_COLUMN_KEYS) {
      cols[k] = (r[`x_${k}`] as number | null) ?? null;
    }
    expected = { id: r.x_id as number, ...cols };
  }
  const lines = r.linesJson ? (JSON.parse(r.linesJson as string) as CandidateTaxLine[]) : [];
  return {
    invoiceId: r.invoiceId as number,
    issueDate: r.issueDate as string,
    emitterCuit: r.emitterCuit as string,
    emitterName: (r.emitterName as string | null) ?? null,
    invoiceType: (r.invoiceType as number | null) ?? null,
    pointOfSale: r.pointOfSale as number,
    invoiceNumber: r.invoiceNumber as number,
    total: (r.total as number | null) ?? null,
    currency: r.currency as string,
    expectedInvoiceId: (r.expectedInvoiceId as number | null) ?? null,
    expected,
    lines,
    ack:
      r.ackFingerprint !== null && r.ackFingerprint !== undefined
        ? {
            arcaFingerprint: r.ackFingerprint as string,
            note: (r.ackNote as string | null) ?? null,
            createdAt: (r.ackCreatedAt as string | null) ?? '',
          }
        : null,
  };
}

export class ReconciliationRepository {
  /** Invoices issued in [from, to), newest first. One query for everything. */
  async listTaxBreakdownCandidates(range: PeriodRange): Promise<TaxBreakdownCandidate[]> {
    const rows = getRawDb()
      .prepare(
        `${BASE_SQL}
         WHERE f.fecha_emision >= ? AND f.fecha_emision < ?
         ORDER BY f.fecha_emision DESC, f.id DESC`
      )
      .all(range.from, range.to) as Row[];
    return rows.map(mapRow);
  }

  async findTaxBreakdownCandidate(invoiceId: number): Promise<TaxBreakdownCandidate | null> {
    const row = getRawDb().prepare(`${BASE_SQL} WHERE f.id = ?`).get(invoiceId) as Row | null;
    return row ? mapRow(row) : null;
  }

  /**
   * Replaces the breakdown of several invoices in ONE transaction. When
   * `clearAck` is set the tax_breakdown ack of those invoices is removed too.
   */
  async replaceBreakdowns(
    entries: Array<{
      invoiceId: number;
      lines: Array<{ concept: string; rate: number | null; amount: number }>;
    }>,
    clearAck = false
  ): Promise<void> {
    getDb().transaction((tx) => {
      for (const { invoiceId, lines } of entries) {
        tx.delete(invoiceTaxLines).where(eq(invoiceTaxLines.invoiceId, invoiceId)).run();
        if (lines.length > 0) {
          tx.insert(invoiceTaxLines)
            .values(
              lines.map((l) => ({
                invoiceId,
                concept: l.concept as (typeof invoiceTaxLines.$inferInsert)['concept'],
                rate: l.rate,
                amount: l.amount,
                label: null,
              }))
            )
            .run();
        }
        if (clearAck) {
          tx.run(
            sql`DELETE FROM reconciliation_acks WHERE invoice_id = ${invoiceId} AND kind = ${TAX_BREAKDOWN_KIND}`
          );
        }
      }
    });
  }

  async upsertAck(
    invoiceId: number,
    kind: string,
    fingerprint: string,
    note: string | null
  ): Promise<void> {
    getRawDb()
      .prepare(
        `INSERT INTO reconciliation_acks (invoice_id, kind, arca_fingerprint, note)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (invoice_id, kind) DO UPDATE SET
           arca_fingerprint = excluded.arca_fingerprint,
           note = excluded.note,
           created_at = CURRENT_TIMESTAMP`
      )
      .run(invoiceId, kind, fingerprint, note);
  }

  async deleteAck(invoiceId: number, kind: string): Promise<void> {
    getRawDb()
      .prepare('DELETE FROM reconciliation_acks WHERE invoice_id = ? AND kind = ?')
      .run(invoiceId, kind);
  }
}
