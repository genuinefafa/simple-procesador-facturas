/**
 * Mapeo de códigos AFIP/ARCA para tipos de comprobantes
 *
 * Basado en la codificación oficial de AFIP para archivos del fisco.
 * Los códigos pueden aparecer en facturas electrónicas y sirven para
 * identificar el tipo de documento de manera más confiable.
 *
 * IMPORTANTE: Este archivo usa afip-types.json como fuente de verdad.
 * El JSON es editable y puede evolucionar cuando ARCA cree nuevos tipos.
 */

import afipTypesData from './afip-types.json';

export type DocumentKind = 'FAC' | 'NCR' | 'NDB';

export interface AFIPDocumentType {
  code: number;
  invoiceType: string;
  documentKind: DocumentKind;
  friendlyType: string;
  description: string;
  descriptionLong: string;
}

/**
 * Mapeo completo de códigos AFIP/ARCA cargado desde JSON
 * La clave es el código numérico como string
 */
export const AFIP_TYPES: Record<string, AFIPDocumentType> = afipTypesData as Record<
  string,
  AFIPDocumentType
>;

/**
 * Mapeo inverso: friendlyType → código ARCA
 * Útil para búsquedas y conversiones desde el tipo amigable
 */
export const FRIENDLY_TYPE_TO_CODE: Record<string, number> = Object.values(AFIP_TYPES).reduce(
  (acc, type) => {
    acc[type.friendlyType] = type.code;
    return acc;
  },
  {} as Record<string, number>
);

/**
 * Obtiene el tipo de documento a partir de un código ARCA
 *
 * @param code - Código ARCA (puede ser número o string)
 * @returns Información del tipo de documento o undefined si no se encuentra
 *
 * @example
 * getDocumentTypeFromARCACode(1) // { code: 1, invoiceType: "A", friendlyType: "FACA", ... }
 * getDocumentTypeFromARCACode("11") // { code: 11, invoiceType: "C", friendlyType: "FACC", ... }
 */
export function getDocumentTypeFromARCACode(code: number | string): AFIPDocumentType | undefined {
  // Normalizar: convertir a número y luego a string para remover ceros a la izquierda
  // Ej: "011" → 11 → "11"
  const codeStr = typeof code === 'number' ? code.toString() : parseInt(code.trim(), 10).toString();
  return AFIP_TYPES[codeStr];
}

/**
 * Obtiene el friendlyType (4 letras) a partir de un código ARCA
 *
 * @param code - Código ARCA
 * @returns FriendlyType (ej: "FACA", "NCRB") o undefined
 *
 * @example
 * getFriendlyType(1) // "FACA"
 * getFriendlyType(11) // "FACC"
 * getFriendlyType(3) // "NCRA"
 */
export function getFriendlyType(code: number | null | undefined): string | undefined {
  if (code === null || code === undefined) return undefined;
  return getDocumentTypeFromARCACode(code)?.friendlyType;
}

/**
 * Obtiene la descripción corta a partir de un código ARCA
 *
 * @param code - Código ARCA
 * @returns Descripción (ej: "Factura A") o undefined
 *
 * @example
 * getDescription(1) // "Factura A"
 * getDescription(11) // "Factura C"
 */
export function getDescription(code: number | null | undefined): string | undefined {
  if (code === null || code === undefined) return undefined;
  return getDocumentTypeFromARCACode(code)?.description;
}

/**
 * Obtiene la descripción larga a partir de un código ARCA
 *
 * @param code - Código ARCA
 * @returns Descripción larga o undefined
 *
 * @example
 * getDescriptionLong(1) // "Factura A (Responsable Inscripto a Responsable Inscripto)"
 */
export function getDescriptionLong(code: number | null | undefined): string | undefined {
  if (code === null || code === undefined) return undefined;
  return getDocumentTypeFromARCACode(code)?.descriptionLong;
}

/**
 * Obtiene el código ARCA a partir de un friendlyType
 *
 * @param friendlyType - Tipo amigable (ej: "FACA", "NCRB")
 * @returns Código ARCA o undefined
 *
 * @example
 * getARCACodeFromFriendlyType("FACA") // 1
 * getARCACodeFromFriendlyType("FACC") // 11
 */
