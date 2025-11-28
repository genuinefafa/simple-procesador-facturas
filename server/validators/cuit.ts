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
    /\b(\d{2})[-\s]?(\d{8})[-\s]?(\d)\b/g, // Formato con/sin guiones/espacios
    /\b(\d{11})\b/g, // Formato sin separadores (ej: 30517583231)
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
 * Información de un CUIT encontrado con contexto
 */
export interface CUITWithContext {
  cuit: string;
  position: number;
  contextBefore: string;
  contextAfter: string;
  score: number;
}

/**
 * Extrae CUITs con información de contexto para scoring inteligente
 * @param text - Texto donde buscar CUITs
 * @returns Array de CUITs con contexto y score
 */
export function extractCUITsWithContext(text: string): CUITWithContext[] {
  const results: CUITWithContext[] = [];

  // Patrones para detectar CUITs en diferentes formatos
  const patterns = [
    /\b(\d{2})[-\s]?(\d{8})[-\s]?(\d)\b/g, // Con separadores
    /\b(\d{11})\b/g, // Sin separadores
  ];

  // Palabras clave para scoring
  const emitterKeywords = [
    'emisor',
    'razon social',
    'razón social',
    'proveedor',
    'vendedor',
    'facturador',
    'cuit emisor',
    'cuit:',
    'c.u.i.t.',
    'contribuyente',
  ];

  // Indicadores FUERTES de emisor (mayor peso)
  const strongEmitterKeywords = [
    'ingresos brutos',
    'ing. brutos',
    'ing.brutos',
    'iibb',
    'inicio actividades',
    'inicio de actividades',
    'codigo 01', // El emisor suele estar marcado como "Código 01"
    'código 01',
  ];

  const receiverKeywords = [
    'receptor',
    'cliente',
    'comprador',
    'destinatario',
    'señor',
    'señores',
    'sres',
    'sra',
  ];

  // Indicadores FUERTES de receptor (mayor peso)
  const strongReceiverKeywords = [
    'la segunda',
    'seguros',
    'aseguradora',
    'cond. venta',
    'condiciones de venta',
    'cuenta corriente',
  ];

  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);

    for (const match of matches) {
      const rawCuit = match[0].replace(/[-\s]/g, '');

      // Validar CUIT
      if (!validateCUIT(rawCuit)) {
        continue;
      }

      const normalizedCuit = normalizeCUIT(rawCuit);
      const position = match.index || 0;

      // Extraer contexto (200 chars antes y después para PDFs complejos)
      const contextSize = 200;
      const contextBefore = text.slice(Math.max(0, position - contextSize), position);
      const contextAfter = text.slice(position, Math.min(text.length, position + contextSize));

      // Calcular score
      let score = 0;

      const contextLower = (contextBefore + contextAfter).toLowerCase();
      const contextAfterLower = contextAfter.toLowerCase();
      const contextBeforeLower = contextBefore.toLowerCase();

      // Detectar indicadores fuertes - SOLO si aparecen CERCA del CUIT
      // Buscar en los últimos 50 chars ANTES (labels que preceden al valor)
      // O en los primeros 160 chars DESPUÉS (labels/valores que siguen al CUIT)
      // Esto evita que detectemos indicadores que pertenecen a otro CUIT
      const contextBeforeClose = contextBefore.slice(-50).toLowerCase();
      const contextAfterClose = contextAfter.slice(0, 160).toLowerCase();

      // Si hay separadores de sección (Cliente, FACTURA) antes de los indicadores,
      // probablemente pertenecen a otra sección
      const hasSectionSeparator = /cliente:|factura\s+n[ºo°]:/i.test(contextAfter.slice(0, 160));

      let hasStrongEmitterIndicator = false;
      if (strongEmitterKeywords.some((keyword) => contextBeforeClose.includes(keyword))) {
        hasStrongEmitterIndicator = true;
      } else if (strongEmitterKeywords.some((keyword) => contextAfterClose.includes(keyword)) && !hasSectionSeparator) {
        hasStrongEmitterIndicator = true;
      }
      const hasStrongReceiverIndicator = strongReceiverKeywords.some((keyword) =>
        contextLower.includes(keyword)
      );

      // +150 puntos si está cerca de indicadores FUERTES de emisor (peso aumentado)
      if (hasStrongEmitterIndicator) {
        score += 150;
      }

      // +50 puntos si está cerca de palabras clave de emisor
      if (emitterKeywords.some((keyword) => contextLower.includes(keyword))) {
        score += 50;
      }

      // -100 puntos si está cerca de indicadores FUERTES de receptor
      // PERO: NO penalizar si también tiene indicador fuerte de emisor (probablemente es layout complejo)
      if (hasStrongReceiverIndicator && !hasStrongEmitterIndicator) {
        score -= 100;
      }

      // -50 puntos si está cerca de palabras clave de receptor
      if (receiverKeywords.some((keyword) => contextLower.includes(keyword))) {
        score -= 50;
      }

      // +30 puntos si es el primero en aparecer
      if (results.length === 0) {
        score += 30;
      }

      // +20 puntos si está en el primer tercio del documento (usualmente es el emisor)
      if (position < text.length / 3) {
        score += 20;
      }

      // +40 puntos si está justo después de "CUIT:" o similar (muy probable que sea emisor)
      if (/cuit[:\s]*$/i.test(contextBefore.slice(-10))) {
        score += 40;
      }

      // -50 puntos si aparece en sección "Apellido y Nombre / Razón Social" (típicamente cliente)
      if (/apellido.*raz[oó]n\s+social/i.test(contextBefore.slice(-150))) {
        score -= 50;
      }

      // +30 puntos si aparece después de "Domicilio Comercial" o similar (sección emisor)
      if (/domicilio\s+comercial/i.test(contextBefore.slice(-150))) {
        score += 30;
      }

      // Evitar duplicados (mismo CUIT puede aparecer múltiples veces)
      const existing = results.find((r) => r.cuit === normalizedCuit);
      if (existing) {
        // Si encontramos el mismo CUIT de nuevo, tomar el score más alto
        if (score > existing.score) {
          existing.score = score;
          existing.position = position;
          existing.contextBefore = contextBefore;
          existing.contextAfter = contextAfter;
        }
      } else {
        results.push({
          cuit: normalizedCuit,
          position,
          contextBefore,
          contextAfter,
          score,
        });
      }
    }
  }

  // Ordenar por score descendente
  return results.sort((a, b) => b.score - a.score);
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
