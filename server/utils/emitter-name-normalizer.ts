/**
 * Utilidades para normalizar nombres de emisores (razón social)
 * Convierte nombres en mayúsculas a formato capitalizado y abrevia tipos societarios
 */

/**
 * Mapeo de tipos societarios completos a sus siglas
 * Basado en los tipos de sociedades comerciales en Argentina
 */
const COMPANY_TYPE_MAPPINGS: Record<string, string> = {
  // Sociedades por acciones
  'SOCIEDAD ANONIMA': 'SA',
  'SOCIEDAD ANÓNIMA': 'SA',
  'SOCIEDAD ANONIMA UNIPERSONAL': 'SAU',
  'SOCIEDAD ANÓNIMA UNIPERSONAL': 'SAU',
  'SOCIEDAD POR ACCIONES SIMPLIFICADA': 'SAS',
  'SOCIEDAD EN COMANDITA POR ACCIONES': 'SCA',

  // Sociedades por cuotas
  'SOCIEDAD DE RESPONSABILIDAD LIMITADA': 'SRL',

  // Sociedades de personas
  'SOCIEDAD COLECTIVA': 'SC',
  'SOCIEDAD EN COMANDITA SIMPLE': 'SCS',
  'SOCIEDAD DE CAPITAL E INDUSTRIA': 'SCI',

  // Otras formas jurídicas comunes
  'SOCIEDAD DE HECHO': 'SH',
  'COOPERATIVA DE TRABAJO LIMITADA': 'COOP',
  'COOPERATIVA DE TRABAJO': 'COOP',
  COOPERATIVA: 'COOP',
  'ASOCIACION CIVIL': 'AC',
  'ASOCIACIÓN CIVIL': 'AC',
  FUNDACION: 'FUND',
  FUNDACIÓN: 'FUND',
};

/**
 * Variantes con puntos y espacios de las siglas
 */
const COMPANY_TYPE_VARIANTS: Record<string, string> = {
  'S.A.': 'SA',
  'S A': 'SA',
  'S. A.': 'SA',
  'S.R.L.': 'SRL',
  'S R L': 'SRL',
  'S. R. L.': 'SRL',
  'S.A.U.': 'SAU',
  'S A U': 'SAU',
  'S. A. U.': 'SAU',
  'S.A.S.': 'SAS',
  'S A S': 'SAS',
  'S. A. S.': 'SAS',
  'S.C.A.': 'SCA',
  'S C A': 'SCA',
  'S. C. A.': 'SCA',
  'S.C.': 'SC',
  'S C': 'SC',
  'S. C.': 'SC',
  'S.C.S.': 'SCS',
  'S C S': 'SCS',
  'S. C. S.': 'SCS',
  'S.C.I.': 'SCI',
  'S C I': 'SCI',
  'S. C. I.': 'SCI',
  'S.H.': 'SH',
  'S H': 'SH',
  'S. H.': 'SH',
  'A.C.': 'AC',
  'A C': 'AC',
  'A. C.': 'AC',
};

/**
 * Palabras que deben quedar en minúsculas (excepto al inicio)
 */
const LOWERCASE_WORDS = new Set([
  'de',
  'del',
  'la',
  'las',
  'los',
  'el',
  'y',
  'e',
  'o',
  'u',
  'en',
  'con',
  'por',
  'para',
  'al',
  'a',
]);

/**
 * Capitaliza correctamente una palabra
 * @param word - Palabra a capitalizar
 * @param isFirst - Si es la primera palabra de la razón social
 */