export function getARCACodeFromFriendlyType(friendlyType: string): number | undefined {
  return FRIENDLY_TYPE_TO_CODE[friendlyType.toUpperCase()];
}

/**
 * Valida si un código es un código ARCA válido
 *
 * @param code - Código a validar
 * @returns true si el código existe en el mapeo ARCA
 *
 * @example
 * isValidARCACode(1) // true
 * isValidARCACode(9999) // false
 */
export function isValidARCACode(code: number | null | undefined): boolean {
  if (code === null || code === undefined) return false;
  return AFIP_TYPES[code.toString()] !== undefined;
}

/**
 * Letter used for financial reporting. 'other' covers export invoices (E)
 * and any code missing from afip-types.json.
 */
export type InvoiceLetter = 'A' | 'B' | 'C' | 'M' | 'other';

const REPORTING_LETTERS: ReadonlySet<string> = new Set(['A', 'B', 'C', 'M']);

/**
 * Gets the reporting letter for an ARCA code.
 *
 * NOTE: the gold view (v_comprobantes_oro) mirrors this mapping in SQL.
 * tests/api/gold-view.test.ts checks both stay in sync for every code.
 *
 * @example
 * getInvoiceLetter(63) // "A" (Liquidación A)
 * getInvoiceLetter(19) // "other" (Factura E)
 */
export function getInvoiceLetter(code: number | null | undefined): InvoiceLetter {
  if (code === null || code === undefined) return 'other';
  const letter = getDocumentTypeFromARCACode(code)?.invoiceType;
  return letter && REPORTING_LETTERS.has(letter) ? (letter as InvoiceLetter) : 'other';
}

/**
 * Sign coefficient for totals: credit notes subtract (-1), everything else
 * adds (+1). Unknown codes add.
 */
export function getInvoiceSign(code: number | null | undefined): 1 | -1 {
  if (code === null || code === undefined) return 1;
  return getDocumentTypeFromARCACode(code)?.documentKind === 'NCR' ? -1 : 1;
}

/**
 * Whether VAT on this letter is recoverable as tax credit (IVA discriminado).
 */
export function isVatRecoverable(letter: InvoiceLetter): boolean {
  return letter === 'A' || letter === 'M';
}

/**
 * Extrae el código ARCA y tipo de documento del texto de una factura
 * Busca patrones comunes donde aparece el código numérico
 *
 * @param text - Texto extraído de la factura
 * @returns Información del tipo de documento o undefined si no se encuentra
 */
export function extractARCACodeFromText(text: string): AFIPDocumentType | undefined {
  // Patrones donde puede aparecer el código ARCA
  const patterns = [
    // Patrón más específico primero: letra del comprobante seguida de "Código:"
    // Ejemplo: "A\nCódigo: 01" o "B Código: 06"
    /(?:^|\s)([A-CEM])\s*[\r\n]+\s*C[oóÓ]d(?:igo)?\.?\s*:?\s*(\d{1,3})\b/im,

    // Texto pegado: "01Código" (código antes de la palabra)
    /(\d{1,3})C[oóÓ]d(?:igo)?/i,

    // "Cod. 11" o "Cod: 11" o "Cod 11" (incluyendo "Código:" con acento)
    /\bC[oóÓ]d(?:igo)?\.?\s*:?\s*(\d{1,3})\b/i,

    // "CODIGO: 011" (puede estar en líneas separadas)
    /\bCODIGO\s*:?\s*[\r\n]*\s*(\d{1,3})\b/i,

    // "11 - Factura C" (número seguido de tipo)
    /\b(\d{1,3})\s*[-–]\s*(?:Factura|Nota\s+de\s+(?:Cr[eé]dito|D[eé]bito))\s+[A-CEM]/i,

    // En tablas: "Tipo | 11" o similar
    /\bTipo\s*[:|]?\s*(\d{1,3})\b/i,

    // "Comprobante: 11" o "Comp.: 11"
    /\bComp(?:robante)?\.?\s*:?\s*(\d{1,3})\b/i,
  ];

  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i];
    if (!pattern) continue;
    const match = text.match(pattern);
    if (match) {
      // El primer patrón captura la letra del comprobante Y el código
      if (i === 0 && match[1] && match[2]) {
        // match[1] = letra (A, B, C, etc), match[2] = código ARCA
        const docType = getDocumentTypeFromARCACode(match[2]);
        if (docType) {
          // Verificar que la letra detectada coincida con el código ARCA
          const detectedLetter = match[1].toUpperCase();
          if (docType.invoiceType === detectedLetter) {
            console.info(
              `   🏛️ Código ARCA detectado: ${detectedLetter} + código ${match[2]} → ${docType.description}`
            );
            return docType;
          } else {
            console.warn(
              `   ⚠️ Inconsistencia: letra ${detectedLetter} no coincide con código ${match[2]} (${docType.invoiceType})`
            );
            // Confiar en el código ARCA de todos modos
            console.info(`   🏛️ Usando código ARCA: ${match[2]} → ${docType.description}`);
            return docType;
          }
        }
      }
      // Para el resto de los patrones, el código está en match[1]
      else if (match[1]) {
        const docType = getDocumentTypeFromARCACode(match[1]);
        if (docType) {
          console.info(`   🏛️ Código ARCA detectado: ${match[1]} → ${docType.description}`);
          return docType;
        } else {
          console.debug(
            `   ⚠️ Código encontrado (${match[1]}) pero no coincide con códigos ARCA conocidos`
          );
        }
      }
    }
  }

  console.debug('   ℹ️ No se encontró código ARCA en el texto');
  return undefined;
}

