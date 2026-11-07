/**
 * Issued invoices: parser, upsert, v_emitidas_oro and the import dispatch.
 *
 * Fictitious data only (CUITs from CLAUDE.md, invented amounts).
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getRawDb } from '../../database/db.js';
import { cleanupTestDb, runTestMigrations, resetTestDb } from '../../database/db-test.js';
import { IssuedInvoiceRepository } from '../../database/repositories/issued-invoice.js';
import {
  type IssuedImportResult,
  IssuedInvoiceImportService,
  parseIssuedWorksheet,
} from '../../services/issued-invoice-import.service.js';
import { app } from '../../http/app.js';

const HEADERS = [
  'Fecha',
  'Tipo',
  'Punto de Venta',
  'Número Desde',
  'Número Hasta',
  'Cód. Autorización',
  'Tipo Doc. Receptor',
  'Nro. Doc. Receptor',
  'Denominación Receptor',
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

type Row = {
  date?: string;
  type: string;
  pos?: number;
  number: number;
  doc?: string;
  name?: string;
  net: number;
  vat?: number;
  total: number;
};

/** Builds an ARCA-like sheet: repeated title row, headers, then data rows. */
function buildSheet(rows: Row[]): ExcelJS.Worksheet {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Emitidos');
  ws.addRow(HEADERS.map(() => 'Mis Comprobantes Emitidos - CUIT 30123456789'));
  ws.addRow(HEADERS);
  for (const r of rows) {
    const rate21 = r.vat ?? 0;
    ws.addRow([
      r.date ?? '15/03/2026',
      r.type,
      r.pos ?? 1,
      r.number,
      r.number,
      '70123456789012',
      '80',
      r.doc ?? '30123456789',
      r.name ?? 'CLIENTE DE PRUEBA SA',
      1,
      '$',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      rate21 || '',
      r.net,
      '',
      '',
      r.net,
      0,
      '',
      0,
      rate21,
      r.total,
    ]);
  }
  return ws;
}

async function writeXlsx(rows: Row[]): Promise<string> {
  const ws = buildSheet(rows);
  const dir = mkdtempSync(join(tmpdir(), 'issued-'));
  const file = join(dir, 'emitidos.xlsx');
  await ws.workbook.xlsx.writeFile(file);
  return file;
}

describe('parseIssuedWorksheet', () => {
  it('parses dd/mm/yyyy dates, ARCA type codes and breakdown amounts', () => {
    const { rows, errors } = parseIssuedWorksheet(
      buildSheet([
        {
          type: '201 - Factura de Crédito electrónica MiPyMEs (FCE) A',
          number: 7,
          net: 1000,
          vat: 210,
          total: 1210,
        },
        {
          type: '3 - Nota de Crédito A',
          number: 8,
          net: 100,
          vat: 21,
          total: 121,
          date: '02/01/2026',
        },
      ])
    );
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      issueDate: '2026-03-15',
      invoiceType: 201,
      pointOfSale: 1,
      invoiceNumber: 7,
      invoiceNumberTo: 7,
      receiverDocType: '80',
      receiverDocNumber: '30123456789',
      receiverName: 'CLIENTE DE PRUEBA SA',
      netTaxed21: 1000,
      vat21: 210,
      netTaxedTotal: 1000,
      vatTotal: 210,
      total: 1210,
    });
    expect(rows[1]).toMatchObject({ issueDate: '2026-01-02', invoiceType: 3 });
  });

  it('maps empty rate cells to null, like expected_invoices', () => {
    const { rows } = parseIssuedWorksheet(
      buildSheet([{ type: '1 - Factura A', number: 1, net: 1000, vat: 210, total: 1210 }])
    );
    expect(rows[0]!.netTaxed0).toBeNull();
    expect(rows[0]!.vat27).toBeNull();
    expect(rows[0]!.otherTaxes).toBe(0);
  });

  it('reports invalid rows without aborting the rest', () => {
    const { rows, errors } = parseIssuedWorksheet(
      buildSheet([
        { type: 'sin codigo', number: 1, net: 1, total: 1 },
        { type: '1 - Factura A', number: 2, net: 1, total: 1, date: 'ayer' },
        { type: '1 - Factura A', number: 3, net: 1, total: 1 },
      ])
    );
    expect(rows).toHaveLength(1);
    expect(errors.map((e) => e.row)).toEqual([3, 4]);
  });

  it('rejects a sheet that is not an issued export', () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('x');
    ws.addRow(['Fecha', 'Tipo', 'Denominación Emisor']);
    expect(() => parseIssuedWorksheet(ws)).toThrow();
  });
});

