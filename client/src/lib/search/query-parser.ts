import { startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';

/**
 * Tipos de nodos de filtro soportados
 */
export type FilterNode =
  | { type: 'emisor'; value: string; negate: boolean }
  | {
      type: 'fecha';
      operator: 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'range';
      value: Date | DateRange;
      negate: boolean;
    }
  | { type: 'categoria'; value: string | null; negate: boolean }
  | { type: 'numero'; value: string; negate: boolean }
  | {
      type: 'total';
      operator: 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'range';
      value: number | AmountRange;
      negate: boolean;
    }
  | { type: 'tipo'; value: string; negate: boolean }
  | { type: 'freetext'; value: string; negate: boolean };

export type DateRange = { start: Date; end: Date };
export type AmountRange = { min: number; max: number };

export type ParseResult = {
  filters: FilterNode[];
  errors: string[];
};

/**
 * Parsea un query string de usuario y retorna filtros estructurados
 *
 * Sintaxis:
 * - emisor:acme → buscar por emisor
 * - fecha:>2024-01-01 → fecha mayor a
 * - !emisor:acme → NOT emisor
 * - categoria:sin → sin categoría
 * - numero:123 → número de comprobante
 */
export function parseSearchQuery(query: string): ParseResult {
  const filters: FilterNode[] = [];
  const errors: string[] = [];

  if (!query || query.trim() === '') {
    return { filters, errors };
  }

  const tokens = tokenize(query);

  for (const token of tokens) {
    try {
      const filter = parseToken(token);
      if (filter) {
        filters.push(filter);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return { filters, errors };
}

/**
 * Serializa array de filtros de vuelta a string de query
 */
export function serializeFilters(filters: FilterNode[]): string {
  return filters
    .map((f) => {
      const prefix = f.negate ? '!' : '';
      switch (f.type) {
        case 'emisor':
          return `${prefix}emisor:${f.value}`;
        case 'categoria':
          return `${prefix}categoria:${f.value === null ? 'sin' : f.value}`;
        case 'numero':
          return `${prefix}numero:${f.value}`;
        case 'tipo':
          return `${prefix}tipo:${f.value}`;
        case 'fecha':
          return `${prefix}fecha:${serializeDateFilter(f)}`;
        case 'total':
          return `${prefix}total:${serializeTotalFilter(f)}`;
        case 'freetext':
          return `${prefix}${f.value}`;
      }
    })
    .join(' ');
}

function serializeDateFilter(filter: FilterNode & { type: 'fecha' }): string {
  if (filter.operator === 'range' && typeof filter.value === 'object' && 'start' in filter.value) {
    const start = formatDateForSerialization(filter.value.start);
    const end = formatDateForSerialization(filter.value.end);
    return `${start}..${end}`;
  }
  if (filter.value instanceof Date) {
    const dateStr = formatDateForSerialization(filter.value);
    const op =
      filter.operator === 'eq'
        ? ''
        : filter.operator === 'gte' || filter.operator === 'gt'
          ? '>'
          : '<';
    return `${op}${dateStr}`;
  }
  return '';
}

function serializeTotalFilter(filter: FilterNode & { type: 'total' }): string {
  if (filter.operator === 'range' && typeof filter.value === 'object' && 'min' in filter.value) {
    return `${filter.value.min}..${filter.value.max}`;
  }
  if (typeof filter.value === 'number') {
    const op =
      filter.operator === 'eq'
        ? ''
        : filter.operator === 'gte' || filter.operator === 'gt'
          ? '>'
          : '<';
    return `${op}${filter.value}`;
  }
  return '';
}

function formatDateForSerialization(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Tokeniza el input dividiéndolo por espacios (simple split por ahora)
 */
function tokenize(query: string): string[] {
  // Split por espacios, eliminando tokens vacíos
  return query.split(/\s+/).filter((t) => t.length > 0);
}

/**
 * Parsea un token individual
 */
function parseToken(token: string): FilterNode | null {
  // Detectar prefijo NOT
  const negate = token.startsWith('!');
  const cleanToken = negate ? token.slice(1) : token;

  // Intentar match con campo:valor
  const match = cleanToken.match(/^(\w+):(.+)$/);

  if (!match) {
    // No tiene formato campo:valor → texto libre
    return {
      type: 'freetext',
      value: cleanToken,
      negate,
    };
  }

  const [, field, value] = match;
  const fieldLower = field.toLowerCase();

  switch (fieldLower) {
    case 'emisor':
      return {
        type: 'emisor',
        value,
        negate,
      };

    case 'fecha':
      return parseDateField(value, negate);

    case 'categoria':
      return parseCategoryField(value, negate);

    case 'numero':
      return {
        type: 'numero',
        value,
        negate,
      };

    case 'total':
      return parseTotalField(value, negate);

    case 'tipo':
      return {
        type: 'tipo',
        value: value.toUpperCase(),
        negate,
      };

    default:
      // Campo desconocido → tratar como texto libre
      return {
        type: 'freetext',
        value: token, // Incluir el campo: en la búsqueda
        negate,
      };
  }
}

/**
 * Parsea campo de fecha con operadores
 */
function parseDateField(value: string, negate: boolean): FilterNode {
  // Detectar operador
  let operator: 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'range' = 'eq';
  let dateValue = value;

  if (value.startsWith('>=')) {
    operator = 'gte';
    dateValue = value.slice(2);
  } else if (value.startsWith('<=')) {
    operator = 'lte';
    dateValue = value.slice(2);
  } else if (value.startsWith('>')) {
    operator = 'gt';
    dateValue = value.slice(1);
  } else if (value.startsWith('<')) {
    operator = 'lt';
    dateValue = value.slice(1);
  } else if (value.includes('..')) {
    // Range
    const [start, end] = value.split('..');
    const startDate = parseDate(start);
    const endDate = parseDate(end);

    if (!startDate || !endDate) {
      throw new Error(`Rango de fecha inválido: ${value}`);
    }

    return {
      type: 'fecha',
      operator: 'range',
      value: { start: startDate, end: endDate },
      negate,
    };
  }

  // Parsear fecha (puede ser YYYY-MM-DD, YYYY-MM, o YYYY)
  const parsedDate = parseDate(dateValue);
  if (!parsedDate) {
    throw new Error(`Fecha inválida: ${dateValue}`);
  }

  // Si es solo año o mes sin operador, expandir a rango
  if (operator === 'eq') {
    if (/^\d{4}$/.test(dateValue)) {
      // Solo año → rango de todo el año
      return {
        type: 'fecha',
        operator: 'range',
        value: {
          start: startOfYear(parsedDate),
          end: endOfYear(parsedDate),
        },
        negate,
      };
    } else if (/^\d{4}-\d{2}$/.test(dateValue)) {
      // Año-mes → rango de todo el mes
      return {
        type: 'fecha',
        operator: 'range',
        value: {
          start: startOfMonth(parsedDate),
          end: endOfMonth(parsedDate),
        },
        negate,
      };
    }
  }

  // Si hay operador y es año/mes parcial, usar inicio o fin según operador
  if (/^\d{4}$/.test(dateValue)) {
    // Año parcial con operador: >2024, <2024, >=2024, <=2024
    const targetDate =
      operator === 'gt' || operator === 'lte' ? endOfYear(parsedDate) : startOfYear(parsedDate);
    return {
      type: 'fecha',
      operator,
      value: targetDate,
      negate,
    };
  } else if (/^\d{4}-\d{2}$/.test(dateValue)) {
    // Mes parcial con operador: >2024-01, <2024-01, >=2024-01, <=2024-01
    const targetDate =
      operator === 'gt' || operator === 'lte' ? endOfMonth(parsedDate) : startOfMonth(parsedDate);
    return {
      type: 'fecha',
      operator,
      value: targetDate,
      negate,
    };
  }

  return {
    type: 'fecha',
    operator,
    value: parsedDate,
    negate,
  };
}

/**
 * Parsea campo de categoría
 */
function parseCategoryField(value: string, negate: boolean): FilterNode {
  const valueLower = value.toLowerCase();

  if (valueLower === 'sin' || valueLower === 'ninguna' || valueLower === 'null') {
    return {
      type: 'categoria',
      value: null,
      negate,
    };
  }

  return {
    type: 'categoria',
    value,
    negate,
  };
}

/**
 * Parsea campo de total (importe)
 */
function parseTotalField(value: string, negate: boolean): FilterNode {
  let operator: 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'range' = 'eq';
  let amountValue = value;

  if (value.startsWith('>=')) {
    operator = 'gte';
    amountValue = value.slice(2);
  } else if (value.startsWith('<=')) {
    operator = 'lte';
    amountValue = value.slice(2);
  } else if (value.startsWith('>')) {
    operator = 'gt';
    amountValue = value.slice(1);
  } else if (value.startsWith('<')) {
    operator = 'lt';
    amountValue = value.slice(1);
  } else if (value.includes('..')) {
    // Range
    const [min, max] = value.split('..');
    const minAmount = parseFloat(min);
    const maxAmount = parseFloat(max);

    if (isNaN(minAmount) || isNaN(maxAmount)) {
      throw new Error(`Rango de importe inválido: ${value}`);
    }

    return {
      type: 'total',
      operator: 'range',
      value: { min: minAmount, max: maxAmount },
      negate,
    };
  }

  const amount = parseFloat(amountValue);
  if (isNaN(amount)) {
    throw new Error(`Importe inválido: ${amountValue}`);
  }

  return {
    type: 'total',
    operator,
    value: amount,
    negate,
  };
}

/**
 * Parsea string de fecha en varios formatos
 * Soporta: YYYY-MM-DD, YYYY-MM, YYYY
 */
function parseDate(dateStr: string): Date | null {
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const date = new Date(dateStr + 'T00:00:00');
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // YYYY-MM
  if (/^\d{4}-\d{2}$/.test(dateStr)) {
    const date = new Date(dateStr + '-01T00:00:00');
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // YYYY
  if (/^\d{4}$/.test(dateStr)) {
    const date = new Date(`${dateStr}-01-01T00:00:00`);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}
