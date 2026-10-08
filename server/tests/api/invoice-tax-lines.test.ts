/**
 * Invoice tax breakdown (#190): contract + GET/PUT /api/invoices/:id/tax-lines.
 *
 * Fictitious data only (CUITs from CLAUDE.md).
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { getRawDb } from '../../database/db.js';
import { cleanupTestDb, runTestMigrations, resetTestDb } from '../../database/db-test.js';
import { app } from '../../http/app.js';
import {
  checkTaxLinesSum,
  makeTaxLinesBodySchema,
  TAX_LINES_SUM_TOLERANCE,
} from '../../contracts/invoice-tax-lines.js';

const CUIT = '30-12345678-9';
let nextNumber = 1;

function insertInvoice(opts: { type?: number; total: number | null }): number {
  return Number(
    getRawDb()
      .prepare(
        `INSERT INTO facturas
           (emisor_cuit, fecha_emision, tipo_comprobante, punto_venta, numero_comprobante, total)
         VALUES (?, '2026-03-10', ?, 1, ?, ?)`
      )
      .run(CUIT, opts.type ?? 1, nextNumber++, opts.total).lastInsertRowid
  );
}

const put = (id: number, body: unknown) =>
  app.request(`/api/invoices/${id}/tax-lines`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const get = (id: number) => app.request(`/api/invoices/${id}/tax-lines`);

const net = (amount: number, rate = 21) => ({ concept: 'NET_TAXED', rate, amount });
const vat = (amount: number, rate = 21) => ({ concept: 'VAT', rate, amount });

describe('checkTaxLinesSum', () => {
  it('computes sum/diff and applies the tolerance', () => {
    expect(TAX_LINES_SUM_TOLERANCE).toBe(0.05);
    expect(checkTaxLinesSum([{ amount: 100 }, { amount: 21 }], 121)).toEqual({
      sum: 121,
      diff: 0,
      ok: true,
    });
    expect(checkTaxLinesSum([{ amount: 120.95 }], 121).ok).toBe(true);
    expect(checkTaxLinesSum([{ amount: 120.94 }], 121).ok).toBe(false);
  });

  it('schema factory rejects lines when total is null', () => {
    const r = makeTaxLinesBodySchema(null).safeParse({ lines: [net(100)] });
    expect(r.success).toBe(false);
    expect(makeTaxLinesBodySchema(null).safeParse({ lines: [] }).success).toBe(true);
  });
});

describe('/api/invoices/:id/tax-lines', () => {
  beforeAll(async () => {
    // TODO: See issue #193 (existing test DB skips new migrations)
    cleanupTestDb();
    await runTestMigrations();
  });

  beforeEach(() => {
    resetTestDb();
    nextNumber = 1;
    getRawDb()
      .prepare('INSERT INTO emisores (cuit, nombre) VALUES (?, ?)')
      .run(CUIT, 'Emisor Test');
  });

  it('GET returns an empty breakdown with sumMatches null', async () => {
    const id = insertInvoice({ total: 121 });
    const res = await get(id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      invoiceId: id,
      total: 121,
      currency: 'ARS',
      letter: 'A',
      lines: [],
      sum: 0,
      sumMatches: null,
    });
  });

  it('PUT saves lines whose sum equals the total', async () => {
    const id = insertInvoice({ total: 121 });
    const res = await put(id, {
      lines: [net(100), vat(21)],
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sum).toBe(121);
    expect(data.diff).toBe(0);
    expect(data.sumMatches).toBe(true);
    expect(data.lines).toHaveLength(2);
    expect((await (await get(id)).json()).lines).toHaveLength(2);
  });

  it('PUT accepts a difference within tolerance and rounds amounts to 2 decimals', async () => {
    const id = insertInvoice({ total: 121 });
    const res = await put(id, { lines: [net(100.004), vat(21.04)] });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.lines[0].amount).toBe(100);
    expect(data.sumMatches).toBe(true);
  });

  it('PUT rejects a sum outside tolerance (400)', async () => {
    const id = insertInvoice({ total: 121 });
    const res = await put(id, { lines: [net(100), vat(20.9)] });
    expect(res.status).toBe(400);
    expect((await res.json()).details.lines[0]).toContain('no coincide');
    expect((await (await get(id)).json()).lines).toEqual([]);
  });

  it('PUT validates rates', async () => {
    const id = insertInvoice({ total: 121 });
    // invalid rate
    expect((await put(id, { lines: [net(100, 20), vat(21)] })).status).toBe(400);
    // VAT does not accept 0
    expect((await put(id, { lines: [net(121), vat(0.01, 0)] })).status).toBe(400);
    // missing rate on NET_TAXED
    expect((await put(id, { lines: [{ concept: 'NET_TAXED', amount: 121 }] })).status).toBe(400);
    // rate on a concept that does not carry one
    const res = await put(id, { lines: [{ concept: 'EXEMPT', rate: 21, amount: 121 }] });
    expect(res.status).toBe(400);
    expect((await res.json()).details['lines.0.rate']).toBeDefined();
    // NET_TAXED at 0% is allowed
    expect((await put(id, { lines: [net(121, 0)] })).status).toBe(200);
  });

  it('PUT validates labels', async () => {
    const id = insertInvoice({ total: 121 });
    const bad = await put(id, { lines: [{ concept: 'EXEMPT', amount: 121, label: 'x' }] });
    expect(bad.status).toBe(400);
    expect((await bad.json()).details['lines.0.label']).toBeDefined();
    expect(
      (await put(id, { lines: [{ concept: 'EXEMPT', amount: 121, label: 'a'.repeat(101) }] }))
        .status
    ).toBe(400);
    const ok = await put(id, {
      lines: [net(100), vat(15), { concept: 'VAT_PERCEPTION', amount: 6, label: '  Perc. IVA  ' }],
    });
    expect(ok.status).toBe(200);
    expect((await ok.json()).lines[2].label).toBe('Perc. IVA');
  });

  it('PUT rejects non-positive amounts', async () => {
    const id = insertInvoice({ total: 121 });
    expect((await put(id, { lines: [net(0)] })).status).toBe(400);
    expect((await put(id, { lines: [net(-5)] })).status).toBe(400);
  });

  it('PUT rejects duplicates but allows repeated perceptions', async () => {
    const id = insertInvoice({ total: 200 });
    expect((await put(id, { lines: [net(100), net(100)] })).status).toBe(400);
    expect((await put(id, { lines: [net(100), vat(21), vat(79)] })).status).toBe(400);
    expect(
      (
        await put(id, {
          lines: [
            { concept: 'NET_UNTAXED', amount: 50 },
            { concept: 'NET_UNTAXED', amount: 50 },
          ],
        })
      ).status
    ).toBe(400);
    // same concept, different rate is fine
    expect((await put(id, { lines: [net(100, 21), net(100, 10.5)] })).status).toBe(200);
    expect(
      (
        await put(id, {
          lines: [
            { concept: 'OTHER_TAXES', amount: 100, label: 'a' },
            { concept: 'OTHER_TAXES', amount: 100, label: 'b' },
          ],
        })
      ).status
    ).toBe(200);
  });

  it('PUT with an empty array removes the breakdown', async () => {
    const id = insertInvoice({ total: 121 });
    await put(id, { lines: [net(100), vat(21)] });
    const res = await put(id, { lines: [] });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.lines).toEqual([]);
    expect(data.sumMatches).toBeNull();
  });

  it('PUT replaces previous lines', async () => {
    const id = insertInvoice({ total: 121 });
    await put(id, { lines: [net(100), vat(21)] });
    const res = await put(id, { lines: [net(121, 0)] });
    expect((await res.json()).lines).toHaveLength(1);
  });

  it('returns 404 for a missing invoice', async () => {
    expect((await get(9999)).status).toBe(404);
    expect((await put(9999, { lines: [] })).status).toBe(404);
  });

  it('rejects lines on an invoice without total, but accepts []', async () => {
    const id = insertInvoice({ total: null });
    const res = await put(id, { lines: [net(100)] });
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain('no tiene total');
    expect((await put(id, { lines: [] })).status).toBe(200);
  });

  it('GET reports sumMatches false when the total changed afterwards', async () => {
    const id = insertInvoice({ total: 121 });
    await put(id, { lines: [net(100), vat(21)] });
    getRawDb().prepare('UPDATE facturas SET total = 500 WHERE id = ?').run(id);
    const data = await (await get(id)).json();
    expect(data.lines).toHaveLength(2);
    expect(data.sumMatches).toBe(false);
    expect(data.diff).toBe(-379);
  });

  it('rejects a malformed body', async () => {
    const id = insertInvoice({ total: 121 });
    expect((await put(id, { nope: 1 })).status).toBe(400);
  });

  it('deletes the lines when the invoice is deleted (cascade)', async () => {
    const id = insertInvoice({ total: 121 });
    await put(id, { lines: [net(100), vat(21)] });
    const res = await app.request(`/api/invoices/${id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    const left = getRawDb()
      .prepare('SELECT COUNT(*) AS n FROM invoice_tax_lines WHERE invoice_id = ?')
      .get(id) as { n: number };
    expect(left.n).toBe(0);
  });
});
