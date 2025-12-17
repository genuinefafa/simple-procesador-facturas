/**
 * Utilidades para generación de nombres de archivos procesados
 *
 * Formato de salida:
 * - Directorio: yyyy-mm (basado en fecha de emisión)
 * - Nombre: yyyy-mm-dd Nombre_Emisor CUIT TIPO PV NUM.ext
 *
 * Ejemplo: 2024-01/2024-01-15 Mi_Empresa 30-12345678-9 FACA 00001 00000123.pdf
 */

import type { Emitter, InvoiceType } from './types';
import { getFriendlyType } from './afip-codes.js';
import path from 'path';

/**
 * Tipos de documento (FAC = Factura, NCR = Nota de Crédito, NDB = Nota de Débito)
 */
export type DocumentKind = 'FAC' | 'NCR' | 'NDB';

/**
 * Genera el código del tipo de comprobante (friendlyType)
 * Usa el mapeo de códigos ARCA para obtener el tipo amigable de 4 letras
 *
 * @param arcaCode - Código ARCA numérico (1, 6, 11, etc.)
 * @returns Código amigable (FACA, FACB, FACC, NCRA, etc.) o "UNKN" si no se encuentra
 */
export function getDocumentTypeCode(arcaCode: InvoiceType): string {
  if (arcaCode === null || arcaCode === undefined) {
    return 'UNKN'; // Unknown type
  }
  return getFriendlyType(arcaCode) || 'UNKN';
}

/**
 * Infiere el tipo de documento basado en el contexto
 * Por defecto asume FAC (factura) si no se especifica
 *
 * @param invoiceType - Tipo de comprobante
 * @param isCredit - Si es nota de crédito
 * @param isDebit - Si es nota de débito
 * @returns Tipo de documento
 */
export function inferDocumentKind(
  _invoiceType: InvoiceType,
  isCredit: boolean = false,
  isDebit: boolean = false
): DocumentKind {
  if (isCredit) return 'NCR';
  if (isDebit) return 'NDB';
  return 'FAC';
}

/**
 * Obtiene el nombre más corto para usar en archivos
 * Compara nombre, razón social y aliases del emisor, retorna el más corto
 *
 * @param emitter - Emisor
 * @returns Nombre más corto (sanitizado para usar en archivos)
 */
export function getShortestName(emitter: Emitter): string {
  // Incluir nombre, razón social (legalName) y todos los aliases
  const candidates = [emitter.name];

  if (emitter.legalName) {
    candidates.push(emitter.legalName);
  }

  candidates.push(...emitter.aliases);

  // Encontrar el más corto
  const shortest = candidates.reduce((prev, current) =>
    current.length < prev.length ? current : prev
  );

  // Sanitizar para nombre de archivo (manteniendo legibilidad)
  return sanitizeFilenameReadable(shortest);
}

/**
 * Sanitiza un string para usarlo como nombre de archivo
 * Mantiene legibilidad usando guión bajo para espacios
 *
 * @param name - Nombre a sanitizar
 * @returns Nombre sanitizado
 */
export function sanitizeFilenameReadable(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Eliminar acentos
    .replace(/\s+/g, '_') // Espacios a guión bajo
    .replace(/[^a-zA-Z0-9_-]/g, '') // Solo alfanuméricos, guión bajo y guión
    .replace(/_+/g, '_') // Normalizar múltiples guiones bajos
    .replace(/^_|_$/g, ''); // Eliminar guiones bajos al inicio/fin
}

/**
 * Sanitiza un string para usarlo como nombre de archivo (versión legacy lowercase)
 * @deprecated Usar sanitizeFilenameReadable para nuevos archivos
 */
export function sanitizeFilename(name: string): string {
  return sanitizeFilenameReadable(name).toLowerCase();
}

/**
 * Formatea un número con ceros a la izquierda
 *
 * @param num - Número a formatear
 * @param width - Ancho total (cantidad de dígitos)
 * @returns String con ceros a la izquierda
 */
export function padNumber(num: number, width: number): string {
  return num.toString().padStart(width, '0');
}