/**
 * Determina el tipo de letra y documento del comprobante
 * Combina detección por código ARCA y por texto
 *
 * @param text - Texto extraído de la factura
 * @returns Tipo de comprobante con método de detección o undefined
 */
export function extractInvoiceTypeWithARCA(text: string):
  | {
      code: number;
      invoiceType: string;
      documentKind: DocumentKind;
      friendlyType: string;
      method: 'ARCA_CODE' | 'TEXT_PATTERN';
    }
  | undefined {
  // Primero intentar con código ARCA (más confiable)
  const arcaType = extractARCACodeFromText(text);
  if (arcaType) {
    return {
      code: arcaType.code,
      invoiceType: arcaType.invoiceType,
      documentKind: arcaType.documentKind,
      friendlyType: arcaType.friendlyType,
      method: 'ARCA_CODE',
    };
  }

  // Fallback a patrones de texto tradicionales
  const textPatterns: {
    pattern: RegExp;
    friendlyType: string;
  }[] = [
    // TEXTO PEGADO SIN ESPACIOS (alta prioridad) - formato común en PDFs mal parseados
    { pattern: /\b([A-CEM])(FACTURA|001|011|006|019|201|206|211)\b/i, friendlyType: 'FACA' },
    { pattern: /\bCFACTURA/i, friendlyType: 'FACC' },
    { pattern: /\bBFACTURA/i, friendlyType: 'FACB' },

    // CODIGO: seguido de letra en otra línea (formato AFIP electrónico)
    { pattern: /CODIGO:\s*[\r\n]+\s*-?\s*[\r\n]+\s*A\s*[\r\n]/i, friendlyType: 'FACA' },
    { pattern: /CODIGO:\s*[\r\n]+\s*-?\s*[\r\n]+\s*B\s*[\r\n]/i, friendlyType: 'FACB' },
    { pattern: /CODIGO:\s*[\r\n]+\s*-?\s*[\r\n]+\s*C\s*[\r\n]/i, friendlyType: 'FACC' },

    // Letra seguida de número de código pegado
    { pattern: /\bA001(?:NRO|N°|Nº)?/i, friendlyType: 'FACA' },
    { pattern: /\bB006(?:NRO|N°|Nº)?/i, friendlyType: 'FACB' },
    { pattern: /\bC011(?:NRO|N°|Nº)?/i, friendlyType: 'FACC' },

    // Facturas con espacios normales
    { pattern: /(?:^|\s)Factura\s+A(?:\s|$|[^a-z])/im, friendlyType: 'FACA' },
    { pattern: /(?:^|\s)Factura\s+B(?:\s|$|[^a-z])/im, friendlyType: 'FACB' },
    { pattern: /(?:^|\s)Factura\s+C(?:\s|$|[^a-z])/im, friendlyType: 'FACC' },
    { pattern: /(?:^|\s)Factura\s+E(?:\s|$|[^a-z])/im, friendlyType: 'FACE' },
    { pattern: /(?:^|\s)Factura\s+M(?:\s|$|[^a-z])/im, friendlyType: 'FACM' },

    // Notas de Crédito
    { pattern: /\bNota\s+de\s+Cr[eé]dito\s+A\b/i, friendlyType: 'NCRA' },
    { pattern: /\bNota\s+de\s+Cr[eé]dito\s+B\b/i, friendlyType: 'NCRB' },
    { pattern: /\bNota\s+de\s+Cr[eé]dito\s+C\b/i, friendlyType: 'NCRC' },
    { pattern: /\bNC\s+A\b/i, friendlyType: 'NCRA' },
    { pattern: /\bNC\s+B\b/i, friendlyType: 'NCRB' },
    { pattern: /\bNC\s+C\b/i, friendlyType: 'NCRC' },

    // Notas de Débito
    { pattern: /\bNota\s+de\s+D[eé]bito\s+A\b/i, friendlyType: 'NDBA' },
    { pattern: /\bNota\s+de\s+D[eé]bito\s+B\b/i, friendlyType: 'NDBB' },
    { pattern: /\bNota\s+de\s+D[eé]bito\s+C\b/i, friendlyType: 'NDBC' },
    { pattern: /\bND\s+A\b/i, friendlyType: 'NDBA' },
    { pattern: /\bND\s+B\b/i, friendlyType: 'NDBB' },
    { pattern: /\bND\s+C\b/i, friendlyType: 'NDBC' },
  ];

  for (const { pattern, friendlyType } of textPatterns) {
    const match = text.match(pattern);
    if (match) {
      const code = getARCACodeFromFriendlyType(friendlyType);
      if (code) {
        const arcaType = getDocumentTypeFromARCACode(code);
        if (arcaType) {
          return {
            code: arcaType.code,
            invoiceType: arcaType.invoiceType,
            documentKind: arcaType.documentKind,
            friendlyType: arcaType.friendlyType,
            method: 'TEXT_PATTERN',
          };
        }
      }
    }
  }

  return undefined;
}

