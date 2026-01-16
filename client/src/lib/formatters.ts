/**
 * Utilidades de formato para usar en toda la aplicación
 * Centraliza funciones comunes de formateo de fechas, números, CUIT, tipos de comprobante
 */

/**
 * Formatea un CUIT en el formato XX-XXXXXXXX-X
 * @param cuit CUIT a formatear (puede tener o no guiones)
 * @param fallback Valor alternativo si no hay CUIT
 * @returns CUIT formateado o guion
 */
export function formatCuit(cuit?: string, fallback?: string): string {
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
 * @param dateStr Fecha en formato ISO (YYYY-MM-DD)
 * @returns Fecha corta (ej: 15/dic o 15/dic/2024)
 */
export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    // Parsear directamente el string ISO sin conversión de timezone
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
    const monthIdx = Number(m) - 1;
    const currentYear = new Date().getFullYear();
    const dateYear = Number(y);

    // Si es del año actual, no mostrar el año
    if (dateYear === currentYear) {
      return `${d}/${months[monthIdx] || m}`;
    }

    // Si es de otro año, mostrar dd/mmm/yyyy
    return `${d}/${months[monthIdx] || m}/${y}`;
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
 * Mapeo de códigos ARCA a información de tipo de comprobante
 * Basado en los códigos numéricos oficiales de AFIP/ARCA
 */
const ARCA_CODE_MAP: Record<number, { friendlyType: string; icon: string; description: string }> = {
  1: { friendlyType: 'FACA', icon: '📄', description: 'Factura A' },
  6: { friendlyType: 'FACB', icon: '📋', description: 'Factura B' },
  11: { friendlyType: 'FACC', icon: '📑', description: 'Factura C' },
  19: { friendlyType: 'FACE', icon: '📄', description: 'Factura E' },
  51: { friendlyType: 'FACM', icon: '📄', description: 'Factura M' },
  3: { friendlyType: 'NCRA', icon: '↩️', description: 'Nota de Crédito A' },
  8: { friendlyType: 'NCRB', icon: '↩️', description: 'Nota de Crédito B' },
  13: { friendlyType: 'NCRC', icon: '↩️', description: 'Nota de Crédito C' },
  2: { friendlyType: 'NDBA', icon: '➡️', description: 'Nota de Débito A' },
  7: { friendlyType: 'NDBB', icon: '➡️', description: 'Nota de Débito B' },
  12: { friendlyType: 'NDBC', icon: '➡️', description: 'Nota de Débito C' },
};

/**
 * Obtiene el tipo amigable (friendlyType) a partir de un código ARCA
 * @param arcaCode Código ARCA numérico (1, 6, 11, etc.)
 * @returns FriendlyType de 4 letras (FACA, FACB, etc.) o "UNKN" si no se encuentra
 */
export function getFriendlyType(arcaCode: number | null | undefined): string {
  if (arcaCode === null || arcaCode === undefined) return 'UNKN';
  return ARCA_CODE_MAP[arcaCode]?.friendlyType || 'UNKN';
}

/**
 * Obtiene información completa del tipo de comprobante a partir del código ARCA
 * @param arcaCode Código ARCA numérico (1, 6, 11, etc.)
 * @returns Objeto con {friendlyType, icon, description}
 */
export function getInvoiceTypeFromARCA(arcaCode: number | null | undefined): {
  friendlyType: string;
  icon: string;
  description: string;
} {
  if (arcaCode === null || arcaCode === undefined) {
    return { friendlyType: 'UNKN', icon: '❓', description: 'Desconocido' };
  }
  return (
    ARCA_CODE_MAP[arcaCode] || { friendlyType: 'UNKN', icon: '❓', description: 'Desconocido' }
  );
}

/**
 * Retorna ícono y etiqueta legible para tipos de comprobante
 * @param type Tipo de comprobante (ej: "Factura A", "Nota de Crédito")
 * @returns Objeto con {icon, label}
 * @deprecated Usar getInvoiceTypeFromARCA con códigos numéricos ARCA
 */
export function getInvoiceTypeIcon(type: string | null | undefined): {
  icon: string;
  label: string;
} {
  if (!type) return { icon: '—', label: 'Desconocido' };
  const types: Record<string, { icon: string; label: string }> = {
    'Factura A': { icon: '📄', label: 'Factura A' },
    'Factura B': { icon: '📋', label: 'Factura B' },
    'Factura C': { icon: '📑', label: 'Factura C' },
    'Nota de Crédito': { icon: '↩️', label: 'Nota de Crédito' },
    'Nota de Débito': { icon: '➡️', label: 'Nota de Débito' },
    Recibo: { icon: '🧾', label: 'Recibo' },
  };
  return types[type] || { icon: '📄', label: type };
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
  return `$${formatNumber(value)}`;
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
export function formatExpectedStatus(
  status?: 'pending' | 'matched' | 'discrepancy' | 'manual' | 'ignored' | null
): string {
  const statusMap: Record<string, string> = {
    pending: 'Pendiente',
    matched: 'Coincide',
    discrepancy: 'Discrepancia',
    manual: 'Manual',
    ignored: 'Ignorado',
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
