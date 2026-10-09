/**
 * Invoice vs ARCA tax breakdown reconciliation (#191): /api/reconciliation/tax-breakdown.
 *
 * Fictitious data only.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { getRawDb } from '../../database/db.js';
import { cleanupTestDb, runTestMigrations, resetTestDb } from '../../database/db-test.js';
import { app } from '../../http/app.js';

const CUIT = '30-12345678-9';
let nextNumber = 1;

function insertInvoice(opts: {
  total: number | null;
  expectedId?: number | null;
  date?: string;
  lines?: Array<[string, number | null, number]>;
}): number {
  const id = Number(
    getRawDb()
      .prepare(
        `INSERT INTO facturas
           (emisor_cuit, fecha_emision, tipo_comprobante, punto_venta, numero_comprobante, total, expected_invoice_id)
         VALUES (?, ?, 1, 1, ?, ?, ?)`
      )
      .run(CUIT, opts.date ?? '2026-03-10', nextNumber++, opts.total, opts.expectedId ?? null)
      .lastInsertRowid
  );
  for (const [concept, rate, amount] of opts.lines ?? []) {
    getRawDb()
      .prepare(
        'INSERT INTO invoice_tax_lines (invoice_id, concept, rate, amount) VALUES (?, ?, ?, ?)'
      )
      .run(id, concept, rate, amount);
  }
  return id;
}

function insertExpected(cols: Record<string, number | null> = {}): number {
  const names = Object.keys(cols);
  return Number(
    getRawDb()
      .prepare(
        `INSERT INTO expected_invoices
           (cuit, issue_date, invoice_type, point_of_sale, invoice_number, total${names.map((n) => `, ${n}`).join('')})
         VALUES (?, '2026-03-10', 1, 1, ?, 121${names.map(() => ', ?').join('')})`
      )
      .run(CUIT, nextNumber++, ...names.map((n) => cols[n])).lastInsertRowid
  );
}

const BASE = '/api/reconciliation/tax-breakdown';
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const arca = { net_taxed_21: 100, vat_21: 21 };
const matching: Array<[string, number | null, number]> = [
  ['NET_TAXED', 21, 100],
  ['VAT', 21, 21],
];
const diverging: Array<[string, number | null, number]> = [
  ['NET_TAXED', 21, 90],
  ['VAT', 21, 31],
];

describe('/api/reconciliation/tax-breakdown', () => {
  beforeAll(async () => {
    // TODO: See issue #193 (existing test DB skips new migrations)
    cleanupTestDb();
    await runTestMigrations();
  });
  beforeEach(() => {
    resetTestDb();
    nextNumber = 1;
  });

  it('lists a period with counts and excludes invoices outside of it', async () => {
    const completable = insertInvoice({ total: 121, expectedId: insertExpected(arca) });
    insertInvoice({ total: 121 }); // manual: no expected
    insertInvoice({ total: 121, expectedId: insertExpected(arca), lines: matching }); // ok
    const divergent = insertInvoice({
      total: 121,
      expectedId: insertExpected(arca),
      lines: diverging,
    });
    insertInvoice({ total: 121, expectedId: insertExpected(arca), date: '2025-12-31' });
    insertInvoice({ total: 121, expectedId: insertExpected(arca), date: '2026-04-01' });

    const res = await app.request(`${BASE}?period=2026-Q1`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Any;
    expect(body.period).toBe('2026-Q1');
    expect(body.counts).toEqual({ completable: 1, manual: 1, ok: 1, divergent: 1 });
    expect(body.items).toHaveLength(4);
    // newest first with id desc as tie-breaker
    expect(body.items[0].invoiceId).toBe(divergent);
    const item = body.items.find((i: Any) => i.invoiceId === completable);
    expect(item).toMatchObject({
      status: 'completable',
      emitterCuit: CUIT,
      total: 121,
      currency: 'ARS',
      invoiceLines: [],
      ack: null,
      ackStale: false,
    });
    expect(item.arcaLines).toHaveLength(2);
    expect(item.arcaFingerprint).toMatch(/^e\d+\|NET_TAXED:21=100\.00\|VAT:21=21\.00$/);
    const div = body.items.find((i: Any) => i.invoiceId === divergent);
    expect(div.buckets.some((b: Any) => !b.matches)).toBe(true);
    expect(div.invoiceLines[0]).toMatchObject({ concept: 'NET_TAXED', rate: 21, label: null });
  });

  it('rejects an invalid period', async () => {
    expect((await app.request(`${BASE}?period=2026-13`)).status).toBe(400);
    expect((await app.request(BASE)).status).toBe(400);
  });

  it('complete applies only completable invoices and skips the rest', async () => {
    const ok = insertInvoice({ total: 121, expectedId: insertExpected(arca) });
    const was = insertInvoice({ total: 121, expectedId: insertExpected(arca) });
    const manual = insertInvoice({ total: 121 });
    const withLines = insertInvoice({
      total: 121,
      expectedId: insertExpected(arca),
      lines: matching,
    });
    // became non-completable: ARCA sum no longer matches the total
    getRawDb().prepare('UPDATE facturas SET total = 500 WHERE id = ?').run(was);

    const res = await app.request(
      `${BASE}/complete`,
      json('POST', { invoiceIds: [ok, was, manual, withLines, ok, 99999] })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Any;
    expect(body.applied).toEqual([ok]);
    expect(body.skipped).toEqual(
      expect.arrayContaining([
        { invoiceId: was, status: 'manual', reason: 'arca_sum_mismatch' },
        { invoiceId: manual, status: 'manual', reason: 'no_expected' },
        { invoiceId: withLines, status: 'ok', reason: 'matches_arca' },
        { invoiceId: 99999, status: null, reason: 'not_found' },
      ])
    );
    const rows = getRawDb()
      .prepare('SELECT concept, rate, amount, label FROM invoice_tax_lines WHERE invoice_id = ?')
      .all(ok);
    expect(rows).toEqual([
      { concept: 'NET_TAXED', rate: 21, amount: 100, label: null },
      { concept: 'VAT', rate: 21, amount: 21, label: null },
    ]);
  });

  it('complete validates the body', async () => {
    expect((await app.request(`${BASE}/complete`, json('POST', { invoiceIds: [] }))).status).toBe(
      400
    );
  });

  it('GET one returns 404 for unknown invoices', async () => {
    expect((await app.request(`${BASE}/99999`)).status).toBe(404);
  });

  it('normalize replaces the breakdown with ARCA and clears the ack', async () => {
    const id = insertInvoice({ total: 121, expectedId: insertExpected(arca), lines: diverging });
    const item = ((await (await app.request(`${BASE}/${id}`)).json()) as Any).item;
    expect(item.status).toBe('divergent');
    await app.request(
      `${BASE}/${id}/ack`,
      json('PUT', { arcaFingerprint: item.arcaFingerprint, note: 'ok' })
    );

    const res = await app.request(
      `${BASE}/${id}/normalize`,
      json('POST', { arcaFingerprint: item.arcaFingerprint })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Any;
    expect(body.item).toMatchObject({ status: 'ok', reason: 'matches_arca', ack: null });
    expect(body.item.invoiceLines.map((l: Any) => l.amount)).toEqual([100, 21]);
    expect(getRawDb().prepare('SELECT COUNT(*) AS n FROM reconciliation_acks').get()).toEqual({
      n: 0,
    });
  });

  it('normalize answers 409 with a stale fingerprint or without ARCA data', async () => {
    const expectedId = insertExpected(arca);
    const id = insertInvoice({ total: 121, expectedId, lines: diverging });
    const res = await app.request(
      `${BASE}/${id}/normalize`,
      json('POST', { arcaFingerprint: 'e1|VAT:21=1.00' })
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as Any).error).toContain('ARCA cambiaron');

    const bare = insertInvoice({ total: 121 });
    const res2 = await app.request(
      `${BASE}/${bare}/normalize`,
      json('POST', { arcaFingerprint: 'x' })
    );
    expect(res2.status).toBe(409);

    // ARCA sum does not match the total
    getRawDb().prepare('UPDATE facturas SET total = 500 WHERE id = ?').run(id);
    const fp = ((await (await app.request(`${BASE}/${id}`)).json()) as Any).item.arcaFingerprint;
    const res3 = await app.request(
      `${BASE}/${id}/normalize`,
      json('POST', { arcaFingerprint: fp })
    );
    expect(res3.status).toBe(409);
    expect(((await res3.json()) as Any).error).toContain('no coincide');
  });

  it('ack: 409 unless divergent; pins, goes stale when ARCA changes, and can be deleted', async () => {
    // One invoice per expected invoice (unique index since #203)
    const okId = insertInvoice({ total: 121, expectedId: insertExpected(arca), lines: matching });
    const okItem = ((await (await app.request(`${BASE}/${okId}`)).json()) as Any).item;
    const notDivergent = await app.request(
      `${BASE}/${okId}/ack`,
      json('PUT', { arcaFingerprint: okItem.arcaFingerprint })
    );
    expect(notDivergent.status).toBe(409);

    const expectedId = insertExpected(arca);
    const id = insertInvoice({ total: 121, expectedId, lines: diverging });
    const item = ((await (await app.request(`${BASE}/${id}`)).json()) as Any).item;
    expect(item.status).toBe('divergent');

    const stale = await app.request(`${BASE}/${id}/ack`, json('PUT', { arcaFingerprint: 'nope' }));
    expect(stale.status).toBe(409);

    const put = await app.request(
      `${BASE}/${id}/ack`,
      json('PUT', { arcaFingerprint: item.arcaFingerprint, note: '  Redondeo del proveedor ' })
    );
    expect(put.status).toBe(200);
    const pinned = ((await put.json()) as Any).item;
    expect(pinned).toMatchObject({ status: 'ok', reason: 'accepted', ackStale: false });
    expect(pinned.ack).toMatchObject({
      arcaFingerprint: item.arcaFingerprint,
      note: 'Redondeo del proveedor',
    });

    // ARCA changes -> divergent again, ack stale
    getRawDb().prepare('UPDATE expected_invoices SET vat_21 = 22 WHERE id = ?').run(expectedId);
    const changed = ((await (await app.request(`${BASE}/${id}`)).json()) as Any).item;
    expect(changed).toMatchObject({ status: 'divergent', ackStale: true });
    expect(changed.arcaFingerprint).not.toBe(item.arcaFingerprint);

    // delete is idempotent
    for (let i = 0; i < 2; i++) {
      const del = await app.request(`${BASE}/${id}/ack`, { method: 'DELETE' });
      expect(del.status).toBe(200);
      expect(((await del.json()) as Any).item).toMatchObject({ ack: null, ackStale: false });
    }
    expect((await app.request(`${BASE}/99999/ack`, { method: 'DELETE' })).status).toBe(404);
  });
});
