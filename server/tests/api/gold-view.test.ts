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
    // ~300 inserts: one transaction keeps this under the default timeout on CI
    const ids = getRawDb().transaction(() =>
      codes.map((code) => insertInvoice({ type: code, total: 100 }))
    )();

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
      'undiscriminated',
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

    it('exposes undiscriminated separately from net_untaxed, signed on credit notes', () => {
      const inv = insertInvoice({ type: 6, total: 100 });
      insertTaxLine(inv, 'UNDISCRIMINATED', 100);
      const nc = insertInvoice({ type: 8, total: 40 });
      insertTaxLine(nc, 'UNDISCRIMINATED', 40);

      const [a, b] = goldRows();
      expect(a.undiscriminated).toBe(100);
      expect(a.net_untaxed).toBe(0);
      expect(b.undiscriminated).toBe(-40);
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

describe('StatsRepository.getTaxBreakdown', () => {
  beforeEach(() => {
    resetTestDb();
    nextNumber = 1;
    getRawDb()
      .prepare('INSERT INTO emisores (cuit, nombre) VALUES (?, ?)')
      .run(CUIT, 'Emisor Test');
  });

  it('with no breakdown loaded: empty byMonth, zero credit, coverage 0 of N', () => {
    insertInvoice({ type: 1, total: 100 });
    insertInvoice({ type: 51, total: 200, date: '2026-04-01' });
    insertInvoice({ type: 11, total: 300 }); // C: not part of coverage

    expect(new StatsRepository().getSummary(YEAR).taxBreakdown).toEqual({
      byMonth: [],
      vatCredit: 0,
      coverage: { withBreakdown: 0, total: 2 },
    });
  });

  it('mixes invoices and credit notes, groups by month and maps the series', () => {
    const inv = insertInvoice({ type: 1, total: 1210 + 30 + 40, date: '2026-03-10' });
    insertTaxLine(inv, 'NET_TAXED', 1000, 21);
    insertTaxLine(inv, 'VAT', 210, 21);
    insertTaxLine(inv, 'VAT_PERCEPTION', 10);
    insertTaxLine(inv, 'IIBB_PERCEPTION', 30);
    insertTaxLine(inv, 'OTHER_TAXES', 40);
    const nc = insertInvoice({ type: 3, total: 121, date: '2026-03-20' });
    insertTaxLine(nc, 'NET_TAXED', 100, 21);
    insertTaxLine(nc, 'VAT', 21, 21);
    const apr = insertInvoice({ type: 1, total: 110, date: '2026-04-05' });
    insertTaxLine(apr, 'NET_UNTAXED', 50);
    insertTaxLine(apr, 'EXEMPT', 50);
    insertTaxLine(apr, 'VAT', 10);
    insertInvoice({ type: 1, total: 999, date: '2026-04-06' }); // A without breakdown

    expect(new StatsRepository().getTaxBreakdown(YEAR)).toEqual({
      byMonth: [
        { month: '2026-03', net: 900, vat: 199, other: 70 },
        { month: '2026-04', net: 100, vat: 10, other: 0 },
      ],
      vatCredit: 209,
      coverage: { withBreakdown: 3, total: 4 },
    });
  });

  it('B invoice with breakdown appears by month but not in vatCredit nor coverage', () => {
    const b = insertInvoice({ type: 6, total: 121 });
    insertTaxLine(b, 'NET_TAXED', 100, 21);
    insertTaxLine(b, 'VAT', 21, 21);

    expect(new StatsRepository().getTaxBreakdown(YEAR)).toEqual({
      byMonth: [{ month: '2026-03', net: 100, vat: 21, other: 0 }],
      vatCredit: 0,
      coverage: { withBreakdown: 0, total: 0 },
    });
  });

  it('B invoice with UNDISCRIMINATED adds to net but not to vatCredit nor coverage', () => {
    const b = insertInvoice({ type: 6, total: 150 });
    insertTaxLine(b, 'UNDISCRIMINATED', 120);
    insertTaxLine(b, 'OTHER_TAXES', 30);

    expect(new StatsRepository().getTaxBreakdown(YEAR)).toEqual({
      byMonth: [{ month: '2026-03', net: 120, vat: 0, other: 30 }],
      vatCredit: 0,
      coverage: { withBreakdown: 0, total: 0 },
    });
  });

  it('excludes foreign currency and out-of-period invoices', () => {
    const usd = insertInvoice({ type: 1, total: 121, currency: 'USD' });
    insertTaxLine(usd, 'NET_TAXED', 100, 21);
    insertTaxLine(usd, 'VAT', 21, 21);
    const old = insertInvoice({ type: 1, total: 121, date: '2025-12-31' });
    insertTaxLine(old, 'NET_TAXED', 100, 21);
    insertTaxLine(old, 'VAT', 21, 21);

    expect(new StatsRepository().getTaxBreakdown(YEAR)).toEqual({
      byMonth: [],
      vatCredit: 0,
      coverage: { withBreakdown: 0, total: 0 },
    });
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

describe('StatsRepository.getIncomeVsExpenses', () => {
  const RECEIVER = '20-12345678-9';

  function insertIssued(opts: {
    type: number;
    date: string;
    net: number;
    vat: number;
    currency?: string | null;
  }): void {
    getRawDb()
      .prepare(
        `INSERT INTO issued_invoices
           (issue_date, invoice_type, point_of_sale, invoice_number, receiver_doc_number,
            currency, net_taxed_total, vat_total, total)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        opts.date,
        opts.type,
        nextNumber++,
        RECEIVER,
        opts.currency === undefined ? '$' : opts.currency,
        opts.net,
        opts.vat,
        opts.net + opts.vat
      );
  }

  beforeEach(() => {
    resetTestDb();
    nextNumber = 1;
    getRawDb()
      .prepare('INSERT INTO emisores (cuit, nombre) VALUES (?, ?)')
      .run(CUIT, 'Emisor Test');
  });

  it('empty period: no months, zero totals and coverage', () => {
    expect(new StatsRepository().getIncomeVsExpenses(YEAR)).toEqual({
      months: [],
      totals: {
        income: 0,
        expenses: 0,
        result: 0,
        vatDebit: 0,
        vatCredit: 0,
        vatPerception: 0,
        vatBalance: 0,
      },
      coverage: {
        issuedCount: 0,
        invoicesWithoutBreakdown: 0,
        invoicesWithoutBreakdownTotal: 0,
        invoicesWithoutBreakdownGross: 0,
        monthsWithIncomeWithoutExpenses: [],
        expectedNotLoaded: { count: 0, total: 0 },
        monthsWithExpectedNotLoaded: [],
      },
    });
  });

  it('subtracts issued and received credit notes, and splits VAT credit from perception', () => {
    insertIssued({ type: 1, date: '2026-03-05', net: 1000, vat: 210 });
    insertIssued({ type: 3, date: '2026-03-20', net: 100, vat: 21 }); // issued NC
    const a = insertInvoice({ type: 1, total: 1210 + 10, date: '2026-03-10' });
    insertTaxLine(a, 'NET_TAXED', 500, 21);
    insertTaxLine(a, 'VAT', 105, 21);
    insertTaxLine(a, 'VAT_PERCEPTION', 10);
    const nc = insertInvoice({ type: 3, total: 121, date: '2026-03-15' }); // received NC
    insertTaxLine(nc, 'NET_TAXED', 50, 21);
    insertTaxLine(nc, 'VAT', 10.5, 21);

    const r = new StatsRepository().getIncomeVsExpenses(YEAR);
    expect(r.months).toEqual([
      {
        month: '2026-03',
        income: 900,
        expenses: 450,
        vatDebit: 189,
        vatCredit: 94.5,
        vatPerception: 10,
        vatBalance: 84.5,
        expectedNotLoadedCount: 0,
        expectedNotLoadedTotal: 0,
      },
    ]);
    expect(r.totals).toEqual({
      income: 900,
      expenses: 450,
      result: 450,
      vatDebit: 189,
      vatCredit: 94.5,
      vatPerception: 10,
      vatBalance: 84.5,
    });
    expect(r.coverage.issuedCount).toBe(2);
    expect(r.coverage.monthsWithIncomeWithoutExpenses).toEqual([]);
  });

  it('B/C invoice adds to expenses via undiscriminated but not to the VAT credit', () => {
    const b = insertInvoice({ type: 6, total: 150, date: '2026-04-02' });
    insertTaxLine(b, 'UNDISCRIMINATED', 120);
    insertTaxLine(b, 'OTHER_TAXES', 30);
    const c = insertInvoice({ type: 11, total: 80, date: '2026-04-03' });
    insertTaxLine(c, 'UNDISCRIMINATED', 80);

    const r = new StatsRepository().getIncomeVsExpenses(YEAR);
    expect(r.months).toEqual([
      {
        month: '2026-04',
        income: 0,
        expenses: 200,
        vatDebit: 0,
        vatCredit: 0,
        vatPerception: 0,
        vatBalance: 0,
        expectedNotLoadedCount: 0,
        expectedNotLoadedTotal: 0,
      },
    ]);
  });

  it('reports invoices without breakdown as coverage and months with income but no expenses', () => {
    insertIssued({ type: 11, date: '2026-01-10', net: 300, vat: 0 });
    insertIssued({ type: 1, date: '2026-05-10', net: 700, vat: 147 });
    insertInvoice({ type: 1, total: 999, date: '2026-05-11' }); // loaded, no breakdown
    insertInvoice({ type: 3, total: 100, date: '2026-05-12' }); // NC without breakdown
    insertInvoice({ type: 1, total: 5, date: '2025-12-31' }); // out of period

    const r = new StatsRepository().getIncomeVsExpenses(YEAR);
    expect(r.totals.expenses).toBe(0);
    expect(r.totals.income).toBe(1000);
    expect(r.coverage).toEqual({
      issuedCount: 2,
      invoicesWithoutBreakdown: 2,
      invoicesWithoutBreakdownTotal: 899,
      invoicesWithoutBreakdownGross: 1099,
      monthsWithIncomeWithoutExpenses: ['2026-01'],
      expectedNotLoaded: { count: 0, total: 0 },
      monthsWithExpectedNotLoaded: [],
    });
  });

  it('reports ARCA expected invoices not loaded, by month and in total, like pendingExpected', () => {
    insertIssued({ type: 1, date: '2026-03-05', net: 1000, vat: 210 });
    // March has one loaded invoice, so it is not a "month without expenses"
    const loaded = insertInvoice({ type: 1, total: 121, date: '2026-03-10' });
    insertTaxLine(loaded, 'NET_TAXED', 100, 21);
    insertTaxLine(loaded, 'VAT', 21, 21);
    insertExpected({ type: 1, total: 500, date: '2026-03-02' });
    insertExpected({ type: 3, total: 100, date: '2026-03-03' }); // NC subtracts
    insertExpected({ type: 11, total: 40, date: '2026-04-01' });
    // Excluded by the pendingExpected criterion
    insertExpected({ type: 1, total: 999, date: '2026-03-04', status: 'matched' });
    const linked = insertExpected({ type: 1, total: 888, date: '2026-03-05' });
    insertInvoice({ type: 1, total: 888, date: '2026-03-06', expectedId: linked });
    insertExpected({ type: 1, total: 777, date: '2025-12-31' });

    const repo = new StatsRepository();
    const r = repo.getIncomeVsExpenses(YEAR);
    expect(r.coverage.monthsWithIncomeWithoutExpenses).toEqual([]);
    expect(r.coverage.expectedNotLoaded).toEqual({ count: 3, total: 440 });
    expect(r.coverage.expectedNotLoaded).toEqual(repo.getPendingExpected(YEAR));
    expect(r.coverage.monthsWithExpectedNotLoaded).toEqual(['2026-03', '2026-04']);
    expect(
      r.months.map((m) => [m.month, m.expectedNotLoadedCount, m.expectedNotLoadedTotal])
    ).toEqual([
      ['2026-03', 2, 400],
      ['2026-04', 1, 40],
    ]);
  });

  it('counts issued pesos ("$", null, ARS) and leaves out other currencies', () => {
    insertIssued({ type: 1, date: '2026-03-01', net: 100, vat: 21 });
    insertIssued({ type: 1, date: '2026-03-02', net: 200, vat: 42, currency: null });
    insertIssued({ type: 1, date: '2026-03-03', net: 400, vat: 84, currency: 'ARS' });
    insertIssued({ type: 1, date: '2026-03-04', net: 800, vat: 168, currency: 'USD' });

    const r = new StatsRepository().getIncomeVsExpenses(YEAR);
    expect(r.totals.income).toBe(700);
    expect(r.coverage.issuedCount).toBe(3);
  });

  it('rounds amounts to cents', () => {
    insertIssued({ type: 1, date: '2026-03-01', net: 0.1, vat: 0.02 });
    insertIssued({ type: 1, date: '2026-03-02', net: 0.2, vat: 0.01 });
    const r = new StatsRepository().getIncomeVsExpenses(YEAR);
    expect(r.months[0].income).toBe(0.3);
    expect(r.totals.income).toBe(0.3);
    expect(r.totals.vatDebit).toBe(0.03);
  });

  it('respects the period range', () => {
    insertIssued({ type: 1, date: '2025-12-31', net: 100, vat: 21 });
    insertIssued({ type: 1, date: '2026-01-01', net: 200, vat: 42 });
    expect(new StatsRepository().getIncomeVsExpenses(YEAR).totals.income).toBe(200);
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
    expect(body.taxBreakdown).toEqual({
      byMonth: [],
      vatCredit: 0,
      coverage: { withBreakdown: 0, total: 0 },
    });
    expect(body.incomeVsExpenses.months).toEqual([]);
    expect(body.incomeVsExpenses.coverage.issuedCount).toBe(0);
  });
});
