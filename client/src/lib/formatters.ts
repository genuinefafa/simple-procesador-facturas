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
 * Formatea una fecha a formato corto dd/mmm (sin año)
 * Ideal para tablas compactas
 * @param dateStr Fecha en formato ISO (YYYY-MM-DD)
 * @returns Fecha corta (ej: 15/dic)
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
    return `${d}/${months[monthIdx] || m}`;
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
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
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
 * Retorna ícono y etiqueta legible para tipos de comprobante
 * @param type Tipo de comprobante (ej: "Factura A", "Nota de Crédito")
 * @returns Objeto con {icon, label}
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
