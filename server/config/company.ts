/**
 * The app manages a single company. Its CUIT comes from the COMPANY_CUIT env
 * var and is used to reject ARCA exports ("Mis Comprobantes ...") that belong
 * to a different taxpayer.
 */

import ExcelJS from 'exceljs';
import path from 'path';
import { formatCUIT } from '@shared/validators/cuit';

const TITLE_CUIT_REGEX = /Mis Comprobantes (Emitidos|Recibidos) - CUIT (\d{11})/i;

/** Digits of the configured company CUIT, or null when unset/malformed (never throws). */
export function getCompanyCuit(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.COMPANY_CUIT;
  if (raw === undefined || raw.trim() === '') return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 11) {
    console.warn('COMPANY_CUIT must have 11 digits; ignoring it (CUIT check disabled)');
    return null;
  }
  return digits;
}

/** CUIT (11 digits) from the first non-empty cell of row 1, or null when there is no ARCA title. */
export function readTitleCuit(worksheet: ExcelJS.Worksheet): string | null {
  let title = '';
  worksheet.getRow(1).eachCell((cell) => {
    if (title) return;
    const v = cell.value;
    const text =
      typeof v === 'string'
        ? v
        : v && typeof v === 'object' && 'richText' in v
          ? v.richText.map((t) => t.text).join('')
          : '';
    if (text.trim()) title = text;
  });
  return title.match(TITLE_CUIT_REGEX)?.[2] ?? null;
}

export type CompanyCuitCheck = { ok: true } | { ok: false; error: string };

/** Compares the file's title CUIT with the configured one. Warns (and allows) when it cannot compare. */
export function checkCompanyCuit(
  fileCuit: string | null,
  companyCuit: string | null = getCompanyCuit()
): CompanyCuitCheck {
  if (!companyCuit) {
    console.warn('COMPANY_CUIT is not configured: skipping the CUIT check of the imported file');
    return { ok: true };
  }
  if (!fileCuit) {
    console.warn('The file has no "Mis Comprobantes ... - CUIT" title: skipping the CUIT check');
    return { ok: true };
  }
  if (fileCuit.replace(/\D/g, '') !== companyCuit) {
    return {
      ok: false,
      error: `El Excel es de la CUIT ${formatCUIT(fileCuit)} y la app está configurada para ${formatCUIT(companyCuit)}.`,
    };
  }
  return { ok: true };
}

/** Reads the file and checks its title CUIT. Must run before anything is written. */
export async function checkFileCompanyCuit(filePath: string): Promise<CompanyCuitCheck> {
  const workbook = new ExcelJS.Workbook();
  if (path.extname(filePath).toLowerCase() === '.csv') {
    await workbook.csv.readFile(filePath);
  } else {
    await workbook.xlsx.readFile(filePath);
  }
  const worksheet = workbook.worksheets[0];
  return checkCompanyCuit(worksheet ? readTitleCuit(worksheet) : null);
}
