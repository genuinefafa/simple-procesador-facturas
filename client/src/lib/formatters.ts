/**
 * Utilidades de formato para usar en toda la aplicación
 * Centraliza funciones comunes de formateo de fechas, números, CUIT, tipos de comprobante
 */

import {
  getDocumentTypeFromARCACode,
  getFriendlyType as arcaFriendlyType,
  getInvoiceSign as arcaInvoiceSign,
  type DocumentKind,
} from '@shared/arca';
import { FileText, Undo2, ArrowRight, CircleHelp } from '$lib/components/icons';

/**
 * Formatea un CUIT en el formato XX-XXXXXXXX-X
 * @param cuit CUIT a formatear (puede tener o no guiones)
 * @param fallback Valor alternativo si no hay CUIT
 * @returns CUIT formateado o guion
 */
export function formatCuit(cuit?: string | null, fallback?: string | null): string {
  const value = cuit || fallback || '';
  const digits = value.replace(/\D/g, '');
  // Usar guión de no separación (U+2011) para evitar cortes en dos líneas
  const NB_HYPHEN = '\u2011';
  if (digits.length === 11) {
    return `${digits.slice(0, 2)}${NB_HYPHEN}${digits.slice(2, 10)}${NB_HYPHEN}${digits.slice(10)}`;
  }
  return (value && value.replace(/-/g, NB_HYPHEN)) || '—';
}

/**
 * Formatea una fecha ISO (YYYY-MM-DD) a formato d-mes-aaaa
 * @param dateStr Fecha en formato ISO
 * @returns Fecha formateada (ej: 15-dic-2025)
 */
export function formatDateISO(dateStr?: string): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return dateStr;
  const months = [
    'ene',
    'feb',
    'mar',
    'abr',
    'may',
    'jun',
    'jul',
    'ago',
    'sep',
    'oct',
    'nov',
    'dic',
  ];
  const idx = Number(m) - 1;
  return `${d}-${months[idx] || m}-${y}`;
}

/**
 * Formatea una fecha a formato corto dd/mmm (sin año si es del año actual)
 * Ideal para tablas compactas
 * @param dateStr Fecha en formato ISO (YYYY-MM-DD) o DD-MM-YYYY o DD/MM/YYYY
 * @returns Fecha corta (ej: 15/dic o 15/dic/2024)
 */
export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const months = [
      'ene',
      'feb',
      'mar',
      'abr',
      'may',
      'jun',
      'jul',
      'ago',
      'sep',
      'oct',
      'nov',
      'dic',
    ];

    let year: string, month: string, day: string;

    // Detectar formato: YYYY-MM-DD, YYYY/MM/DD, DD-MM-YYYY, DD/MM/YYYY
    const isoMatch = dateStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    const dmyMatch = dateStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);

    if (isoMatch) {
      // YYYY-MM-DD o YYYY/MM/DD
      [, year, month, day] = isoMatch;
    } else if (dmyMatch) {
      // DD-MM-YYYY o DD/MM/YYYY
      [, day, month, year] = dmyMatch;
    } else {
      return dateStr;
    }

    const monthIdx = Number(month) - 1;
    const currentYear = new Date().getFullYear();
    const dateYear = Number(year);
    const dayPadded = day.padStart(2, '0');

    // Si es del año actual, no mostrar el año
    if (dateYear === currentYear) {
      return `${dayPadded}/${months[monthIdx] || month}`;
    }

    // Si es de otro año, mostrar dd/mmm/yyyy
    return `${dayPadded}/${months[monthIdx] || month}/${year}`;
  } catch {
    return dateStr;
  }
}

/**
 * Obtiene la fecha completa para mostrar en tooltips
 * @param dateStr Fecha en formato ISO (YYYY-MM-DD)
 * @returns Fecha larga localizada (ej: "15 de diciembre de 2025")
 */
