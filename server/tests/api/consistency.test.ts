/**
 * Layer consistency (#191): /api/reconciliation/consistency.
 *
 * Fictitious data only.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { getRawDb } from '../../database/db.js';
import { cleanupTestDb, runTestMigrations, resetTestDb } from '../../database/db-test.js';
import { app } from '../../http/app.js';

const CUIT = '30-12345678-9';
const BASE = '/api/reconciliation/consistency';
let nextNumber = 1;

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function insertCategory(key: string): number {
  return Number(
    getRawDb().prepare('INSERT INTO categories (key, description) VALUES (?, ?)').run(key, key)
      .lastInsertRowid
  );
}

function insertFile(categoryId: number | null): number {
  const n = nextNumber++;
  return Number(
    getRawDb()
      .prepare(
        `INSERT INTO files (original_filename, file_type, file_hash, storage_path, category_id)
         VALUES (?, 'PDF_DIGITAL', ?, ?, ?)`
      )
      .run(`f${n}.pdf`, `hash-${n}`, `input/f${n}.pdf`, categoryId).lastInsertRowid
  );
}

function insertExpected(opts: {
  categoryId?: number | null;
  total?: number | null;
  date?: string;
  type?: number | null;
}): number {
  return Number(
    getRawDb()
      .prepare(
        `INSERT INTO expected_invoices
           (cuit, issue_date, invoice_type, point_of_sale, invoice_number, total, category_id)
         VALUES (?, ?, ?, 1, ?, ?, ?)`
      )
      .run(
        CUIT,
        opts.date ?? '2026-03-10',
        opts.type === undefined ? 1 : opts.type,
        nextNumber++,
        opts.total === undefined ? 121 : opts.total,
        opts.categoryId ?? null
      ).lastInsertRowid
  );
}

function insertInvoice(opts: {
  categoryId?: number | null;
  expectedId?: number | null;
  fileId?: number | null;
  total?: number;
  date?: string;
}): number {
  return Number(
    getRawDb()
      .prepare(
        `INSERT INTO facturas
           (emisor_cuit, fecha_emision, tipo_comprobante, punto_venta, numero_comprobante, total,
            category_id, expected_invoice_id, file_id)
         VALUES (?, ?, 1, 1, ?, ?, ?, ?, ?)`
      )
      .run(
        CUIT,
        opts.date ?? '2026-03-10',
        nextNumber++,
        opts.total ?? 121,
        opts.categoryId ?? null,
        opts.expectedId ?? null,
        opts.fileId ?? null
      ).lastInsertRowid
  );
}

describe('/api/reconciliation/consistency', () => {
  beforeAll(async () => {
    // TODO: See issue #193 (existing test DB skips new migrations)
    cleanupTestDb();
    await runTestMigrations();
  });
  beforeEach(() => {
    resetTestDb();
    nextNumber = 1;
    getRawDb()
      .prepare('INSERT OR IGNORE INTO emisores (cuit, nombre) VALUES (?, ?)')
      .run(CUIT, 'Emisor Ficticio');
  });

  it('validates the id and returns 404 for an unknown invoice', async () => {
    expect((await app.request(`${BASE}/abc`)).status).toBe(400);
    expect((await app.request(`${BASE}/9999`)).status).toBe(404);
  });

  it('returns an empty list without links', async () => {
    const id = insertInvoice({});
    const body = (await (await app.request(`${BASE}/${id}`)).json()) as Any;
    expect(body).toEqual({ success: true, divergences: [] });
  });

  it('lists divergences against expected and file', async () => {
    const cat = insertCategory('servicios');
    const id = insertInvoice({
      categoryId: cat,
      expectedId: insertExpected({ total: 200 }),
      fileId: insertFile(null),
    });
    const body = (await (await app.request(`${BASE}/${id}`)).json()) as Any;
    expect(body.divergences.map((d: Any) => `${d.field}:${d.source}:${d.kind}`).sort()).toEqual([
      'category:expected:missing',
      'category:file:missing',
      'total:expected:different',
    ]);
  });

  describe('POST /:invoiceId/category', () => {
    it('copies the invoice category to the expected without touching anything else', async () => {
      const cat = insertCategory('servicios');
      const expectedId = insertExpected({ total: 200, date: '2026-03-11', type: 6 });
      const id = insertInvoice({ categoryId: cat, expectedId });
      const before = getRawDb()
        .prepare('SELECT * FROM expected_invoices WHERE id = ?')
        .get(expectedId) as Record<string, unknown>;

      const res = await app.request(`${BASE}/${id}/category`, json('POST', { source: 'expected' }));
      expect(res.status).toBe(200);

      const after = getRawDb()
        .prepare('SELECT * FROM expected_invoices WHERE id = ?')
        .get(expectedId) as Record<string, unknown>;
      expect(after.category_id).toBe(cat);
      expect({ ...after, category_id: null }).toEqual({ ...before, category_id: null });

      const body = (await res.json()) as Any;
      // category is aligned; total, date and type stay as divergences (ARCA is not overwritten)
      expect(body.divergences.map((d: Any) => d.field).sort()).toEqual(['date', 'total', 'type']);
    });

    it('copies the category to the file', async () => {
      const cat = insertCategory('servicios');
      const fileId = insertFile(null);
      const id = insertInvoice({ categoryId: cat, fileId });
      const res = await app.request(`${BASE}/${id}/category`, json('POST', { source: 'file' }));
      expect(res.status).toBe(200);
      const row = getRawDb()
        .prepare('SELECT category_id FROM files WHERE id = ?')
        .get(fileId) as Any;
      expect(row.category_id).toBe(cat);
    });

    it('does not take the value from the client', async () => {
      const cat = insertCategory('servicios');
      const other = insertCategory('otros');
      const expectedId = insertExpected({});
      const id = insertInvoice({ categoryId: cat, expectedId });
      await app.request(
        `${BASE}/${id}/category`,
        json('POST', { source: 'expected', categoryId: other })
      );
      const row = getRawDb()
        .prepare('SELECT category_id FROM expected_invoices WHERE id = ?')
        .get(expectedId) as Any;
      expect(row.category_id).toBe(cat);
    });

    it('404 without link, 400 without invoice category or bad body', async () => {
      const cat = insertCategory('servicios');
      const noLink = insertInvoice({ categoryId: cat });
      expect(
        (await app.request(`${BASE}/${noLink}/category`, json('POST', { source: 'expected' })))
          .status
      ).toBe(404);
      expect(
        (await app.request(`${BASE}/${noLink}/category`, json('POST', { source: 'file' }))).status
      ).toBe(404);

      const noCat = insertInvoice({ expectedId: insertExpected({}) });
      expect(
        (await app.request(`${BASE}/${noCat}/category`, json('POST', { source: 'expected' })))
          .status
      ).toBe(400);
      expect(
        (await app.request(`${BASE}/${noCat}/category`, json('POST', { source: 'x' }))).status
      ).toBe(400);
    });
  });

  describe('ack', () => {
    it('accepts a difference, then it comes back when the input changes', async () => {
      const expectedId = insertExpected({ total: 200 });
      const id = insertInvoice({ expectedId });

      const put = await app.request(
        `${BASE}/${id}/ack`,
        json('PUT', { field: 'total', source: 'expected', note: 'redondeo manual' })
      );
      expect(put.status).toBe(200);
      const acked = ((await put.json()) as Any).divergences[0];
      expect(acked).toMatchObject({ field: 'total', acked: true, note: 'redondeo manual' });

      getRawDb().prepare('UPDATE expected_invoices SET total = 250 WHERE id = ?').run(expectedId);
      const again = (await (await app.request(`${BASE}/${id}`)).json()) as Any;
      expect(again.divergences[0]).toMatchObject({
        field: 'total',
        acked: false,
        sourceValue: 250,
      });
    });

    it('can be removed (idempotent)', async () => {
      const id = insertInvoice({ expectedId: insertExpected({ type: 6 }) });
      await app.request(`${BASE}/${id}/ack`, json('PUT', { field: 'type', source: 'expected' }));
      for (let i = 0; i < 2; i++) {
        const res = await app.request(
          `${BASE}/${id}/ack`,
          json('DELETE', { field: 'type', source: 'expected' })
        );
        expect(res.status).toBe(200);
        expect(((await res.json()) as Any).divergences[0].acked).toBe(false);
      }
    });

    it('rejects accepting a missing or non-existent difference', async () => {
      const cat = insertCategory('servicios');
      const id = insertInvoice({ categoryId: cat, expectedId: insertExpected({}) });
      const missing = await app.request(
        `${BASE}/${id}/ack`,
        json('PUT', { field: 'category', source: 'expected' })
      );
      expect(missing.status).toBe(409);
      const none = await app.request(
        `${BASE}/${id}/ack`,
        json('PUT', { field: 'date', source: 'expected' })
      );
      expect(none.status).toBe(409);
      expect(
        (await app.request(`${BASE}/${id}/ack`, json('PUT', { field: 'nope', source: 'file' })))
          .status
      ).toBe(400);
    });
  });
});
