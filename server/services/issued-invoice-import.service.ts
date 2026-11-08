/**
 * Import of ARCA "Mis Comprobantes Emitidos" Excel/CSV into issued_invoices.
 *
 * Same layout as "Recibidos" (repeated title row, then headers) except the
 * counterpart columns are "... Receptor" instead of "... Emisor".
 */

import ExcelJS from 'exceljs';
import path from 'path';
import {
  IssuedInvoiceRepository,
  type IssuedInvoiceInput,
} from '../database/repositories/issued-invoice.js';
import { parseAmount, type ExpectedTaxColumnKey } from '../utils/expected-tax-lines';
import { TAX_COLUMN_HEADERS, getCellStringValue, normalizeHeader } from './excel-import.service.js';

export interface IssuedImportResult {
  kind: 'issued';
  success: true;
  filename: string;
  totalRows: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: Array<{ row: number; error: string }>;
  /** Distinct 'YYYY' years of the imported rows, ascending. */
  periods: string[];
}

/** Normalized headers that identify an "Emitidos" file (counterpart = receiver). */
const ISSUED_MARKERS = ['denominacion receptor', 'nro doc receptor'];
/** Their presence means a "Recibidos" file, even if it also lists receiver columns. */
const RECEIVED_MARKERS = ['denominacion emisor', 'nro doc emisor'];

/** True when the headers belong to a "Mis Comprobantes Emitidos" export. */
export function isIssuedHeaders(headers: ReadonlyArray<string>): boolean {
  const normalized = new Set(headers.map(normalizeHeader));
  return (
    ISSUED_MARKERS.some((m) => normalized.has(m)) &&
    !RECEIVED_MARKERS.some((m) => normalized.has(m))
  );
}

/** Reads the header row, skipping the repeated title row ARCA puts on top. */
function readHeaders(worksheet: ExcelJS.Worksheet): { headers: string[]; headerRow: number } {
  const read = (n: number): string[] => {
    const headers: string[] = [];
    worksheet.getRow(n).eachCell((cell, col) => {
      headers[col - 1] = getCellStringValue(cell.value).trim();
    });
    return headers;
  };
  const first = read(1);
  const unique = new Set(first.filter((h) => h !== ''));
  return unique.size === 1 ? { headers: read(2), headerRow: 2 } : { headers: first, headerRow: 1 };
}

function parseDate(value: ExcelJS.CellValue): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const s = getCellStringValue(value).trim();
  if (!s) throw new Error('Fecha vacía o inválida');
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]!.padStart(2, '0')}-${dmy[1]!.padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  throw new Error(`Formato de fecha inválido: ${s}`);
}

function parseInvoiceType(value: ExcelJS.CellValue): number {
  const s = getCellStringValue(value).trim();
  const m = s.match(/^(\d{1,3})\s*(?:[-–]|$)/);
  if (!m) throw new Error(`No se pudo detectar el código de tipo de comprobante en: "${s}"`);
  return parseInt(m[1]!, 10);
}

function parseIntCell(value: ExcelJS.CellValue, label: string): number {
  const s = getCellStringValue(value).trim();
  const n = parseInt(s, 10);
  if (!/^\d+$/.test(s) || isNaN(n)) throw new Error(`${label} inválido: "${s}"`);
  return n;
}

function amountCell(value: ExcelJS.CellValue | undefined): number | null {
  return parseAmount(typeof value === 'number' ? value : getCellStringValue(value ?? null));
}

