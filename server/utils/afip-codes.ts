/**
 * Mapeo de códigos AFIP para tipos de comprobantes
 *
 * Basado en la codificación oficial de AFIP para archivos del fisco.
 * Los códigos pueden aparecer en facturas electrónicas y sirven para
 * identificar el tipo de documento de manera más confiable.
 */

import type { InvoiceType, DocumentKind } from './types';

export type { DocumentKind };

export interface AFIPDocumentType {
  code: string;
  invoiceType: InvoiceType;
  documentKind: DocumentKind;
  description: string;
}

/**
 * Mapeo completo de códigos AFIP a tipos de comprobante
 * Códigos más comunes en facturas argentinas
 */
export const AFIP_CODES: Record<string, AFIPDocumentType> = {
  // Tipo A (Responsable Inscripto a Responsable Inscripto)
  '001': { code: '001', invoiceType: 'A', documentKind: 'FAC', description: 'Factura A' },
  '01': { code: '01', invoiceType: 'A', documentKind: 'FAC', description: 'Factura A' },
  '1': { code: '1', invoiceType: 'A', documentKind: 'FAC', description: 'Factura A' },
  '002': { code: '002', invoiceType: 'A', documentKind: 'NDB', description: 'Nota de Débito A' },
  '02': { code: '02', invoiceType: 'A', documentKind: 'NDB', description: 'Nota de Débito A' },
  '2': { code: '2', invoiceType: 'A', documentKind: 'NDB', description: 'Nota de Débito A' },
  '003': { code: '003', invoiceType: 'A', documentKind: 'NCR', description: 'Nota de Crédito A' },
  '03': { code: '03', invoiceType: 'A', documentKind: 'NCR', description: 'Nota de Crédito A' },
  '3': { code: '3', invoiceType: 'A', documentKind: 'NCR', description: 'Nota de Crédito A' },

  // Tipo B (Responsable Inscripto a Consumidor Final/Exento)
  '006': { code: '006', invoiceType: 'B', documentKind: 'FAC', description: 'Factura B' },
  '06': { code: '06', invoiceType: 'B', documentKind: 'FAC', description: 'Factura B' },
  '6': { code: '6', invoiceType: 'B', documentKind: 'FAC', description: 'Factura B' },
  '007': { code: '007', invoiceType: 'B', documentKind: 'NDB', description: 'Nota de Débito B' },
  '07': { code: '07', invoiceType: 'B', documentKind: 'NDB', description: 'Nota de Débito B' },
  '7': { code: '7', invoiceType: 'B', documentKind: 'NDB', description: 'Nota de Débito B' },
  '008': { code: '008', invoiceType: 'B', documentKind: 'NCR', description: 'Nota de Crédito B' },
  '08': { code: '08', invoiceType: 'B', documentKind: 'NCR', description: 'Nota de Crédito B' },
  '8': { code: '8', invoiceType: 'B', documentKind: 'NCR', description: 'Nota de Crédito B' },

  // Tipo C (Monotributista)
  '011': { code: '011', invoiceType: 'C', documentKind: 'FAC', description: 'Factura C' },
  '11': { code: '11', invoiceType: 'C', documentKind: 'FAC', description: 'Factura C' },
  '012': { code: '012', invoiceType: 'C', documentKind: 'NDB', description: 'Nota de Débito C' },
  '12': { code: '12', invoiceType: 'C', documentKind: 'NDB', description: 'Nota de Débito C' },
  '013': { code: '013', invoiceType: 'C', documentKind: 'NCR', description: 'Nota de Crédito C' },
  '13': { code: '13', invoiceType: 'C', documentKind: 'NCR', description: 'Nota de Crédito C' },

  // Tipo E (Exportación)
  '019': { code: '019', invoiceType: 'E', documentKind: 'FAC', description: 'Factura E' },
  '19': { code: '19', invoiceType: 'E', documentKind: 'FAC', description: 'Factura E' },
  '020': { code: '020', invoiceType: 'E', documentKind: 'NDB', description: 'Nota de Débito E' },
  '20': { code: '20', invoiceType: 'E', documentKind: 'NDB', description: 'Nota de Débito E' },
  '021': { code: '021', invoiceType: 'E', documentKind: 'NCR', description: 'Nota de Crédito E' },
  '21': { code: '21', invoiceType: 'E', documentKind: 'NCR', description: 'Nota de Crédito E' },

  // Tipo M (con CAI)
  '051': { code: '051', invoiceType: 'M', documentKind: 'FAC', description: 'Factura M' },
  '51': { code: '51', invoiceType: 'M', documentKind: 'FAC', description: 'Factura M' },
  '052': { code: '052', invoiceType: 'M', documentKind: 'NDB', description: 'Nota de Débito M' },
  '52': { code: '52', invoiceType: 'M', documentKind: 'NDB', description: 'Nota de Débito M' },
  '053': { code: '053', invoiceType: 'M', documentKind: 'NCR', description: 'Nota de Crédito M' },
  '53': { code: '53', invoiceType: 'M', documentKind: 'NCR', description: 'Nota de Crédito M' },
};