describe('issued invoices persistence', () => {
  const repo = new IssuedInvoiceRepository();

  beforeAll(async () => {
    // Fresh DB so the new migration is applied. TODO: See issue #193
    cleanupTestDb();
    await runTestMigrations();
  });

  beforeEach(() => {
    resetTestDb();
  });

  const importRows = (rows: Row[]): IssuedImportResult =>
    new IssuedInvoiceImportService().importWorksheet(buildSheet(rows), 'test.xlsx');

  it('creates, then reports unchanged, then updates when a field changes', () => {
    const base: Row = { type: '1 - Factura A', number: 10, net: 1000, vat: 210, total: 1210 };

    expect(importRows([base])).toMatchObject({ created: 1, updated: 0, unchanged: 0 });
    expect(importRows([base])).toMatchObject({ created: 0, updated: 0, unchanged: 1 });
    expect(importRows([{ ...base, name: 'OTRO NOMBRE SA' }])).toMatchObject({
      created: 0,
      updated: 1,
      unchanged: 0,
    });
    expect(repo.list()).toHaveLength(1);
    expect(repo.list()[0]!.receiverName).toBe('OTRO NOMBRE SA');
  });

  it('keys on type + point of sale + number', () => {
    const r = importRows([
      { type: '1 - Factura A', number: 1, net: 100, total: 100 },
      { type: '1 - Factura A', number: 1, pos: 2, net: 100, total: 100 },
      { type: '3 - Nota de Crédito A', number: 1, net: 100, total: 100 },
    ]);
    expect(r.created).toBe(3);
  });

  it('lists by date range', () => {
    importRows([
      { type: '1 - Factura A', number: 1, net: 1, total: 1, date: '10/01/2026' },
      { type: '1 - Factura A', number: 2, net: 1, total: 1, date: '10/03/2026' },
    ]);
    expect(repo.list({ from: '2026-02-01' }).map((i) => i.invoiceNumber)).toEqual([2]);
    expect(repo.list({ to: '2026-02-01' }).map((i) => i.invoiceNumber)).toEqual([1]);
  });

  it('v_emitidas_oro subtracts credit notes', () => {
    importRows([
      { type: '1 - Factura A', number: 1, net: 1000, vat: 210, total: 1210 },
      { type: '3 - Nota de Crédito A', number: 1, net: 100, vat: 21, total: 121 },
    ]);
    const row = getRawDb()
      .prepare(
        'SELECT issue_month, SUM(net) AS net, SUM(vat) AS vat, SUM(signed_total) AS total FROM v_emitidas_oro GROUP BY 1'
      )
      .get() as { issue_month: string; net: number; vat: number; total: number };
    expect(row).toEqual({ issue_month: '2026-03', net: 900, vat: 189, total: 1089 });
  });

  it('POST /api/expected-invoices/import dispatches issued files and GET lists them', async () => {
    const file = await writeXlsx([
      { type: '1 - Factura A', number: 1, net: 1000, vat: 210, total: 1210 },
    ]);
    const post = async (): Promise<unknown> => {
      const fd = new FormData();
      const { readFileSync } = await import('fs');
      fd.append('file', new File([readFileSync(file)], 'emitidos.xlsx'));
      const res = await app.request('/api/expected-invoices/import', { method: 'POST', body: fd });
      return res.json();
    };

    expect(await post()).toMatchObject({ kind: 'issued', created: 1, updated: 0, unchanged: 0 });
    expect(await post()).toMatchObject({ kind: 'issued', created: 0, unchanged: 1 });

    const list = await (await app.request('/api/issued-invoices?from=2026-01-01')).json();
    expect(list.count).toBe(1);
    const bad = await app.request('/api/issued-invoices?from=nope');
    expect(bad.status).toBe(400);
  });
});
