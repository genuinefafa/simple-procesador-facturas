/**
 * Client-side canonical filename generation.
 *
 * Mirrors the server logic in server/utils/file-naming.ts but works with
 * the data shapes available in the browser (string emitterName instead of
 * full Emitter object, no Node path module).
 *
 * Two formats:
 * - File:  yyyy-mm-dd Nombre_Emisor XX-XXXXXXXX-X TIPO PPPPP-NNNNNNNN [cat].ext
 * - Sheet: Nombre_Emisor XX-XXXXXXXX-X yyyy-mm-dd TIPO PPPPP-NNNNNNNN [cat].ext
 */

import { getFriendlyType } from '$lib/formatters';

export interface CanonicalFilenameParams {
  issueDate: string | null;
  emitterName: string | null;
  cuit: string | null;
  invoiceType: number | null;
  pointOfSale: number | null;
  invoiceNumber: number | null;
  categoryKey: string | null;
  fileExtension: string;
}

/**
 * Sanitize a string for use as a filename component.
 * Exact copy of server/utils/file-naming.ts sanitizeFilenameReadable.
 */
export function sanitizeFilenameReadable(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Format a CUIT (11 raw digits) into XX-XXXXXXXX-X with ASCII hyphens.
 * If already formatted with hyphens, returns as-is.
 */
export function formatCuitForFilename(cuit: string): string {
  const digits = cuit.replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
  }
  return cuit;
}

function validateParams(params: CanonicalFilenameParams): params is CanonicalFilenameParams & {
  issueDate: string;
  cuit: string;
  invoiceType: number;
  pointOfSale: number;
  invoiceNumber: number;
} {
  return (
    params.issueDate !== null &&
    params.cuit !== null &&
    params.invoiceType !== null &&
    params.pointOfSale !== null &&
    params.invoiceNumber !== null
  );
}

function buildParts(params: CanonicalFilenameParams) {
  if (!validateParams(params)) return null;

  const date = params.issueDate;
  const name = params.emitterName ? sanitizeFilenameReadable(params.emitterName) : 'Desconocido';
  const cuit = formatCuitForFilename(params.cuit);
  const type = getFriendlyType(params.invoiceType);
  const pv = String(params.pointOfSale).padStart(5, '0');
  const num = String(params.invoiceNumber).padStart(8, '0');
  const cat = params.categoryKey ? `[${params.categoryKey}]` : '[]';
  const ext = params.fileExtension || '.pdf';

  return { date, name, cuit, type, pv, num, cat, ext };
}

/**
 * Generate filename in "file" format (date first).
 * yyyy-mm-dd Nombre_Emisor CUIT TIPO PPPPP-NNNNNNNN [cat].ext
 */
export function generateFilenameForFile(params: CanonicalFilenameParams): string | null {
  const p = buildParts(params);
  if (!p) return null;
  return `${p.date} ${p.name} ${p.cuit} ${p.type} ${p.pv}-${p.num} ${p.cat}${p.ext}`;
}

/**
 * Generate filename in "sheet" format (emitter first, then date).
 * Nombre_Emisor CUIT yyyy-mm-dd TIPO PPPPP-NNNNNNNN [cat].ext
 */
export function generateFilenameForSheet(params: CanonicalFilenameParams): string | null {
  const p = buildParts(params);
  if (!p) return null;
  return `${p.name} ${p.cuit} ${p.date} ${p.type} ${p.pv}-${p.num} ${p.cat}${p.ext}`;
}
