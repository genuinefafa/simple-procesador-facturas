/**
 * COMPANY_CUIT guard on POST /api/expected-invoices/import (issued and received).
 * Fictitious CUITs only.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import ExcelJS from 'exceljs';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getRawDb } from '../../database/db.js';
import { cleanupTestDb, runTestMigrations, resetTestDb } from '../../database/db-test.js';
import { checkCompanyCuit, getCompanyCuit } from '../../config/company.js';
import { app } from '../../http/app.js';

const OWN = '30123456789';
const OTHER = '20123456789';

const ISSUED_HEADERS = [
  'Fecha',
  'Tipo',
  'Punto de Venta',
  'Número Desde',
  'Nro. Doc. Receptor',
  'Denominación Receptor',
  'Imp. Total',
];
const RECEIVED_HEADERS = [
  'Fecha',
  'Tipo',
  'Punto de Venta',
  'Número Desde',
  'Nro. Doc. Emisor',
  'Denominación Emisor',
  'Imp. Total',
];
const ROW = ['10/03/2026', '1 - Factura A', 5, 1, '30123456781', 'CONTRAPARTE DE PRUEBA SA', 1210];

async function post(
  kind: 'Emitidos' | 'Recibidos',
  titleCuit: string | null
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers = kind === 'Emitidos' ? ISSUED_HEADERS : RECEIVED_HEADERS;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('x');
  if (titleCuit) {
    ws.addRow(headers.map(() => `Mis Comprobantes ${kind} - CUIT ${titleCuit}`));
  }
  ws.addRow(headers);
  ws.addRow(ROW);
  const file = join(mkdtempSync(join(tmpdir(), 'cuit-')), 'f.xlsx');
  await wb.xlsx.writeFile(file);
  const { readFileSync } = await import('fs');
  const fd = new FormData();
  fd.append('file', new File([readFileSync(file)], 'f.xlsx'));
  const res = await app.request('/api/expected-invoices/import', { method: 'POST', body: fd });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

function counts(): Record<string, number> {
  const db = getRawDb();
  const n = (t: string): number =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
  return {
    issued: n('issued_invoices'),
    expected: n('expected_invoices'),
    emitters: n('emisores'),
    batches: n('import_batches'),
  };
}

describe('getCompanyCuit / checkCompanyCuit', () => {
  it('normalizes dashes and ignores unset or malformed values without throwing', () => {
    expect(getCompanyCuit({ COMPANY_CUIT: '30-12345678-9' })).toBe(OWN);
    expect(getCompanyCuit({})).toBeNull();
    expect(getCompanyCuit({ COMPANY_CUIT: '1234' })).toBeNull();
  });

  it('builds a message with both formatted CUITs', () => {
    expect(checkCompanyCuit(OTHER, OWN)).toEqual({
      ok: false,
      error: 'El Excel es de la CUIT 20-12345678-9 y la app está configurada para 30-12345678-9.',
    });
    expect(checkCompanyCuit(OWN, OWN)).toEqual({ ok: true });
    expect(checkCompanyCuit(null, OWN)).toEqual({ ok: true });
    expect(checkCompanyCuit(OTHER, null)).toEqual({ ok: true });
  });
});

describe('import CUIT guard', () => {
  beforeAll(async () => {
    cleanupTestDb();
    await runTestMigrations();
  });
  beforeEach(() => {
    resetTestDb();
    process.env.COMPANY_CUIT = '30-12345678-9';
  });
  afterEach(() => {
    delete process.env.COMPANY_CUIT;
  });

  it('imports issued and received files of the company CUIT', async () => {
    expect((await post('Emitidos', OWN)).status).toBe(200);
    expect((await post('Recibidos', OWN)).status).toBe(200);
  });

  for (const kind of ['Emitidos', 'Recibidos'] as const) {
    it(`rejects ${kind} of another CUIT with 400 and writes nothing`, async () => {
      const before = counts();
      const { status, body } = await post(kind, OTHER);
      expect(status).toBe(400);
      expect(body.error).toBe(
        'El Excel es de la CUIT 20-12345678-9 y la app está configurada para 30-12345678-9.'
      );
      expect(counts()).toEqual(before);
    });

    it(`imports ${kind} without a title row`, async () => {
      expect((await post(kind, null)).status).toBe(200);
    });

    it(`imports ${kind} of any CUIT when COMPANY_CUIT is not set`, async () => {
      delete process.env.COMPANY_CUIT;
      expect((await post(kind, OTHER)).status).toBe(200);
    });
  }
});