function capitalizeWord(word: string, isFirst: boolean = false): string {
  if (!word) return word;

  // Si es una palabra que debe ir en minúsculas y no es la primera, dejarla en minúsculas
  if (!isFirst && LOWERCASE_WORDS.has(word.toLowerCase())) {
    return word.toLowerCase();
  }

  // Capitalizar: primera letra en mayúscula, resto en minúsculas
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Normaliza el nombre de un emisor
 * Convierte de "COTO CENTRO INTEGRAL DE COMERCIALIZACION SOCIEDAD ANONIMA"
 * a "Coto Centro Integral de Comercialización SA"
 *
 * @param rawName - Nombre crudo desde ARCA/AFIP (usualmente en mayúsculas)
 * @returns Nombre normalizado con capitalización correcta y tipo societario abreviado
 */
export function normalizeEmitterName(rawName: string): string {
  if (!rawName) return rawName;

  const normalized = rawName.trim();

  // 1. Detectar y extraer el tipo societario (puede estar al final o en el medio)
  let companyType: string | null = null;
  let nameWithoutType = normalized;

  // Buscar tipos societarios completos primero (más largos primero para evitar matches parciales)
  const sortedTypes = Object.keys(COMPANY_TYPE_MAPPINGS).sort((a, b) => b.length - a.length);

  for (const fullType of sortedTypes) {
    // Buscar exacto (toda la razón social es solo el tipo)
    const regexExact = new RegExp(`^${fullType}$`, 'i');
    if (regexExact.test(normalized)) {
      companyType = COMPANY_TYPE_MAPPINGS[fullType] ?? null;
      nameWithoutType = '';
      break;
    }

    // Buscar al final (caso más común: "EMPRESA ... SOCIEDAD ANONIMA")
    const regexEnd = new RegExp(`\\s+${fullType}\\s*$`, 'i');
    if (regexEnd.test(normalized)) {
      companyType = COMPANY_TYPE_MAPPINGS[fullType] ?? null;
      nameWithoutType = normalized.replace(regexEnd, '').trim();
      break;
    }

    // Buscar en el medio seguido de más texto (ej: "SOCIEDAD ANONIMA COMERCIAL...")
    const regexMiddle = new RegExp(`\\s+${fullType}\\s+`, 'i');
    if (regexMiddle.test(normalized)) {
      companyType = COMPANY_TYPE_MAPPINGS[fullType] ?? null;
      nameWithoutType = normalized.replace(regexMiddle, ' ').trim();
      break;
    }

    // Buscar al inicio seguido de más texto (ej: "ASOCIACION CIVIL PARA LA EDUCACION")
    // Solo para formas jurídicas específicas que suelen ir al inicio
    if (
      fullType.includes('ASOCIACION') ||
      fullType.includes('COOPERATIVA') ||
      fullType.includes('FUNDACION')
    ) {
      const regexStart = new RegExp(`^${fullType}\\s+`, 'i');
      if (regexStart.test(normalized)) {
        companyType = COMPANY_TYPE_MAPPINGS[fullType] ?? null;
        nameWithoutType = normalized.replace(regexStart, '').trim();
        break;
      }
    }
  }

  // Si no encontró tipo completo, buscar variantes con puntos/espacios
  if (!companyType) {
    for (const [variant, normalizedVariant] of Object.entries(COMPANY_TYPE_VARIANTS)) {
      const regex = new RegExp(`\\s+${variant.replace(/\./g, '\\.')}\\s*$`, 'i');
      if (regex.test(nameWithoutType)) {
        companyType = normalizedVariant;
        nameWithoutType = nameWithoutType.replace(regex, '').trim();
        break;
      }
    }
  }

  // 2. Capitalizar el nombre correctamente
  const words = nameWithoutType.split(/\s+/);
  const capitalizedWords = words.map((word, index) => capitalizeWord(word, index === 0));
  let result = capitalizedWords.join(' ');

  // 3. Agregar el tipo societario abreviado al final
  if (companyType) {
    result = `${result} ${companyType}`;
  }

  return result;
}

/**
 * Ejemplos de uso:
 *
 * normalizeEmitterName('COTO CENTRO INTEGRAL DE COMERCIALIZACION SOCIEDAD ANONIMA')
 * // => 'Coto Centro Integral de Comercialización SA'
 *
 * normalizeEmitterName('MERCADO LIBRE S.R.L.')
 * // => 'Mercado Libre SRL'
 *
 * normalizeEmitterName('EMPRESA DE SERVICIOS Y LOGISTICA S.A.')
 * // => 'Empresa de Servicios y Logística SA'
 */