/**
 * Formatea una fecha en formato YYYY-MM-DD
 *
 * @param date - Fecha a formatear
 * @returns String en formato YYYY-MM-DD
 */
export function formatDateForFilename(date: Date): string {
  const year = date.getFullYear();
  const month = padNumber(date.getMonth() + 1, 2);
  const day = padNumber(date.getDate(), 2);
  return `${year}-${month}-${day}`;
}

/**
 * Genera el nombre del subdirectorio basado en la fecha
 * Formato: yyyy-mm
 *
 * @param date - Fecha de emisión
 * @returns Nombre del subdirectorio (ej: "2024-01")
 */
export function generateSubdirectory(date: Date): string {
  const year = date.getFullYear();
  const month = padNumber(date.getMonth() + 1, 2);
  return `${year}-${month}`;
}

/**
 * Genera el nombre de archivo procesado según el nuevo formato con códigos ARCA
 * Formato: yyyy-mm-dd Nombre_Emisor CUIT TIPO PV-NUM [CATEGORIA].ext
 * Ejemplo: 2025-11-18 Movistar 30678814357 FACA 02468-00663200 [3f].pdf
 *
 * @param issueDate - Fecha de emisión de la factura
 * @param emitter - Emisor de la factura
 * @param invoiceType - Código ARCA del comprobante (1, 6, 11, etc.)
 * @param pointOfSale - Punto de venta (se formateará con 5 dígitos)
 * @param invoiceNumber - Número de comprobante (se formateará con 8 dígitos)
 * @param originalFile - Archivo original (para obtener la extensión)
 * @param categoryKey - Key de la categoría (opcional, ej: "3f", "sw", etc.)
 * @returns Nombre de archivo procesado
 */
export function generateProcessedFilename(
  issueDate: Date,
  emitter: Emitter,
  invoiceType: InvoiceType,
  pointOfSale: number,
  invoiceNumber: number,
  originalFile: string,
  categoryKey?: string | null
): string {
  const dateFormatted = formatDateForFilename(issueDate);
  const emitterName = getShortestName(emitter);
  const typeCode = getDocumentTypeCode(invoiceType);
  const pvFormatted = padNumber(pointOfSale, 5);
  const numFormatted = padNumber(invoiceNumber, 8);
  const extension = path.extname(originalFile);

  // Categoría: [key] si existe, [] si no
  const category = categoryKey ? `[${categoryKey}]` : '[]';

  // Formato: yyyy-mm-dd Nombre_Emisor CUIT TIPO PV-NUM [CATEGORIA].ext
  return `${dateFormatted} ${emitterName} ${emitter.cuit} ${typeCode} ${pvFormatted}-${numFormatted} ${category}${extension}`;
}

/**
 * Genera la ruta completa del archivo procesado (subdirectorio + nombre)
 *
 * @param baseDir - Directorio base de salida
 * @param issueDate - Fecha de emisión
 * @param emitter - Emisor
 * @param invoiceType - Código ARCA del comprobante
 * @param pointOfSale - Punto de venta
 * @param invoiceNumber - Número de comprobante
 * @param originalFile - Archivo original
 * @param categoryKey - Key de la categoría (opcional)
 * @returns Ruta completa: baseDir/yyyy-mm/nombre.ext
 */
export function generateProcessedPath(
  baseDir: string,
  issueDate: Date,
  emitter: Emitter,
  invoiceType: InvoiceType,
  pointOfSale: number,
  invoiceNumber: number,
  originalFile: string,
  categoryKey?: string | null
): string {
  const subdir = generateSubdirectory(issueDate);
  const filename = generateProcessedFilename(
    issueDate,
    emitter,
    invoiceType,
    pointOfSale,
    invoiceNumber,
    originalFile,
    categoryKey
  );

  return path.join(baseDir, subdir, filename);
}

// ============================================================================
// Funciones legacy para compatibilidad (deprecated)
// ============================================================================

/**
 * @deprecated Usar getDocumentTypeCode en su lugar
 */
export function getComprobanteCode(type: InvoiceType): string {
  return `FAC${type}`;
}
