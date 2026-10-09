/**
 * ARCA tax breakdown columns on expected_invoices (#129, bronze layer).
 *
 * The xlsx fixtures are generated here with fictitious data. CUITs follow CLAUDE.md but with a valid check digit (the importer validates it).
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import ExcelJS from 'exceljs';
import { mkdtempSync, rmSync } from 'fs';
import { readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { getRawDb } from '../../database/db.js';
import { cleanupTestDb, runTestMigrations, resetTestDb } from '../../database/db-test.js';
import { ExcelImportService, summarizeImportRows } from '../../services/excel-import.service.js';
import { ExpectedInvoiceRepository } from '../../database/repositories/expected-invoice.js';
import {
  expectedToTaxLines,
  parseAmount,
  type ExpectedTaxColumns,
} from '../../utils/expected-tax-lines.js';
import { app } from '../../http/app.js';

const RECEIVER = '20-12345678-6';

const ARCA_HEADERS = [
  'Fecha',
  'Tipo',
  'Punto de Venta',
  'Número Desde',
  'Número Hasta',
  'Cód. Autorización',
  'Tipo Doc. Emisor',
  'Nro. Doc. Emisor',
  'Denominación Emisor',
  'Tipo Doc. Receptor',
  'Nro. Doc. Receptor',
  'Tipo Cambio',
  'Moneda',
  'Neto Grav. IVA 0%',
  'IVA 2,5%',
  'Neto Grav. IVA 2,5%',
  'IVA 5%',
  'Neto Grav. IVA 5%',
  'IVA 10,5%',
  'Neto Grav. IVA 10,5%',
  'IVA 21%',
  'Neto Grav. IVA 21%',
  'IVA 27%',
  'Neto Grav. IVA 27%',
  'Neto Gravado Total',
  'Neto No Gravado',
  'Op. Exentas',
  'Otros Tributos',
  'Total IVA',
  'Imp. Total',
];

type Cell = string | number | null;

/** Builds a row keyed by header; missing headers stay empty. */
function arcaRow(values: Record<string, Cell>): Cell[] {
  return ARCA_HEADERS.map((h) => values[h] ?? null);
}

function baseRow(number: number, extra: Record<string, Cell> = {}): Cell[] {
  return arcaRow({
    Fecha: '10/03/2026',
    Tipo: '1 - Factura A',
    'Punto de Venta': 5,
    'Número Desde': number,
    'Número Hasta': number,
    'Cód. Autorización': '70123456789012',
    'Tipo Doc. Emisor': 80,
    'Nro. Doc. Emisor': '30123456781',
    'Denominación Emisor': 'EMISOR DE PRUEBA SA',
    'Tipo Doc. Receptor': 80,
    'Nro. Doc. Receptor': '20123456786',
    'Tipo Cambio': 1,
    Moneda: '$',
    ...extra,
  });
}

let tmpDir: string;
let fileCounter = 0;

async function writeXlsx(opts: {
  headers: string[];
  rows: Cell[][];
  withTitleRow?: boolean;
}): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Mis Comprobantes Recibidos');
  if (opts.withTitleRow) {
    // ARCA repeats the title in every cell of the first row
    ws.addRow(opts.headers.map(() => `Mis Comprobantes Recibidos - CUIT ${RECEIVER}`));
  }
  ws.addRow(opts.headers);
  for (const r of opts.rows) ws.addRow(r);
  const file = join(tmpDir, `arca-${++fileCounter}.xlsx`);
  await wb.xlsx.writeFile(file);
  return file;
}

const repo = new ExpectedInvoiceRepository();

function allExpected(): Array<Record<string, number | string | null>> {
  return getRawDb()
    .prepare('SELECT * FROM expected_invoices ORDER BY invoice_number')
    .all() as Array<Record<string, number | string | null>>;
}

