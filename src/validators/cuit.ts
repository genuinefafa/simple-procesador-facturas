/**
 * Validador de CUIT argentino usando el algoritmo Módulo 11
 *
 * El CUIT (Clave Única de Identificación Tributaria) es un número de 11 dígitos
 * utilizado en Argentina para identificar a contribuyentes.
 *
 * Formato: XX-XXXXXXXX-X
 * - 2 dígitos: tipo de persona (20, 23, 24, 27, 30, 33, 34)
 * - 8 dígitos: número de documento o secuencia
 * - 1 dígito: dígito verificador (calculado con módulo 11)
 */

// Multiplicadores para el algoritmo Módulo 11
const MULTIPLICADORES = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/**
 * Valida un CUIT argentino usando el algoritmo módulo 11
 * @param cuit - CUIT en formato XX-XXXXXXXX-X o sin guiones
 * @returns true si el CUIT es válido
 *
 * @example
 * validateCUIT('30-71057829-6')  // true
 * validateCUIT('30710578296')    // true
 * validateCUIT('30-71057829-5')  // false (DV incorrecto)
 */
export function validateCUIT(cuit: string): boolean {
  // Remover guiones y espacios
  const cleaned = cuit.replace(/[-\s]/g, '');

  // Validar longitud
  if (cleaned.length !== 11) {
    return false;
  }

  // Validar que sean solo dígitos
  if (!/^\d+$/.test(cleaned)) {
    return false;
  }

  // Extraer dígito verificador
  const digits = cleaned.split('').map(Number);
  const providedDV = digits[10];

  // Calcular dígito verificador esperado
  const calculatedDV = calculateVerificationDigit(cleaned.slice(0, 10));

  return calculatedDV === providedDV;
}

/**
 * Calcula el dígito verificador de un CUIT usando módulo 11
 * @param baseCUIT - Primeros 10 dígitos del CUIT
 * @returns Dígito verificador calculado (0-9)
 */
function calculateVerificationDigit(baseCUIT: string): number {
  const digits = baseCUIT.split('').map(Number);

  // Multiplicar cada dígito por su multiplicador correspondiente
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += digits[i]! * MULTIPLICADORES[i]!;
  }

  // Calcular resto de la división por 11
  const remainder = sum % 11;

  // Aplicar reglas especiales del algoritmo
  if (remainder === 0) {
    return 0;
  } else if (remainder === 1) {
    return 9;
  } else {
    return 11 - remainder;
  }
}

/**
 * Normaliza un CUIT al formato estándar XX-XXXXXXXX-X
 * @param cuit - CUIT en cualquier formato
 * @returns CUIT normalizado con guiones
 * @throws Error si el CUIT es inválido
 *
 * @example
 * normalizeCUIT('30710578296')    // '30-71057829-6'
 * normalizeCUIT('30-71057829-6')  // '30-71057829-6'
 */
export function normalizeCUIT(cuit: string): string {
  const cleaned = cuit.replace(/[-\s]/g, '');

  if (cleaned.length !== 11 || !/^\d+$/.test(cleaned)) {
    throw new Error(`CUIT inválido: ${cuit}`);
  }

  if (!validateCUIT(cleaned)) {
    throw new Error(`CUIT con dígito verificador incorrecto: ${cuit}`);
  }

  return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 10)}-${cleaned.slice(10)}`;
}

/**
 * Extrae posibles CUITs de un texto usando expresiones regulares
 * @param text - Texto donde buscar CUITs
 * @returns Array de CUITs encontrados (ya validados)
 *
 * @example
 * extractCUITFromText('CUIT: 30-71057829-6')  // ['30-71057829-6']
 * extractCUITFromText('CUIT 30710578296')     // ['30-71057829-6']
 */
export function extractCUITFromText(text: string): string[] {
  // Patrones para detectar CUITs en diferentes formatos
  const patterns = [
    /\b(\d{2})[-\s]?(\d{8})[-\s]?(\d)\b/g, // Formato con/sin guiones
  ];

  const found: Set<string> = new Set();

  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);

    for (const match of matches) {
      const cuit = match[0].replace(/[-\s]/g, '');

      // Solo agregar si es válido
      if (validateCUIT(cuit)) {
        found.add(normalizeCUIT(cuit));
      }
    }
  }

  return Array.from(found);
}

/**
 * Obtiene el tipo de persona según el prefijo del CUIT
 * @param cuit - CUIT en cualquier formato
 * @returns Tipo de persona o null si es desconocido
 */
export function getPersonType(cuit: string): 'FISICA' | 'JURIDICA' | null {
  const cleaned = cuit.replace(/[-\s]/g, '');
  const prefix = cleaned.slice(0, 2);

  // Prefijos para personas físicas
  if (['20', '23', '24', '27'].includes(prefix)) {
    return 'FISICA';
  }

  // Prefijos para personas jurídicas
  if (['30', '33', '34'].includes(prefix)) {
    return 'JURIDICA';
  }

  return null;
}
