/**
 * Detección de códigos AFIP/ARCA en el texto de los comprobantes.
 *
 * IMPORTANTE: la tabla de códigos y los helpers de letra/signo viven en
 * shared/src/arca (fuente de verdad única para cliente y server); este
 * archivo los re-exporta para no romper los imports existentes.
 */

import {
  getARCACodeFromFriendlyType,
  getDocumentTypeFromARCACode,
  type AFIPDocumentType,
  type DocumentKind,
} from '@shared/arca';

// Code tables and reporting helpers live in shared/ (also used by the client).
export * from '@shared/arca';

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
