/**
 * Gold layer view (v_comprobantes_oro) + StatsRepository (#189).
 *
 * Fictitious data only (CUITs from CLAUDE.md).
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { getRawDb } from '../../database/db.js';
import { cleanupTestDb, runTestMigrations, resetTestDb } from '../../database/db-test.js';
import { StatsRepository } from '../../database/repositories/stats.js';
import { app } from '../../http/app.js';
import { periodToRange } from '../../contracts/stats.js';
import {
  AFIP_TYPES,
  getInvoiceLetter,
  getInvoiceSign,
  isVatRecoverable,
} from '../../utils/afip-codes.js';

const CUIT = '30-12345678-9';
const YEAR = periodToRange('2026');

let nextNumber = 1;

function insertCategory(key: string): number {
  return Number(
    getRawDb()
      .prepare('INSERT INTO categories (key, description) VALUES (?, ?)')
      .run(key, `Categoría ${key}`).lastInsertRowid
  );
}

function insertExpected(opts: {
  type: number;
  total: number;
  date?: string;
  status?: 'pending' | 'matched' | 'balanced';
  balancedWithId?: number;
}): number {
  return Number(
    getRawDb()
      .prepare(
        `INSERT INTO expected_invoices
           (cuit, issue_date, invoice_type, point_of_sale, invoice_number, total, status, balanced_with_id)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?)`
      )
      .run(
        CUIT,
        opts.date ?? '2026-03-10',
        opts.type,
        nextNumber++,
        opts.total,
        opts.status ?? 'pending',
        opts.balancedWithId ?? null
      ).lastInsertRowid
  );
}

function insertInvoice(opts: {
  type: number | null;
  total: number;
  date?: string;
  categoryId?: number;
  expectedId?: number;
  currency?: string;
}): number {
  return Number(
    getRawDb()
      .prepare(
        `INSERT INTO facturas
           (emisor_cuit, fecha_emision, tipo_comprobante, punto_venta, numero_comprobante, total, category_id, expected_invoice_id, moneda)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)`
      )
      .run(
        CUIT,
        opts.date ?? '2026-03-10',
        opts.type,
        nextNumber++,
        opts.total,
        opts.categoryId ?? null,
        opts.expectedId ?? null,
        opts.currency ?? 'ARS'
      ).lastInsertRowid
  );
}

interface GoldRow {
  invoice_id: number;
  issue_date: string;
  issue_month: string;
  letter: string;
  sign: number;
  signed_total: number;
  vat_recoverable: number;
  category_id: number | null;
  balance_group_id: number | null;
  has_tax_breakdown: number;
  net_taxed: number | null;
  net_untaxed: number | null;
  exempt: number | null;
  vat: number | null;
  vat_perception: number | null;
  iibb_perception: number | null;
  other_taxes: number | null;
}

function insertTaxLine(
  invoiceId: number,
  concept: string,
  amount: number,
  rate: number | null = null
): void {
  getRawDb()
    .prepare(
      'INSERT INTO invoice_tax_lines (invoice_id, concept, rate, amount) VALUES (?, ?, ?, ?)'
    )
    .run(invoiceId, concept, rate, amount);
}

function goldRows(): GoldRow[] {
  return getRawDb()
    .prepare('SELECT * FROM v_comprobantes_oro ORDER BY invoice_id')
    .all() as GoldRow[];
}

describe('v_comprobantes_oro', () => {
  beforeAll(async () => {
    // Start from a fresh test DB so the view migration is applied even when a
    // previous run left an older schema behind. TODO: See issue #193
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

  it('mirrors getInvoiceLetter/getInvoiceSign for every ARCA code', () => {
    const codes: Array<number | null> = [
      ...new Set([
        // Every code in the JSON plus the whole 0-300 range, so codes listed in
        // the SQL CASE but missing from the JSON are caught too.
        ...Object.values(AFIP_TYPES).map((t) => t.code),
        ...Array.from({ length: 301 }, (_, i) => i),
        9999,
      ]),
      null,
    ];
    const ids = codes.map((code) => insertInvoice({ type: code, total: 100 }));

    const byId = new Map(goldRows().map((r) => [r.invoice_id, r]));
    codes.forEach((code, i) => {
      const row = byId.get(ids[i])!;
      const letter = getInvoiceLetter(code);
      const sign = getInvoiceSign(code);
      expect({ code, letter: row.letter, sign: row.sign }).toEqual({ code, letter, sign });
      expect(row.signed_total).toBe(sign * 100);
      expect(row.vat_recoverable === 1).toBe(isVatRecoverable(letter));
    });
  });

  it('normalizes ISO timestamps in issue_date', () => {
    insertInvoice({ type: 11, total: 10, date: '2026-01-06T00:00:00.000Z' });
    const [row] = goldRows();
    expect(row.issue_date).toBe('2026-01-06');
    expect(row.issue_month).toBe('2026-01');
  });

  describe('tax breakdown columns', () => {
    const CONCEPT_COLUMNS = [
      'net_taxed',
      'net_untaxed',
      'exempt',
      'vat',
      'vat_perception',
      'iibb_perception',
      'other_taxes',
    ] as const;

    it('has NULLs and has_tax_breakdown = 0 for an invoice without lines', () => {
      insertInvoice({ type: 1, total: 100 });
      const [row] = goldRows();
      expect(row.has_tax_breakdown).toBe(0);
      for (const col of CONCEPT_COLUMNS) expect(row[col]).toBeNull();
    });

    it('sums lines per concept (several rates add up) and keeps 0 for absent concepts', () => {
      const id = insertInvoice({ type: 1, total: 1210 + 105 + 50 });
      insertTaxLine(id, 'NET_TAXED', 1000, 21);
      insertTaxLine(id, 'NET_TAXED', 100, 10.5);
      insertTaxLine(id, 'VAT', 210, 21);
      insertTaxLine(id, 'VAT', 10.5, 10.5);
      insertTaxLine(id, 'IIBB_PERCEPTION', 30);
      insertTaxLine(id, 'OTHER_TAXES', 20);

      const [row] = goldRows();
      expect(row.has_tax_breakdown).toBe(1);
      expect(row.net_taxed).toBe(1100);
      expect(row.net_untaxed).toBe(0);
      expect(row.exempt).toBe(0);
      expect(row.vat).toBe(220.5);
      expect(row.vat_perception).toBe(0);
      expect(row.iibb_perception).toBe(30);
      expect(row.other_taxes).toBe(20);
    });

    it('applies the sign: credit notes get negative values', () => {
      const id = insertInvoice({ type: 3, total: 121 });
      insertTaxLine(id, 'NET_TAXED', 100, 21);
      insertTaxLine(id, 'VAT', 21, 21);

      const [row] = goldRows();
      expect(row.has_tax_breakdown).toBe(1);
      expect(row.net_taxed).toBe(-100);
      expect(row.vat).toBe(-21);
      expect(row.exempt).toBe(0);
    });

    it('does not duplicate invoice rows when there are several lines', () => {
      const id = insertInvoice({ type: 1, total: 121 });
      insertTaxLine(id, 'NET_TAXED', 100, 21);
      insertTaxLine(id, 'VAT', 21, 21);
      expect(goldRows()).toHaveLength(1);
    });
  });

  it('keeps balance group secondaries so the group nets out', () => {
    const principal = insertExpected({ type: 6, total: 500, status: 'matched' });
    const secondary = insertExpected({
      type: 8,
      total: 500,
      status: 'matched',
      balancedWithId: principal,
    });
    insertInvoice({ type: 6, total: 500, expectedId: principal });
    insertInvoice({ type: 8, total: 500, expectedId: secondary });

    const rows = goldRows();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.balance_group_id)).toEqual([principal, principal]);
    expect(new StatsRepository().getTotals(YEAR).total).toBe(0);
  });
});

describe('StatsRepository.getSummary', () => {
  beforeEach(() => {
    resetTestDb();
    nextNumber = 1;
    getRawDb()
      .prepare('INSERT INTO emisores (cuit, nombre) VALUES (?, ?)')
      .run(CUIT, 'Emisor Test');
  });

  it('reads only invoices, signs credit notes and keeps the uncategorized bucket', () => {
    const catX = insertCategory('X');
    const catY = insertCategory('Y');

    // Invoice linked to an expected one
    const linked = insertExpected({ type: 1, total: 1000, status: 'matched' });
    insertInvoice({ type: 1, total: 1000, categoryId: catX, expectedId: linked });
    // Invoice without expected (not informed by ARCA)
    insertInvoice({ type: 11, total: 300, categoryId: catY, date: '2026-04-02' });
    // Credit note A, stored positive
    insertInvoice({ type: 3, total: 200, categoryId: catX, date: '2026-04-15' });
    // Uncategorized
    insertInvoice({ type: 6, total: 50 });
    // Foreign currency: left out of totals, counted apart
    insertInvoice({ type: 1, total: 5000, categoryId: catX, currency: 'USD' });
    // Out of period
    insertInvoice({ type: 1, total: 9999, categoryId: catX, date: '2025-12-31' });
    // Pending expected invoices: an invoice and a credit note, not in totals
    insertExpected({ type: 11, total: 700 });
    insertExpected({ type: 13, total: 100 });

    const summary = new StatsRepository().getSummary(YEAR);

    expect(summary.totals).toEqual({
      count: 4,
      total: 1150,
      vatRecoverableTotal: 800,
      foreignCurrencyCount: 1,
    });

    expect(summary.byCategory).toEqual([
      {
        categoryId: catX,
        categoryKey: 'X',
        categoryDescription: 'Categoría X',
        count: 2,
        total: 800,
      },
      {
        categoryId: catY,
        categoryKey: 'Y',
        categoryDescription: 'Categoría Y',
        count: 1,
        total: 300,
      },
      { categoryId: null, categoryKey: null, categoryDescription: null, count: 1, total: 50 },
    ]);

    expect(summary.byMonth).toEqual([
      { month: '2026-03', categoryId: catX, categoryKey: 'X', total: 1000 },
      { month: '2026-03', categoryId: null, categoryKey: null, total: 50 },
      { month: '2026-04', categoryId: catY, categoryKey: 'Y', total: 300 },
      { month: '2026-04', categoryId: catX, categoryKey: 'X', total: -200 },
    ]);

    expect(summary.byLetter).toEqual([
      { letter: 'A', vatRecoverable: true, count: 2, total: 800 },
      { letter: 'C', vatRecoverable: false, count: 1, total: 300 },
      { letter: 'B', vatRecoverable: false, count: 1, total: 50 },
    ]);

    expect(summary.pendingExpected).toEqual({ count: 2, total: 600 });
  });

  it('excludes pending expected invoices that already have an invoice', () => {
    const exp = insertExpected({ type: 11, total: 400 });
    insertInvoice({ type: 11, total: 400, expectedId: exp });

    expect(new StatsRepository().getPendingExpected(YEAR)).toEqual({ count: 0, total: 0 });
  });
});

describe('StatsRepository period boundaries', () => {
  beforeEach(() => {
    resetTestDb();
    nextNumber = 1;
    getRawDb()
      .prepare('INSERT INTO emisores (cuit, nombre) VALUES (?, ?)')
      .run(CUIT, 'Emisor Test');
  });

  it('includes the last day of the period and excludes the next one', () => {
    insertInvoice({ type: 11, total: 1, date: '2026-09-30' });
    insertInvoice({ type: 11, total: 10, date: '2026-10-01' });
    insertInvoice({ type: 11, total: 100, date: '2026-12-31T00:00:00.000Z' });
    insertInvoice({ type: 11, total: 1000, date: '2027-01-01' });

    const repo = new StatsRepository();
    expect(repo.getTotals(periodToRange('2026-09')).total).toBe(1);
    expect(repo.getTotals(periodToRange('2026-Q3')).total).toBe(1);
    expect(repo.getTotals(periodToRange('2026-Q4')).total).toBe(110);
    expect(repo.getTotals(periodToRange('2026')).total).toBe(111);
  });
});

describe('GET /api/stats/summary', () => {
  beforeEach(() => {
    resetTestDb();
  });

  it('returns 400 without a valid period', async () => {
    expect((await app.request('/api/stats/summary')).status).toBe(400);
    expect((await app.request('/api/stats/summary?period=2026-13')).status).toBe(400);
  });

  it('returns the period range and the summary', async () => {
    const res = await app.request('/api/stats/summary?period=2026-Q2');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.period).toEqual({ key: '2026-Q2', from: '2026-04-01', to: '2026-07-01' });
    expect(body.totals).toEqual({
      count: 0,
      total: 0,
      vatRecoverableTotal: 0,
      foreignCurrencyCount: 0,
    });
    expect(body).toHaveProperty('byCategory');
    expect(body).toHaveProperty('byMonth');
    expect(body).toHaveProperty('byLetter');
    expect(body.pendingExpected).toEqual({ count: 0, total: 0 });
  });
});
