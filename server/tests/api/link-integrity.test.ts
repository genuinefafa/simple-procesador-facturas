/**
 * Link integrity between facturas, files and expected_invoices (#203).
 *
 * Fictitious data only. 30-12345678-1 follows the CLAUDE.md pattern with a
 * valid check digit (from-file validates it).
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { getRawDb } from '../../database/db.js';
import { cleanupTestDb, runTestMigrations, resetTestDb } from '../../database/db-test.js';
import { ExpectedInvoiceRepository } from '../../database/repositories/expected-invoice.js';
import { app } from '../../http/app.js';

// Stored without dashes, like emisores.cuit in the DB
const CUIT = '30123456781';
const CUIT_FORMATTED = '30-12345678-1';
let nextId = 1;

function insertFile(): number {
  const n = nextId++;
  return Number(
    getRawDb()
      .prepare(
        `INSERT INTO files (original_filename, file_type, file_hash, storage_path, status)
         VALUES (?, 'pdf', ?, ?, 'uploaded')`
      )
      .run(`test-${n}.pdf`, `hash-${n}`, `input/test-${n}.pdf`).lastInsertRowid
  );
}

function insertExpected(invoiceNumber: number): number {
  return Number(
    getRawDb()
      .prepare(
        `INSERT INTO expected_invoices
           (cuit, issue_date, invoice_type, point_of_sale, invoice_number, total, status)
         VALUES (?, '2026-03-10', 1, 1, ?, 121, 'pending')`
      )
      .run(CUIT, invoiceNumber).lastInsertRowid
  );
}

function insertInvoice(opts: {
  invoiceNumber: number;
  fileId?: number | null;
  expectedId?: number | null;
}): number {
  return Number(
    getRawDb()
      .prepare(
        `INSERT INTO facturas
           (emisor_cuit, fecha_emision, tipo_comprobante, punto_venta, numero_comprobante, total,
            file_id, expected_invoice_id)
         VALUES (?, '2026-03-10', 1, 1, ?, 121, ?, ?)`
      )
      .run(CUIT, opts.invoiceNumber, opts.fileId ?? null, opts.expectedId ?? null).lastInsertRowid
  );
}

function expectedStatus(id: number): string {
  return (
    getRawDb().prepare('SELECT status FROM expected_invoices WHERE id = ?').get(id) as {
      status: string;
    }
  ).status;
}

const send = (method: string, url: string, body: unknown): Promise<Response> =>
  app.request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const fromFile = (fileId: number, invoiceNumber: number, expectedId?: number): Promise<Response> =>
  send('POST', `/api/invoices/from-file/${fileId}`, {
    source: expectedId ? 'expected' : 'manual',
    expectedId,
    data: {
      cuit: CUIT_FORMATTED,
      invoiceType: 1,
      pointOfSale: 1,
      invoiceNumber,
      issueDate: '2026-03-10',
      total: 121,
    },
  });

describe('Link integrity (#203)', () => {
  beforeAll(async () => {
    // Fresh DB so the UNIQUE indexes migration is applied. TODO: See issue #193
    cleanupTestDb();
    await runTestMigrations();
  });

  beforeEach(() => {
    resetTestDb();
    nextId = 1;
    getRawDb()
      .prepare('INSERT INTO emisores (cuit, nombre) VALUES (?, ?)')
      .run(CUIT, 'Emisor Test');
  });

  describe('POST /api/invoices/from-file/:fileId', () => {
    it('rejects an invoice with the same emitter + type + POS + number (409)', async () => {
      insertInvoice({ invoiceNumber: 100, fileId: insertFile() });

      const res = await fromFile(insertFile(), 100);

      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/mismo emisor, tipo, punto de venta y número/);
    });

    it('rejects an expected invoice that already has an invoice (409)', async () => {
      const expectedId = insertExpected(200);
      insertInvoice({ invoiceNumber: 200, fileId: insertFile(), expectedId });

      // Different number so only the expected link conflicts
      const res = await fromFile(insertFile(), 201, expectedId);

      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/esperada ya está vinculada/);
    });

    it('rejects a file that already has an invoice (409)', async () => {
      const fileId = insertFile();
      insertInvoice({ invoiceNumber: 300, fileId });

      const res = await fromFile(fileId, 301);

      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/archivo ya está vinculado/);
    });
  });

  describe('PATCH /api/invoices/:id', () => {
    it('linking an expected invoice marks it matched', async () => {
      const expectedId = insertExpected(400);
      const invoiceId = insertInvoice({ invoiceNumber: 400, fileId: insertFile() });

      const res = await send('PATCH', `/api/invoices/${invoiceId}`, {
        expectedInvoiceId: expectedId,
      });

      expect(res.status).toBe(200);
      expect(expectedStatus(expectedId)).toBe('matched');
    });

    it('switching the expected invoice releases the previous one', async () => {
      const oldId = insertExpected(500);
      const newId = insertExpected(501);
      const invoiceId = insertInvoice({
        invoiceNumber: 500,
        fileId: insertFile(),
        expectedId: oldId,
      });
      getRawDb().prepare("UPDATE expected_invoices SET status = 'matched' WHERE id = ?").run(oldId);

      const res = await send('PATCH', `/api/invoices/${invoiceId}`, { expectedInvoiceId: newId });

      expect(res.status).toBe(200);
      expect(expectedStatus(newId)).toBe('matched');
      expect(expectedStatus(oldId)).toBe('pending');
    });

    it('unlinking (null) releases the expected invoice', async () => {
      const expectedId = insertExpected(600);
      const invoiceId = insertInvoice({ invoiceNumber: 600, fileId: insertFile(), expectedId });
      getRawDb()
        .prepare("UPDATE expected_invoices SET status = 'matched' WHERE id = ?")
        .run(expectedId);

      const res = await send('PATCH', `/api/invoices/${invoiceId}`, { expectedInvoiceId: null });

      expect(res.status).toBe(200);
      expect(expectedStatus(expectedId)).toBe('pending');
    });

    it('rejects an expected invoice already linked to another invoice (409)', async () => {
      const expectedId = insertExpected(700);
      insertInvoice({ invoiceNumber: 700, fileId: insertFile(), expectedId });
      const otherId = insertInvoice({ invoiceNumber: 701, fileId: insertFile() });

      const res = await send('PATCH', `/api/invoices/${otherId}`, {
        expectedInvoiceId: expectedId,
      });

      expect(res.status).toBe(409);
    });

    it('rejects changing the number to one that already exists (409)', async () => {
      insertInvoice({ invoiceNumber: 800, fileId: insertFile() });
      const otherId = insertInvoice({ invoiceNumber: 801, fileId: insertFile() });

      const res = await send('PATCH', `/api/invoices/${otherId}`, { invoiceNumber: 800 });

      expect(res.status).toBe(409);
    });

    it('re-sending the current expected invoice is not a conflict', async () => {
      const expectedId = insertExpected(900);
      const invoiceId = insertInvoice({ invoiceNumber: 900, fileId: insertFile(), expectedId });

      const res = await send('PATCH', `/api/invoices/${invoiceId}`, {
        expectedInvoiceId: expectedId,
        total: 150,
      });

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/expected-invoices/:id/match', () => {
    it('stores expectedInvoiceId on the created invoice', async () => {
      const expectedId = insertExpected(1000);
      const fileId = insertFile();

      const res = await send('POST', `/api/expected-invoices/${expectedId}/match`, {
        fileId,
        confirmed: true,
      });

      expect(res.status).toBe(200);
      const row = getRawDb()
        .prepare('SELECT expected_invoice_id FROM facturas WHERE file_id = ?')
        .get(fileId) as { expected_invoice_id: number };
      expect(row.expected_invoice_id).toBe(expectedId);
      expect(expectedStatus(expectedId)).toBe('matched');
    });

    it('rejects a file that already has an invoice (409)', async () => {
      const fileId = insertFile();
      insertInvoice({ invoiceNumber: 1100, fileId });
      const expectedId = insertExpected(1101);

      const res = await send('POST', `/api/expected-invoices/${expectedId}/match`, {
        fileId,
        confirmed: true,
      });

      expect(res.status).toBe(409);
    });
  });

  describe('UNIQUE indexes', () => {
    it('reject duplicates written directly to the DB', () => {
      const fileId = insertFile();
      const expectedId = insertExpected(1200);
      insertInvoice({ invoiceNumber: 1200, fileId, expectedId });

      expect(() => insertInvoice({ invoiceNumber: 1200 })).toThrow(/UNIQUE/);
      expect(() => insertInvoice({ invoiceNumber: 1201, fileId })).toThrow(/UNIQUE/);
      expect(() => insertInvoice({ invoiceNumber: 1202, expectedId })).toThrow(/UNIQUE/);
      expect(() => insertExpected(1200)).toThrow(/UNIQUE/);
    });

    it('allow many invoices without file or expected invoice', () => {
      insertInvoice({ invoiceNumber: 1300 });
      expect(() => insertInvoice({ invoiceNumber: 1301 })).not.toThrow();
    });
  });

  describe('ExpectedInvoiceRepository.computeStatus', () => {
    it('derives the status without writing it', async () => {
      const expectedId = insertExpected(1400);
      insertInvoice({ invoiceNumber: 1400, fileId: insertFile(), expectedId });

      const repo = new ExpectedInvoiceRepository();
      expect(await repo.computeStatus(expectedId)).toBe('matched');
      expect(expectedStatus(expectedId)).toBe('pending');

      await repo.refreshStatus(expectedId);
      expect(expectedStatus(expectedId)).toBe('matched');
    });
  });
});
