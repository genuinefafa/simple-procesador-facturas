/**
 * GET /api/comprobantes exposes the tax breakdown reconciliation state (#191).
 *
 * Fictitious data only.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { getRawDb } from '../../database/db.js';
import { cleanupTestDb, runTestMigrations, resetTestDb } from '../../database/db-test.js';
import { app } from '../../http/app.js';

const CUIT = '30-12345678-9';
let nextNumber = 1;

function insertExpected(withBreakdown: boolean): number {
  const extra = withBreakdown ? ', net_taxed_21, vat_21' : '';
  const values = withBreakdown ? ', 100, 21' : '';
  return Number(
    getRawDb()
      .prepare(
        `INSERT INTO expected_invoices
           (cuit, issue_date, invoice_type, point_of_sale, invoice_number, total${extra})
         VALUES (?, '2026-03-10', 1, 1, ?, 121${values})`
      )
      .run(CUIT, nextNumber++).lastInsertRowid
  );
}

function insertInvoice(expectedId: number | null): number {
  return Number(
    getRawDb()
      .prepare(
        `INSERT INTO facturas
           (emisor_cuit, fecha_emision, tipo_comprobante, punto_venta, numero_comprobante, total, expected_invoice_id)
         VALUES (?, '2026-03-10', 1, 1, ?, 121, ?)`
      )
      .run(CUIT, nextNumber++, expectedId).lastInsertRowid
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

describe('GET /api/comprobantes taxReconciliation', () => {
  beforeAll(async () => {
    // TODO: See issue #193 (existing test DB skips new migrations)
    cleanupTestDb();
    await runTestMigrations();
  });
  beforeEach(() => {
    resetTestDb();
    nextNumber = 1;
  });

  it('flags completable (with ARCA lines) and manual invoices', async () => {
    const completable = insertInvoice(insertExpected(true));
    const manual = insertInvoice(null);

    const res = await app.request('/api/comprobantes');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Any;
    const byId = (id: number) => body.comprobantes.find((c: Any) => c.id === `factura:${id}`);

    expect(byId(completable).taxReconciliation).toEqual({
      status: 'completable',
      reason: 'arca_available',
      arcaLines: expect.arrayContaining([
        expect.objectContaining({ concept: 'NET_TAXED', rate: 21, amount: 100 }),
        expect.objectContaining({ concept: 'VAT', rate: 21, amount: 21 }),
      ]),
    });
    expect(byId(manual).taxReconciliation).toEqual({ status: 'manual', reason: 'no_expected' });
  });
});