// ============================================================================
// CONVERSIÓN TEMPORAL: Letra → Código ARCA
// TODO: Eliminar cuando extractores lean códigos ARCA nativamente (Issue en M5)
// ============================================================================

/**
 * Convierte una letra de tipo de comprobante a código ARCA
 * TEMPORAL: Asume que siempre es Factura (FAC), no distingue NC/ND
 *
 * @param letter - Letra del comprobante (A, B, C, E, M)
 * @returns Código ARCA correspondiente a Factura, o null si no se reconoce
 *
 * @example
 * convertLetterToARCACode('A') // 1 (Factura A)
 * convertLetterToARCACode('C') // 11 (Factura C)
 *
 * @deprecated Usar extracción nativa de códigos ARCA cuando esté implementado
 */
export function convertLetterToARCACode(letter: string): number | null {
  const letterUpper = letter.toUpperCase();
  const letterToCode: Record<string, number> = {
    A: 1, // Factura A
    B: 6, // Factura B
    C: 11, // Factura C
    E: 19, // Factura E
    M: 51, // Factura M
  };
  return letterToCode[letterUpper] ?? null;
}

// ============================================================================
// LEGACY: Funciones para compatibilidad con código anterior
// ============================================================================

/**
 * @deprecated Usar getDocumentTypeFromARCACode en su lugar
 */
export function getDocumentTypeFromAFIPCode(code: string): AFIPDocumentType | undefined {
  return getDocumentTypeFromARCACode(code);
}

/**
 * @deprecated Usar extractARCACodeFromText en su lugar
 */
export function extractAFIPCodeFromText(text: string): AFIPDocumentType | undefined {
  return extractARCACodeFromText(text);
}

/**
 * @deprecated Usar extractInvoiceTypeWithARCA en su lugar
 */
export function extractInvoiceTypeWithAFIP(text: string):
  | {
      invoiceType: string;
      documentKind: DocumentKind;
      method: 'AFIP_CODE' | 'TEXT_PATTERN';
    }
  | undefined {
  const result = extractInvoiceTypeWithARCA(text);
  if (!result) return undefined;
  return {
    invoiceType: result.invoiceType,
    documentKind: result.documentKind,
    method: result.method === 'ARCA_CODE' ? 'AFIP_CODE' : 'TEXT_PATTERN',
  };
}