/**
 * Obtiene el tipo de documento a partir de un código AFIP
 * @param code - Código AFIP (ej: "011", "11", "1", "201")
 * @returns Información del tipo de documento o undefined si no se encuentra
 *
 * Códigos 201-299: Facturas electrónicas AFIP (se restan 200)
 * Ejemplo: 201 → 1 (Factura A), 206 → 6 (Factura B), 211 → 11 (Factura C)
 */
export function getDocumentTypeFromAFIPCode(code: string): AFIPDocumentType | undefined {
  // Normalizar: quitar espacios y ceros a la izquierda para búsqueda flexible
  const normalizedCode = code.trim();

  // Primero intentar con el código exacto
  if (AFIP_CODES[normalizedCode]) {
    return AFIP_CODES[normalizedCode];
  }

  // Intentar sin ceros a la izquierda
  const withoutLeadingZeros = normalizedCode.replace(/^0+/, '') || '0';
  if (AFIP_CODES[withoutLeadingZeros]) {
    return AFIP_CODES[withoutLeadingZeros];
  }

  // Códigos 201-299: Facturas electrónicas (restar 200)
  const codeNum = parseInt(normalizedCode, 10);
  if (codeNum >= 201 && codeNum <= 299) {
    const baseCode = (codeNum - 200).toString();
    const basePadded = baseCode.padStart(3, '0');

    // Intentar con el código base (ej: 201 → 001)
    if (AFIP_CODES[basePadded]) {
      return {
        ...AFIP_CODES[basePadded],
        code: normalizedCode, // Mantener código original
        description: `${AFIP_CODES[basePadded].description} (Electrónica)`,
      };
    }

    // Intentar sin ceros (ej: 201 → 1)
    if (AFIP_CODES[baseCode]) {
      return {
        ...AFIP_CODES[baseCode],
        code: normalizedCode,
        description: `${AFIP_CODES[baseCode].description} (Electrónica)`,
      };
    }
  }

  return undefined;
}

/**
 * Extrae el código AFIP y tipo de documento del texto de una factura
 * Busca patrones comunes donde aparece el código numérico
 *
 * @param text - Texto extraído de la factura
 * @returns Información del tipo de documento o undefined si no se encuentra
 */
