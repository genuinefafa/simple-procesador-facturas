import type { FilterNode } from './query-parser';
import type { Comprobante } from '../../routes/api/comprobantes/+server';

type Category = {
  id: number;
  description: string;
};

/**
 * Crea una función matcher que evalúa si un comprobante pasa los filtros
 */
export function createFilterMatcher(categories: Category[]) {
  return function matchesFilter(c: Comprobante, filter: FilterNode): boolean {
    // Evaluar condición base según tipo de filtro
    const matches = evaluateFilterCondition(c, filter, categories);

    // Aplicar negación si corresponde
    return filter.negate ? !matches : matches;
  };
}

/**
 * Evalúa la condición base del filtro (sin considerar negación)
 */
function evaluateFilterCondition(
  c: Comprobante,
  filter: FilterNode,
  categories: Category[]
): boolean {
  switch (filter.type) {
    case 'emisor':
      return matchesEmisor(c, filter.value);

    case 'fecha':
      return matchesFecha(c, filter);

    case 'categoria':
      return matchesCategoria(c, filter.value, categories);

    case 'numero':
      return matchesNumero(c, filter.value);

    case 'total':
      return matchesTotal(c, filter);

    case 'tipo':
      return matchesTipo(c, filter.value);

    case 'freetext':
      return matchesFreeText(c, filter.value);

    default:
      return false;
  }
}

/**
 * Match por emisor (nombre o CUIT)
 */
function matchesEmisor(c: Comprobante, query: string): boolean {
  const queryLower = query.toLowerCase();

  // Nombre del emisor
  const emisorName = getEmitterName(c);
  const cuit = getCuit(c);

  if (emisorName && emisorName.toLowerCase().includes(queryLower)) {
    return true;
  }

  // CUIT (normalizado) - solo si el query tiene dígitos
  const normalizedQuery = normalizeCuit(query);
  if (cuit && normalizedQuery.length > 0 && normalizeCuit(cuit).includes(normalizedQuery)) {
    return true;
  }

  return false;
}

/**
 * Match por fecha
 */
function matchesFecha(c: Comprobante, filter: FilterNode & { type: 'fecha' }): boolean {
  const dateStr = getDate(c);
  if (!dateStr) return false;

  const compDate = new Date(dateStr + 'T00:00:00');
  if (isNaN(compDate.getTime())) return false;

  if (filter.operator === 'range' && typeof filter.value === 'object' && 'start' in filter.value) {
    const { start, end } = filter.value;
    return compDate >= start && compDate <= end;
  }

  if (filter.value instanceof Date) {
    const targetDate = filter.value;

    switch (filter.operator) {
      case 'eq':
        return isSameDay(compDate, targetDate);
      case 'gt':
      case 'gte':
        return compDate >= targetDate;
      case 'lt':
      case 'lte':
        return compDate <= targetDate;
      default:
        return false;
    }
  }

  return false;
}

/**
 * Match por categoría
 */
function matchesCategoria(c: Comprobante, value: string | null, categories: Category[]): boolean {
  const categoryId = c.final?.categoryId ?? null;

  // Match por "sin categoría"
  if (value === null) {
    return categoryId === null;
  }

  // Match por nombre de categoría
  const valueLower = value.toLowerCase();
  const category = categories.find((cat) => cat.description.toLowerCase().includes(valueLower));

  if (category) {
    return categoryId === category.id;
  }

  return false;
}

/**
 * Match por número de comprobante
 */
function matchesNumero(c: Comprobante, query: string): boolean {
  const queryLower = query.toLowerCase();

  // Factura final: formato tipo-puntoVenta-numero
  if (c.final) {
    const pos = c.final.pointOfSale != null ? String(c.final.pointOfSale).padStart(4, '0') : '----';
    const num =
      c.final.invoiceNumber != null ? String(c.final.invoiceNumber).padStart(8, '0') : '--------';
    const formatted = `${pos}-${num}`;
    if (formatted.toLowerCase().includes(queryLower)) {
      return true;
    }
  }

  // Expected: similar formato
  if (c.expected) {
    const pos = String(c.expected.pointOfSale).padStart(4, '0');
    const num = String(c.expected.invoiceNumber).padStart(8, '0');
    const formatted = `${pos}-${num}`;
    if (formatted.toLowerCase().includes(queryLower)) {
      return true;
    }
  }

  // Pending: nombre de archivo
  if (c.file) {
    if (c.file.originalFilename.toLowerCase().includes(queryLower)) {
      return true;
    }
  }

  return false;
}