export function getFullDateForTooltip(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    // Parsear como fecha local sin conversión de timezone
    const [y, m, d] = dateStr.split('-');
    if (!y || !m || !d) return dateStr;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return date.toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

/**
 * Formatea fecha y hora amigable en español (local AR)
 * Acepta Date o string ISO (YYYY-MM-DDTHH:mm:ss)
 */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  try {
    const date = typeof value === 'string' ? new Date(value) : value;
    if (!(date instanceof Date) || isNaN(date.getTime())) return String(value);
    const dd = String(date.getDate()).padStart(2, '0');
    const months = [
      'ene',
      'feb',
      'mar',
      'abr',
      'may',
      'jun',
      'jul',
      'ago',
      'sep',
      'oct',
      'nov',
      'dic',
    ];
    const mmm = months[date.getMonth()];
    const yyyy = String(date.getFullYear());
    const HH = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${dd}-${mmm}-${yyyy} ${HH}:${mm}`;
  } catch {
    return String(value);
  }
}

/**
 * Obtiene el tipo amigable (friendlyType) a partir de un código ARCA
 * @param arcaCode Código ARCA numérico (1, 6, 11, etc.)
 * @returns FriendlyType de 4 letras (FACA, FACB, etc.) o "UNKN" si no se encuentra
 */
export function getFriendlyType(arcaCode: number | null | undefined): string {
  return arcaFriendlyType(arcaCode) ?? 'UNKN';
}

/**
 * Obtiene el coeficiente de signo para un tipo de comprobante ARCA.
 * Usado para calcular balances correctamente.
 * @param arcaCode Código ARCA numérico (1, 6, 11, etc.)
 * @returns 1 para facturas/notas de débito, -1 para notas de crédito
 */
export function getInvoiceSign(arcaCode: number | null | undefined): 1 | -1 {
  return arcaInvoiceSign(arcaCode);
}

/** Icon component (lucide) per document kind. Purely visual, so it lives here. */
const DOCUMENT_KIND_ICONS: Record<DocumentKind, typeof FileText> = {
  FAC: FileText,
  NCR: Undo2,
  NDB: ArrowRight,
};

/**
 * Obtiene información completa del tipo de comprobante a partir del código ARCA
 * @param arcaCode Código ARCA numérico (1, 6, 11, etc.)
 * @returns Objeto con {friendlyType, icon (componente lucide), description}
 */
export function getInvoiceTypeFromARCA(arcaCode: number | null | undefined): {
  friendlyType: string;
  icon: typeof FileText;
  description: string;
} {
  const type =
    arcaCode === null || arcaCode === undefined ? undefined : getDocumentTypeFromARCACode(arcaCode);
  if (!type) return { friendlyType: 'UNKN', icon: CircleHelp, description: 'Desconocido' };
  return {
    friendlyType: type.friendlyType,
    icon: DOCUMENT_KIND_ICONS[type.documentKind],
    description: type.description,
  };
}

/**
 * Formatea un número como moneda argentina
 * @param value Número a formatear
 * @returns Número formateado con separadores de miles y 2 decimales
 */
export function formatNumber(value?: number | null): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Formatea un número como moneda con símbolo ($)
 * @param value Número a formatear
 * @returns Moneda formateada (ej: $1.234,56)
 */
export function formatCurrency(value?: number | null): string {
  if (value === null || value === undefined) return '—';
  // Sign before the symbol: -$1.234,56, not $-1.234,56
  return value < 0 ? `-$${formatNumber(-value)}` : `$${formatNumber(value)}`;
}

/**
 * Formatea el estado de un file a español
 * @param status Estado del file
 * @returns Estado traducido
 */
export function formatFileStatus(status?: 'uploaded' | 'processed' | null): string {
  const statusMap: Record<string, string> = {
    uploaded: 'Subido',
    processed: 'Procesado',
  };
  return status ? statusMap[status] || status : '—';
}

/**
 * Formatea el estado de un expected_invoice a español
 * @param status Estado del expected_invoice
 * @returns Estado traducido
 */
export function formatExpectedStatus(status?: 'pending' | 'matched' | null): string {
  const statusMap: Record<string, string> = {
    pending: 'Pendiente',
    matched: 'Coincide',
  };
  return status ? statusMap[status] || status : '—';
}

/**
 * Formatea el tipo de comprobante (kind) a español
 * @param kind Tipo de comprobante
 * @returns Tipo traducido
 */
export function formatComprobanteKind(kind?: 'factura' | 'expected' | 'file' | null): string {
  const kindMap: Record<string, string> = {
    factura: 'Factura',
    expected: 'Esperada',
    file: 'Archivo',
  };
  return kind ? kindMap[kind] || kind : '—';
}

/**
 * Obtiene clase CSS para el color de confianza
 * @param confidence Porcentaje de confianza (0-100)
 * @returns Clase CSS para aplicar color
 */
export function getConfidenceColorClass(confidence: number | null): string {
  if (!confidence) return 'text-gray-400';
  if (confidence >= 90) return 'text-green-600';
  if (confidence >= 70) return 'text-yellow-600';
  return 'text-red-600';
}

/**
 * Obtiene etiqueta legible para métodos de extracción
 * @param method Método de extracción (PDF_TEXT, OCR, TEMPLATE, MANUAL, etc)
 * @returns Etiqueta con ícono y nombre
 */
export function getExtractionMethodLabel(method: string | null): string {
  switch (method) {
    case 'PDF_TEXT':
      return '📄 PDF (texto)';
    case 'OCR':
      return '🔍 OCR (imagen)';
    case 'PDF_TEXT+OCR':
      return '📄🔍 PDF+OCR (fallback)';
    case 'TEMPLATE':
      return '📋 Template';
    case 'MANUAL':
      return '✏️ Manual';
    default:
      return '❓ Desconocido';
  }
}

/**
 * Formatea el número de comprobante con padding (0001-00000001)
 * @param pointOfSale Punto de venta
 * @param invoiceNumber Número de factura
 * @returns Número formateado con padding
 */
export function formatInvoiceNumber(
  pointOfSale: number | null | undefined,
  invoiceNumber: number | null | undefined
): string {
  if (pointOfSale == null && invoiceNumber == null) return '—';
  const pv = pointOfSale != null ? String(pointOfSale).padStart(4, '0') : '----';
  const num = invoiceNumber != null ? String(invoiceNumber).padStart(8, '0') : '--------';
  return `${pv}-${num}`;
}

/**
 * Formatea la etiqueta completa de un comprobante (FACA 0001-00000001)
 * Uso consistente en toda la UI para identificar comprobantes
 * @param invoiceType Código ARCA del tipo de comprobante
 * @param pointOfSale Punto de venta
 * @param invoiceNumber Número de factura
 * @returns Etiqueta completa formateada
 */
export function formatInvoiceLabel(
  invoiceType: number | null | undefined,
  pointOfSale: number | null | undefined,
  invoiceNumber: number | null | undefined
): string {
  const type = getFriendlyType(invoiceType);
  const number = formatInvoiceNumber(pointOfSale, invoiceNumber);
  return `${type} ${number}`;
}

/**
 * Formatea el nombre de un emisor para mostrar en UI
 * Retorna versión corta y completa para usar con tooltip
 * @param name Nombre del emisor (puede ser null/undefined)
 * @param maxLength Longitud máxima del nombre corto (default: 30)
 * @returns Objeto con {short, full} donde short tiene ellipsis si es muy largo
 */
export function formatEmitterName(
  name: string | null | undefined,
  maxLength: number = 30
): { short: string; full: string } {
  if (!name) return { short: '—', full: '' };
  const trimmed = name.trim();
  if (trimmed.length <= maxLength) {
    return { short: trimmed, full: trimmed };
  }
  return {
    short: trimmed.slice(0, maxLength) + '...',
    full: trimmed,
  };
}
