/**
 * Normaliza un valor de fecha a formato ISO date (YYYY-MM-DD).
 * Soporta: Date objects, ISO timestamps, DD-MM-YYYY, DD/MM/YYYY, y YYYY-MM-DD passthrough.
 */
export function normalizeToISO(value: Date | string | null | undefined): string | null {
  if (!value) return null;

  if (typeof value === 'string') {
    // Ya es ISO date (YYYY-MM-DD) → passthrough
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    // ISO timestamp → extraer solo la fecha
    if (value.includes('T')) return value.split('T')[0] ?? value;
    // DD-MM-YYYY o DD/MM/YYYY → YYYY-MM-DD
    const ddmmyyyy = value.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
    if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
    return value;
  }

  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return null;
}