/**
 * Match por total (importe)
 */
function matchesTotal(c: Comprobante, filter: FilterNode & { type: 'total' }): boolean {
  const total = getTotal(c);
  if (total == null) return false;

  if (filter.operator === 'range' && typeof filter.value === 'object' && 'min' in filter.value) {
    const { min, max } = filter.value;
    return total >= min && total <= max;
  }

  if (typeof filter.value === 'number') {
    const targetAmount = filter.value;

    switch (filter.operator) {
      case 'eq':
        return Math.abs(total - targetAmount) < 0.01; // Tolerancia para floats
      case 'gt':
      case 'gte':
        return total >= targetAmount;
      case 'lt':
      case 'lte':
        return total <= targetAmount;
      default:
        return false;
    }
  }

  return false;
}

/**
 * Match por tipo de comprobante
 */
function matchesTipo(c: Comprobante, query: string): boolean {
  const queryUpper = query.toUpperCase();

  // Mapeo de códigos ARCA a tipos amigables
  const tipoFinal = c.final?.invoiceType;
  if (tipoFinal != null) {
    const friendly = getFriendlyType(tipoFinal);
    if (friendly.toUpperCase().includes(queryUpper)) {
      return true;
    }
  }

  const tipoExpected = c.expected?.invoiceType;
  if (tipoExpected != null) {
    const friendly = getFriendlyType(tipoExpected);
    if (friendly.toUpperCase().includes(queryUpper)) {
      return true;
    }
  }

  return false;
}

/**
 * Match de texto libre (busca en múltiples campos)
 */
function matchesFreeText(c: Comprobante, query: string): boolean {
  const queryLower = query.toLowerCase();

  // Nombre de emisor
  const emisorName = getEmitterName(c);
  if (emisorName && emisorName.toLowerCase().includes(queryLower)) {
    return true;
  }

  // CUIT - solo si el query tiene dígitos
  const cuit = getCuit(c);
  const normalizedQuery = normalizeCuit(query);
  if (cuit && normalizedQuery.length > 0 && normalizeCuit(cuit).includes(normalizedQuery)) {
    return true;
  }

  // Número de comprobante
  if (matchesNumero(c, query)) {
    return true;
  }

  // Nombre de archivo (file)
  if (c.file && c.file.originalFilename.toLowerCase().includes(queryLower)) {
    return true;
  }

  return false;
}

// ============================================================================
// Helpers para extraer datos del modelo unificado Comprobante
// ============================================================================

function getEmitterName(c: Comprobante): string | null {
  return c.emitterName || c.final?.emitterName || c.expected?.emitterName || null;
}

function getCuit(c: Comprobante): string | null {
  return c.emitterCuit || c.final?.cuit || c.expected?.cuit || c.file?.extractedCuit || null;
}

function getDate(c: Comprobante): string | null {
  return c.final?.issueDate || c.expected?.issueDate || c.file?.extractedDate || null;
}

function getTotal(c: Comprobante): number | null {
  return c.final?.total ?? c.expected?.total ?? c.file?.extractedTotal ?? null;
}

/**
 * Normaliza CUIT quitando todo excepto dígitos
 */
function normalizeCuit(cuit: string): string {
  return cuit.replace(/\D/g, '');
}

/**
 * Compara si dos fechas son el mismo día
 */
function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/**
 * Convierte código ARCA numérico a tipo amigable
 * (Replicado del formatter, idealmente debería importarse)
 */
function getFriendlyType(arcaCode: number | null): string {
  if (arcaCode === null) return '';

  // Mapa de códigos ARCA a tipos legibles
  const typeMap: Record<number, string> = {
    1: 'FACA', // Factura A
    2: 'NDA', // Nota de débito A
    3: 'NCA', // Nota de crédito A
    6: 'FACB', // Factura B
    7: 'NDB', // Nota de débito B
    8: 'NCB', // Nota de crédito B
    11: 'FACC', // Factura C
    12: 'NDC', // Nota de débito C
    13: 'NCC', // Nota de crédito C
    51: 'FACM', // Factura M
    52: 'NDM', // Nota de débito M
    53: 'NCM', // Nota de crédito M
  };

  return typeMap[arcaCode] || `Tipo ${arcaCode}`;
}
