/**
 * POST /api/expected-invoices/:id/match and GET /:id/arca-breakdown.
 * Invoice + tax lines are created in one operation from ARCA data.
 *
 * Fictitious data only. Physical files live under a year no real invoice uses.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getRawDb } from '../../database/db.js';
import { cleanupTestDb, runTestMigrations, resetTestDb } from '../../database/db-test.js';
import { app } from '../../http/app.js';

const CUIT = '30123456781';
const DATA_DIR = join(import.meta.dirname, '..', '..', '..', 'data');
const INPUT_DIR = join(DATA_DIR, 'input', '__test_match_breakdown__');
const FINALIZED_DIR = join(DATA_DIR, 'finalized', '1999-04');
let nextId = 1;

function insertFile(): { id: number; path: string } {
  const n = nextId++;
  mkdirSync(INPUT_DIR, { recursive: true });
  const path = join(INPUT_DIR, `test-${n}.pdf`);
  writeFileSync(path, `pdf-${n}`);
  const id = Number(
    getRawDb()
      .prepare(
        `INSERT INTO files (original_filename, file_type, file_hash, storage_path, status)
         VALUES (?, 'pdf', ?, ?, 'uploaded')`
      )
      .run(`test-${n}.pdf`, `hash-${n}`, path).lastInsertRowid
  );
  return { id, path };
}

function insertExpected(cols: Record<string, number | null>, type = 1, total = 131): number {
  const names = Object.keys(cols);
  return Number(
    getRawDb()
      .prepare(
        `INSERT INTO expected_invoices
           (cuit, issue_date, invoice_type, point_of_sale, invoice_number, total, status${names.map((c) => `, ${c}`).join('')})
         VALUES (?, '1999-04-10', ?, 1, ?, ?, 'pending'${names.map(() => ', ?').join('')})`
      )
      .run(CUIT, type, nextId++, total, ...names.map((c) => cols[c])).lastInsertRowid
  );
}

const typeA = { net_taxed_21: 100, vat_21: 21, other_taxes: 10 };

const match = (expectedId: number, body: unknown): Promise<Response> =>
  app.request(`/api/expected-invoices/${expectedId}/match`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const iibb = (amount: number, label: string): object => ({
  concept: 'IIBB_PERCEPTION',
  rate: null,
  amount,
  label,
});

function taxLines(invoiceId: number): Array<Record<string, unknown>> {
  return getRawDb()
    .prepare(
      'SELECT concept, amount, label FROM invoice_tax_lines WHERE invoice_id = ? ORDER BY id'
    )
    .all(invoiceId) as Array<Record<string, unknown>>;
}

const invoiceCount = (): number =>
  (getRawDb().prepare('SELECT COUNT(*) AS n FROM facturas').get() as { n: number }).n;

describe('POST /api/expected-invoices/:id/match (breakdown)', () => {
  beforeAll(async () => {
    cleanupTestDb();
    await runTestMigrations();
  });

  beforeEach(() => {
    resetTestDb();
    nextId = 1;
    rmSync(FINALIZED_DIR, { recursive: true, force: true });
    getRawDb()
      .prepare('INSERT INTO emisores (cuit, nombre) VALUES (?, ?)')
      .run(CUIT, 'Emisor Test');
  });

  afterAll(() => {
    rmSync(INPUT_DIR, { recursive: true, force: true });
    rmSync(FINALIZED_DIR, { recursive: true, force: true });
  });

  it('creates the invoice and ARCA default tax lines', async () => {
    const expectedId = insertExpected(typeA);
    const file = insertFile();

    const res = await match(expectedId, { fileId: file.id });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      success: boolean;
      invoice: { id: number; filePath: string };
    };
    expect(body.success).toBe(true);
    expect(body.invoice.filePath).toMatch(/^finalized\/1999-04\//);
    expect(taxLines(body.invoice.id).map((l) => l.concept)).toEqual([
      'NET_TAXED',
      'VAT',
      'OTHER_TAXES',
    ]);
    expect(
      (
        getRawDb().prepare('SELECT status FROM expected_invoices WHERE id = ?').get(expectedId) as {
          status: string;
        }
      ).status
    ).toBe('matched');
  });

  it('accepts a custom split of other taxes', async () => {
    const expectedId = insertExpected(typeA);
    const file = insertFile();

    const res = await match(expectedId, {
      fileId: file.id,
      otherTaxLines: [iibb(6, 'Buenos Aires'), iibb(4, 'CABA')],
    });

    expect(res.status).toBe(201);
    const { invoice } = (await res.json()) as { invoice: { id: number } };
    const lines = taxLines(invoice.id);
    expect(lines.filter((l) => l.concept === 'IIBB_PERCEPTION').map((l) => l.label)).toEqual([
      'Buenos Aires',
      'CABA',
    ]);
  });

  it('rejects a sum mismatch (400) without creating anything', async () => {
    const expectedId = insertExpected(typeA);
    const file = insertFile();

    const res = await match(expectedId, {
      fileId: file.id,
      otherTaxLines: [iibb(6, 'Buenos Aires'), iibb(1, 'CABA')],
    });

    expect(res.status).toBe(400);
    expect(invoiceCount()).toBe(0);
    const row = getRawDb()
      .prepare('SELECT storage_path, status FROM files WHERE id = ?')
      .get(file.id) as { storage_path: string; status: string };
    expect(row.status).toBe('uploaded');
    expect(row.storage_path).toBe(file.path);
    expect(existsSync(FINALIZED_DIR)).toBe(false);
  });

  it('rejects a concept not allowed in other taxes (400)', async () => {
    const expectedId = insertExpected(typeA);
    const file = insertFile();

    const res = await match(expectedId, {
      fileId: file.id,
      otherTaxLines: [{ concept: 'VAT', rate: 21, amount: 10 }],
    });

    expect(res.status).toBe(400);
    expect(invoiceCount()).toBe(0);
  });

  it('returns 404 for unknown expected invoice', async () => {
    const file = insertFile();
    expect((await match(9999, { fileId: file.id })).status).toBe(404);
  });
});

describe('GET /api/expected-invoices/:id/arca-breakdown', () => {
  beforeAll(async () => {
    cleanupTestDb();
    await runTestMigrations();
  });

  beforeEach(() => {
    resetTestDb();
    nextId = 1;
  });

  it('returns the fixed lines and the default others', async () => {
    const expectedId = insertExpected(typeA);

    const res = await app.request(`/api/expected-invoices/${expectedId}/arca-breakdown`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      expectedId: number;
      total: number;
      invoiceType: number;
      currency: string;
      fixed: Array<{ concept: string }>;
      others: Array<{ concept: string; amount: number }>;
      arcaOtherTaxes: number;
    };
    expect(body.expectedId).toBe(expectedId);
    expect(body.total).toBe(131);
    expect(body.invoiceType).toBe(1);
    expect(body.fixed.map((l) => l.concept)).toEqual(['NET_TAXED', 'VAT']);
    expect(body.others).toEqual([{ concept: 'OTHER_TAXES', rate: null, amount: 10, label: null }]);
    expect(body.arcaOtherTaxes).toBe(10);
  });

  it('returns 404 when not found', async () => {
    expect((await app.request('/api/expected-invoices/9999/arca-breakdown')).status).toBe(404);
  });
});
