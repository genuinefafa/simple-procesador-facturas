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
import path from 'path';

/**
 * Tipos de documento (FAC = Factura, NCR = Nota de Crédito, NDB = Nota de Débito)
 */
export type DocumentKind = 'FAC' | 'NCR' | 'NDB';

/**
 * Genera el código del tipo de comprobante
 * Combina el tipo de documento (FAC, NCR, NDB) con la letra (A, B, C, etc.)
 *
 * @param kind - Tipo de documento (FAC, NCR, NDB)
 * @param invoiceType - Letra del comprobante (A, B, C, etc.)
 * @returns Código completo (FACA, NCRB, etc.)
 */
export function getDocumentTypeCode(kind: DocumentKind, invoiceType: InvoiceType): string {
  return `${kind}${invoiceType}`;
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
 * Compara el nombre del emisor con todos sus aliases y retorna el más corto
 *
 * @param emitter - Emisor
 * @returns Nombre más corto (sanitizado para usar en archivos)
 */
export function getShortestName(emitter: Emitter): string {
  const candidates = [emitter.name, ...emitter.aliases];

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
 * Genera el nombre de archivo procesado según el nuevo formato
 * Formato: yyyy-mm-dd Nombre_Emisor CUIT TIPO PV NUM.ext
 * Ejemplo: 2024-01-15 Mi_Empresa 30-12345678-9 FACA 00001 00000123.pdf
 *
 * @param issueDate - Fecha de emisión de la factura
 * @param emitter - Emisor de la factura
 * @param invoiceType - Tipo de comprobante (A, B, C, etc.)
 * @param pointOfSale - Punto de venta (se formateará con 5 dígitos)
 * @param invoiceNumber - Número de comprobante (se formateará con 8 dígitos)
 * @param originalFile - Archivo original (para obtener la extensión)
 * @param documentKind - Tipo de documento (FAC, NCR, NDB). Default: FAC
 * @returns Nombre de archivo procesado
 */
export function generateProcessedFilename(
  issueDate: Date,
  emitter: Emitter,
  invoiceType: InvoiceType,
  pointOfSale: number,
  invoiceNumber: number,
  originalFile: string,
  documentKind: DocumentKind = 'FAC'
): string {
  const dateFormatted = formatDateForFilename(issueDate);
  const emitterName = getShortestName(emitter);
  const typeCode = getDocumentTypeCode(documentKind, invoiceType);
  const pvFormatted = padNumber(pointOfSale, 5);
  const numFormatted = padNumber(invoiceNumber, 8);
  const extension = path.extname(originalFile);

  // Formato: yyyy-mm-dd Nombre_Emisor CUIT TIPO PV NUM.ext
  return `${dateFormatted} ${emitterName} ${emitter.cuit} ${typeCode} ${pvFormatted} ${numFormatted}${extension}`;
}

/**
 * Genera la ruta completa del archivo procesado (subdirectorio + nombre)
 *
 * @param baseDir - Directorio base de salida
 * @param issueDate - Fecha de emisión
 * @param emitter - Emisor
 * @param invoiceType - Tipo de comprobante
 * @param pointOfSale - Punto de venta
 * @param invoiceNumber - Número de comprobante
 * @param originalFile - Archivo original
 * @param documentKind - Tipo de documento (FAC, NCR, NDB)
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
  documentKind: DocumentKind = 'FAC'
): string {
  const subdir = generateSubdirectory(issueDate);
  const filename = generateProcessedFilename(
    issueDate,
    emitter,
    invoiceType,
    pointOfSale,
    invoiceNumber,
    originalFile,
    documentKind
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