describe('expected_invoices tax columns (#129)', () => {
  beforeAll(async () => {
    // Fresh test DB so the new migration is applied. TODO: See issue #193
    cleanupTestDb();
    await runTestMigrations();
    tmpDir = mkdtempSync(join(tmpdir(), 'arca-xlsx-'));
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    resetTestDb();
  });

  it('imports the breakdown from an ARCA Excel with a title row', async () => {
    const file = await writeXlsx({
      headers: ARCA_HEADERS,
      withTitleRow: true,
      rows: [
        baseRow(1, {
          'Neto Grav. IVA 21%': 1000,
          'IVA 21%': 210,
          'Neto Grav. IVA 10,5%': 200,
          'IVA 10,5%': 21,
          'Neto Gravado Total': 1200,
          'Neto No Gravado': 50,
          'Op. Exentas': 30,
          'Otros Tributos': 15.5,
          'Total IVA': 231,
          'Imp. Total': 1526.5,
        }),
      ],
    });

    const result = await new ExcelImportService().importFromFile(file);
    expect(result.errors).toEqual([]);
    expect(result.imported).toBe(1);

    const [row] = allExpected();
    expect(row).toMatchObject({
      cuit: '30123456781',
      total: 1526.5,
      net_taxed_21: 1000,
      vat_21: 210,
      net_taxed_10_5: 200,
      vat_10_5: 21,
      net_taxed_total: 1200,
      net_untaxed: 50,
      exempt: 30,
      other_taxes: 15.5,
      vat_total: 231,
      exchange_rate: 1,
    });
    // Columns that came empty are null, not 0
    expect(row?.net_taxed_0).toBeNull();
    expect(row?.vat_27).toBeNull();

    const found = await repo.findById(Number(row?.id));
    expect(found?.netTaxed21).toBe(1000);
    expect(found?.vat10_5).toBe(21);
    expect(found?.vat5).toBeNull();
  });

  it('imports an old-format Excel without breakdown columns (all null)', async () => {
    const oldHeaders = ARCA_HEADERS.filter(
      (h) => !/IVA|Neto|Exentas|Tributos|Cambio/.test(h) || h === 'Tipo Doc. Emisor'
    );
    expect(oldHeaders).not.toContain('IVA 21%');
    const file = await writeXlsx({
      headers: oldHeaders,
      withTitleRow: true,
      rows: [
        oldHeaders.map((h) => {
          const full = baseRow(2, { 'Imp. Total': 500 });
          return full[ARCA_HEADERS.indexOf(h)] ?? null;
        }),
      ],
    });

    const result = await new ExcelImportService().importFromFile(file);
    expect(result.errors).toEqual([]);
    expect(result.imported).toBe(1);

    const [row] = allExpected();
    expect(row?.total).toBe(500);
    for (const col of [
      'net_taxed_0',
      'net_taxed_21',
      'vat_21',
      'net_taxed_total',
      'net_untaxed',
      'exempt',
      'other_taxes',
      'vat_total',
      'exchange_rate',
    ]) {
      expect(row?.[col]).toBeNull();
    }
    expect(expectedToTaxLines(await repo.findById(Number(row?.id)))).toBeNull();
  });

  it('reimport fills the breakdown of an existing expected invoice without touching other fields', async () => {
    const oldHeaders = [
      'Fecha',
      'Tipo',
      'Punto de Venta',
      'Número Desde',
      'Nro. Doc. Emisor',
      'Imp. Total',
    ];
    const oldFile = await writeXlsx({
      headers: oldHeaders,
      rows: [['10/03/2026', '1 - Factura A', 5, 3, '30123456781', 1210]],
    });
    await new ExcelImportService().importFromFile(oldFile);

    const [before] = allExpected();
    const id = Number(before?.id);
    // Local edits that a reimport must not clobber
    getRawDb()
      .prepare("UPDATE expected_invoices SET notes = 'nota local', status = 'matched' WHERE id = ?")
      .run(id);
    expect(before?.net_taxed_21).toBeNull();

    const newFile = await writeXlsx({
      headers: ARCA_HEADERS,
      withTitleRow: true,
      rows: [
        baseRow(3, {
          'Cód. Autorización': null,
          'Neto Grav. IVA 21%': 1000,
          'IVA 21%': 210,
          'Neto Gravado Total': 1000,
          'Total IVA': 210,
          'Imp. Total': 1210,
        }),
      ],
    });
    const result = await new ExcelImportService().importFromFile(newFile);
    expect(result.imported).toBe(0);
    expect(result.updated).toBe(1);

    const rows = allExpected();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id,
      net_taxed_21: 1000,
      vat_21: 210,
      net_taxed_total: 1000,
      vat_total: 210,
      notes: 'nota local',
      status: 'matched',
      import_batch_id: before?.import_batch_id,
    });

    // Importing the same file again changes nothing
    const again = await new ExcelImportService().importFromFile(newFile);
    expect(again.updated).toBe(0);
    expect(again.unchanged).toBe(1);
  });

  it('reimport with an empty breakdown does not erase stored values', async () => {
    const full = await writeXlsx({
      headers: ARCA_HEADERS,
      rows: [baseRow(4, { 'Neto Grav. IVA 21%': 100, 'IVA 21%': 21, 'Imp. Total': 121 })],
    });
    await new ExcelImportService().importFromFile(full);
    const empty = await writeXlsx({
      headers: ARCA_HEADERS,
      rows: [baseRow(4, { 'Imp. Total': 121 })],
    });
    const result = await new ExcelImportService().importFromFile(empty);
    expect(result.updated).toBe(0);
    expect(allExpected()[0]).toMatchObject({ net_taxed_21: 100, vat_21: 21 });
  });

  it('parses amounts in Argentine text format and tolerant header spelling', async () => {
    const headers = [
      'FECHA',
      'tipo',
      'punto de venta',
      'numero desde',
      'Nro. Doc. Emisor',
      'Neto Grav.  IVA 21%',
      'iva 21%',
      'Neto Gravado Total',
      'Op Exentas',
      'Total IVA',
      'Imp Total',
    ];
    const file = await writeXlsx({
      headers,
      rows: [
        [
          '2026-03-10',
          '6 - Factura B',
          1,
          5,
          '23123456785',
          '1.234.567,89',
          '259.259,26',
          '1.234.567,89',
          '',
          '259.259,26',
          '1.493.827,15',
        ],
      ],
    });
    const result = await new ExcelImportService().importFromFile(file);
    expect(result.errors).toEqual([]);
    expect(allExpected()[0]).toMatchObject({
      net_taxed_21: 1234567.89,
      vat_21: 259259.26,
      net_taxed_total: 1234567.89,
      vat_total: 259259.26,
      total: 1493827.15,
    });
    expect(allExpected()[0]?.exempt).toBeNull();
  });

  it('parseAmount handles numbers, Argentine and plain text, and garbage', () => {
    expect(parseAmount(12.5)).toBe(12.5);
    expect(parseAmount('1.234,56')).toBe(1234.56);
    expect(parseAmount('1234.56')).toBe(1234.56);
    expect(parseAmount('-10,5')).toBe(-10.5);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('  ')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount(null)).toBeNull();
  });

  it('exposes the breakdown in GET /api/expected-invoices/:id', async () => {
    const file = await writeXlsx({
      headers: ARCA_HEADERS,
      rows: [baseRow(6, { 'Neto Grav. IVA 21%': 100, 'IVA 21%': 21, 'Imp. Total': 121 })],
    });
    await new ExcelImportService().importFromFile(file);
    const id = Number(allExpected()[0]?.id);

    const res = await app.request(`/api/expected-invoices/${id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      invoice: ExpectedTaxColumns & { id: number };
    };
    expect(body.invoice.netTaxed21).toBe(100);
    expect(body.invoice.vat21).toBe(21);
    expect(body.invoice.vat5).toBeNull();
  });
  it('reports withBreakdown and periods across two years', async () => {
    const file = await writeXlsx({
      headers: ARCA_HEADERS,
      rows: [
        baseRow(21, { 'Neto Grav. IVA 21%': 100, 'IVA 21%': 21, 'Imp. Total': 121 }),
        baseRow(22, { Fecha: '15/01/2025', 'IVA 21%': 0, 'Imp. Total': 50 }),
        baseRow(23, { Fecha: '20/06/2025', 'Imp. Total': 80 }),
      ],
    });
    const result = await new ExcelImportService().importFromFile(file);
    expect(result.errors).toEqual([]);
    expect(result.totalRows).toBe(3);
    expect(result.withBreakdown).toBe(2);
    expect(result.periods).toEqual(['2025', '2026']);
  });

  it('reports withBreakdown 0 for the old format', async () => {
    const oldHeaders = ARCA_HEADERS.filter(
      (h) => !/IVA|Neto|Exentas|Tributos|Cambio/.test(h) || h === 'Tipo Doc. Emisor'
    );
    const file = await writeXlsx({
      headers: oldHeaders,
      rows: [
        oldHeaders.map((h) => baseRow(24, { 'Imp. Total': 500 })[ARCA_HEADERS.indexOf(h)] ?? null),
      ],
    });
    const result = await new ExcelImportService().importFromFile(file);
    expect(result.imported).toBe(1);
    expect(result.withBreakdown).toBe(0);
    expect(result.periods).toEqual(['2026']);
  });

  it('summarizeImportRows handles empty input', () => {
    expect(summarizeImportRows([])).toEqual({ withBreakdown: 0, periods: [] });
  });

  it('returns withBreakdown and periods from POST /api/expected-invoices/import', async () => {
    const file = await writeXlsx({
      headers: ARCA_HEADERS,
      rows: [
        baseRow(25, { 'Neto Grav. IVA 21%': 100, 'IVA 21%': 21, 'Imp. Total': 121 }),
        baseRow(26, { Fecha: '01/02/2025', 'Imp. Total': 10 }),
      ],
    });
    const form = new FormData();
    form.append('file', new File([await readFile(file)], 'arca-test.xlsx'));
    const res = await app.request('/api/expected-invoices/import', {
      method: 'POST',
      body: form,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { withBreakdown: number; periods: string[] };
    expect(body.withBreakdown).toBe(1);
    expect(body.periods).toEqual(['2025', '2026']);
  });
});

describe('expectedToTaxLines', () => {
  const none: Partial<ExpectedTaxColumns> = {};

  it('returns null when there is no breakdown at all', () => {
    expect(expectedToTaxLines(none)).toBeNull();
    expect(expectedToTaxLines({ netTaxed21: null, vat21: null })).toBeNull();
    expect(expectedToTaxLines(null)).toBeNull();
    expect(expectedToTaxLines(undefined)).toBeNull();
  });

  it('maps columns to #190 concepts, omitting null and zero', () => {
    const lines = expectedToTaxLines({
      netTaxed0: 0,
      netTaxed10_5: 200,
      netTaxed21: 1000,
      vat10_5: 21,
      vat21: 210,
      vat27: null,
      netUntaxed: 50,
      exempt: 30,
      otherTaxes: 15.5,
      netTaxedTotal: 1200,
      vatTotal: 231,
      exchangeRate: 1,
    });
    expect(lines).toEqual([
      { concept: 'NET_TAXED', rate: 10.5, amount: 200 },
      { concept: 'NET_TAXED', rate: 21, amount: 1000 },
      { concept: 'NET_UNTAXED', rate: null, amount: 50 },
      { concept: 'EXEMPT', rate: null, amount: 30 },
      { concept: 'VAT', rate: 10.5, amount: 21 },
      { concept: 'VAT', rate: 21, amount: 210 },
      { concept: 'OTHER_TAXES', rate: null, amount: 15.5 },
    ]);
  });

  it('returns an empty list when the breakdown exists but every amount is zero', () => {
    expect(expectedToTaxLines({ netTaxed21: 0, vat21: 0 })).toEqual([]);
  });

  it('keeps amounts positive', () => {
    expect(expectedToTaxLines({ netTaxed21: -100 })).toEqual([
      { concept: 'NET_TAXED', rate: 21, amount: 100 },
    ]);
  });
});