export function extractAFIPCodeFromText(text: string): AFIPDocumentType | undefined {
  // Patrones donde puede aparecer el código AFIP
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
        // match[1] = letra (A, B, C, etc), match[2] = código AFIP
        const docType = getDocumentTypeFromAFIPCode(match[2]);
        if (docType) {
          // Verificar que la letra detectada coincida con el código AFIP
          const detectedLetter = match[1].toUpperCase();
          if (docType.invoiceType === detectedLetter) {
            console.info(
              `   🏛️ Código AFIP detectado: ${detectedLetter} + código ${match[2]} → ${docType.description}`
            );
            return docType;
          } else {
            console.warn(
              `   ⚠️ Inconsistencia: letra ${detectedLetter} no coincide con código ${match[2]} (${docType.invoiceType})`
            );
            // Confiar en el código AFIP de todos modos
            console.info(`   🏛️ Usando código AFIP: ${match[2]} → ${docType.description}`);
            return docType;
          }
        }
      }
      // Para el resto de los patrones, el código está en match[1]
      else if (match[1]) {
        const docType = getDocumentTypeFromAFIPCode(match[1]);
        if (docType) {
          console.info(`   🏛️ Código AFIP detectado: ${match[1]} → ${docType.description}`);
          return docType;
        } else {
          console.debug(
            `   ⚠️ Código encontrado (${match[1]}) pero no coincide con códigos AFIP conocidos`
          );
        }
      }
    }
  }

  console.debug('   ℹ️ No se encontró código AFIP en el texto');
  return undefined;
}

/**
 * Determina el tipo de letra (A, B, C, E, M) del documento
 * Combina detección por código AFIP y por texto
 *
 * @param text - Texto extraído de la factura
 * @returns Tipo de comprobante (A, B, C, E, M) o undefined
 */
export function extractInvoiceTypeWithAFIP(text: string):
  | {
      invoiceType: InvoiceType;
      documentKind: DocumentKind;
      method: 'AFIP_CODE' | 'TEXT_PATTERN';
    }
  | undefined {
  // Primero intentar con código AFIP (más confiable)
  const afipType = extractAFIPCodeFromText(text);
  if (afipType) {
    return {
      invoiceType: afipType.invoiceType,
      documentKind: afipType.documentKind,
      method: 'AFIP_CODE',
    };
  }

  // Fallback a patrones de texto tradicionales
  const textPatterns: {
    pattern: RegExp;
    type: InvoiceType;
    kind: DocumentKind;
  }[] = [
    // TEXTO PEGADO SIN ESPACIOS (alta prioridad) - formato común en PDFs mal parseados
    // Ejemplos: "AFACTURA", "BFACTURA", "CFACTURA", "A001", "C001", "B006"
    { pattern: /\b([A-CEM])(FACTURA|001|011|006|019|201|206|211)\b/i, type: 'A', kind: 'FAC' },

    // CODIGO: seguido de letra en otra línea (formato AFIP electrónico)
    { pattern: /CODIGO:\s*[\r\n]+\s*-?\s*[\r\n]+\s*([A-CEM])\s*[\r\n]/i, type: 'A', kind: 'FAC' },

    // Letra seguida de número de código pegado: "C001NRO" (sin espacios)
    { pattern: /\b([A-CEM])(001|011|006|019|201|206|211)(?:NRO|N°|Nº)?/i, type: 'A', kind: 'FAC' },

    // Facturas con espacios normales
    { pattern: /(?:^|\s)Factura\s+([A-CEM])(?:\s|$|[^a-z])/im, type: 'A', kind: 'FAC' },
    { pattern: /\bFACTURA\s+([A-CEM])\b/i, type: 'A', kind: 'FAC' },
    { pattern: /\bComprobante\s+([A-CEM])(?:\s|$|-)/i, type: 'A', kind: 'FAC' },

    // Notas de Crédito
    { pattern: /\bNota\s+de\s+Cr[eé]dito\s+([A-CEM])\b/i, type: 'A', kind: 'NCR' },
    { pattern: /\bNC\s+([A-CEM])\b/i, type: 'A', kind: 'NCR' },

    // Notas de Débito
    { pattern: /\bNota\s+de\s+D[eé]bito\s+([A-CEM])\b/i, type: 'A', kind: 'NDB' },
    { pattern: /\bND\s+([A-CEM])\b/i, type: 'A', kind: 'NDB' },
  ];

  for (const { pattern, kind } of textPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const extractedType = match[1].toUpperCase() as InvoiceType;
      return {
        invoiceType: extractedType,
        documentKind: kind,
        method: 'TEXT_PATTERN',
      };
    }
  }

  return undefined;
}
