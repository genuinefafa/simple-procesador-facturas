/**
 * Utilidades para generación de nombres de archivos procesados
 */

import type { Emitter, InvoiceType } from './types';
import path from 'path';

/**
 * Mapeo de tipos de comprobante a código corto argentino
 */
const COMPROBANTE_CODES: Record<string, string> = {
  // Facturas
  A: 'faca',
  B: 'facb',
  C: 'facc',
  E: 'face',
  M: 'facm',
  // Notas de Crédito (asumiendo que el tipo completo incluiría un prefijo)
  // Por ahora solo facturas, se expandirá con más tipos
};

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

  // Sanitizar para nombre de archivo
  return sanitizeFilename(shortest);
}

/**
 * Sanitiza un string para usarlo como nombre de archivo
 * - Convierte a minúsculas
 * - Reemplaza espacios por guión bajo
 * - Elimina caracteres especiales
 * - Normaliza caracteres acentuados
 *
 * @param name - Nombre a sanitizar
 * @returns Nombre sanitizado
 */
export function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Eliminar acentos
    .replace(/\s+/g, '_') // Espacios a guión bajo
    .replace(/[^a-z0-9_-]/g, '') // Solo alfanuméricos, guión bajo y guión
    .replace(/_+/g, '_') // Normalizar múltiples guiones bajos
    .replace(/^_|_$/g, ''); // Eliminar guiones bajos al inicio/fin
}

/**
 * Genera el código corto del tipo de comprobante
 *
 * @param type - Tipo de comprobante (A, B, C, etc.)
 * @returns Código corto (faca, facb, facc, etc.)
 */
export function getComprobanteCode(type: InvoiceType): string {
  return COMPROBANTE_CODES[type] || `fac${type.toLowerCase()}`;
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
 * Genera el nombre de archivo procesado según el formato estándar argentino
 * Formato: {alias_corto}_{tipo}_{punto_venta}_{numero}.{ext}
 * Ejemplo: andereggen_faca_00003_00003668.pdf
 *
 * @param emitter - Emisor de la factura
 * @param invoiceType - Tipo de comprobante (A, B, C, etc.)
 * @param pointOfSale - Punto de venta (se formateará con 5 dígitos)
 * @param invoiceNumber - Número de comprobante (se formateará con 8 dígitos)
 * @param originalFile - Archivo original (para obtener la extensión)
 * @returns Nombre de archivo procesado
 */
export function generateProcessedFilename(
  emitter: Emitter,
  invoiceType: InvoiceType,
  pointOfSale: number,
  invoiceNumber: number,
  originalFile: string
): string {
  const shortName = getShortestName(emitter);
  const typeCode = getComprobanteCode(invoiceType);
  const pvFormatted = padNumber(pointOfSale, 5);
  const numFormatted = padNumber(invoiceNumber, 8);
  const extension = path.extname(originalFile);

  return `${shortName}_${typeCode}_${pvFormatted}_${numFormatted}${extension}`;
}