/** Parses the worksheet rows; invalid rows are reported, not thrown. */
export function parseIssuedWorksheet(worksheet: ExcelJS.Worksheet): {
  rows: IssuedInvoiceInput[];
  errors: Array<{ row: number; error: string }>;
} {
  const { headers, headerRow } = readHeaders(worksheet);
  if (!isIssuedHeaders(headers)) {
    throw new Error('El archivo no es un Excel de comprobantes emitidos');
  }

  const find = (name: string): string | undefined =>
    headers.find((h) => normalizeHeader(h) === normalizeHeader(name));
  const col = (name: string, required = false): string | undefined => {
    const h = find(name);
    if (!h && required) throw new Error(`Columna requerida no encontrada: "${name}"`);
    return h;
  };

  const cDate = col('Fecha', true)!;
  const cType = col('Tipo', true)!;
  const cPos = col('Punto de Venta', true)!;
  const cFrom = col('Número Desde', true)!;
  const cTo = col('Número Hasta');
  const cCae = col('Cód. Autorización');
  const cDocType = col('Tipo Doc. Receptor');
  const cDocNumber = col('Nro. Doc. Receptor');
  const cName = col('Denominación Receptor');
  const cCurrency = col('Moneda');
  const cTotal = col('Imp. Total');
  const taxCols: Array<[ExpectedTaxColumnKey, string]> = [];
  for (const [header, key] of TAX_COLUMN_HEADERS) {
    const h = find(header);
    if (h) taxCols.push([key, h]);
  }

  const rows: IssuedInvoiceInput[] = [];
  const errors: Array<{ row: number; error: string }> = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow) return;
    try {
      const data: Record<string, ExcelJS.CellValue> = {};
      row.eachCell((cell, colNumber) => {
        const h = headers[colNumber - 1];
        if (h) data[h] = cell.value;
      });

      const text = (h: string | undefined): string => (h ? getCellStringValue(data[h]).trim() : '');
      const toRaw = text(cTo);
      const caeRaw = text(cCae);

      const parsed: IssuedInvoiceInput = {
        issueDate: parseDate(data[cDate] ?? null),
        invoiceType: parseInvoiceType(data[cType] ?? null),
        pointOfSale: parseIntCell(data[cPos] ?? null, 'Punto de venta'),
        invoiceNumber: parseIntCell(data[cFrom] ?? null, 'Número'),
        invoiceNumberTo: toRaw ? parseIntCell(data[cTo!] ?? null, 'Número hasta') : null,
        cae: caeRaw && caeRaw !== '0' ? caeRaw : null,
        receiverDocType: text(cDocType) || null,
        receiverDocNumber: text(cDocNumber).replace(/\D/g, '') || null,
        receiverName: text(cName) || null,
        currency: text(cCurrency) || null,
        total: cTotal ? amountCell(data[cTotal]) : null,
      };
      // Every tax field is set (null when the export lacks the column), so a
      // reimport overwrites stale values instead of keeping them.
      for (const [, key] of TAX_COLUMN_HEADERS) {
        parsed[key] = null;
      }
      for (const [key, h] of taxCols) {
        parsed[key] = amountCell(data[h]);
      }
      rows.push(parsed);
    } catch (error) {
      errors.push({
        row: rowNumber,
        error: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  });

  return { rows, errors };
}

export class IssuedInvoiceImportService {
  private repo: IssuedInvoiceRepository;

  constructor(repo?: IssuedInvoiceRepository) {
    this.repo = repo ?? new IssuedInvoiceRepository();
  }

  /** Imports an already-loaded worksheet (the caller verified it is an issued file). */
  importWorksheet(worksheet: ExcelJS.Worksheet, filename: string): IssuedImportResult {
    const { rows, errors } = parseIssuedWorksheet(worksheet);
    const result = this.repo.upsertMany(rows);
    const years = new Set(rows.map((r) => r.issueDate.slice(0, 4)));
    return {
      kind: 'issued',
      success: true,
      filename,
      totalRows: rows.length + errors.length,
      ...result,
      errors,
      periods: [...years].sort(),
    };
  }

  /**
   * Imports the file only if it is an "Emitidos" export; returns null otherwise
   * so the caller can fall back to the received-invoices import.
   */
  async importIfIssued(filePath: string): Promise<IssuedImportResult | null> {
    const ext = path.extname(filePath).toLowerCase();
    const workbook = new ExcelJS.Workbook();
    if (ext === '.csv') {
      await workbook.csv.readFile(filePath);
    } else {
      await workbook.xlsx.readFile(filePath);
    }
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return null;
    if (!isIssuedHeaders(readHeaders(worksheet).headers)) return null;
    return this.importWorksheet(worksheet, path.basename(filePath));
  }
}
