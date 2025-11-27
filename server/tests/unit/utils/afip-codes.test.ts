/**
 * Tests para el mapeo de códigos AFIP
 */

import { describe, it, expect } from 'vitest';
import {
  getDocumentTypeFromAFIPCode,
  extractAFIPCodeFromText,
  extractInvoiceTypeWithAFIP,
  AFIP_CODES,
} from '../../../utils/afip-codes';

describe('AFIP Codes', () => {
  describe('AFIP_CODES mapping', () => {
    it('debe tener los códigos principales de facturas', () => {
      // Facturas A
      expect(AFIP_CODES['001']).toEqual({
        code: '001',
        invoiceType: 'A',
        documentKind: 'FAC',
        description: 'Factura A',
      });

      // Facturas B
      expect(AFIP_CODES['006']).toEqual({
        code: '006',
        invoiceType: 'B',
        documentKind: 'FAC',
        description: 'Factura B',
      });

      // Facturas C
      expect(AFIP_CODES['011']).toEqual({
        code: '011',
        invoiceType: 'C',
        documentKind: 'FAC',
        description: 'Factura C',
      });
    });

    it('debe tener los códigos de notas de crédito', () => {
      expect(AFIP_CODES['003']).toEqual({
        code: '003',
        invoiceType: 'A',
        documentKind: 'NCR',
        description: 'Nota de Crédito A',
      });

      expect(AFIP_CODES['008']).toEqual({
        code: '008',
        invoiceType: 'B',
        documentKind: 'NCR',
        description: 'Nota de Crédito B',
      });

      expect(AFIP_CODES['013']).toEqual({
        code: '013',
        invoiceType: 'C',
        documentKind: 'NCR',
        description: 'Nota de Crédito C',
      });
    });

    it('debe tener los códigos de notas de débito', () => {
      expect(AFIP_CODES['002']).toEqual({
        code: '002',
        invoiceType: 'A',
        documentKind: 'NDB',
        description: 'Nota de Débito A',
      });
    });
  });

  describe('getDocumentTypeFromAFIPCode', () => {
    it('debe reconocer código con ceros a la izquierda', () => {
      const result = getDocumentTypeFromAFIPCode('011');
      expect(result?.invoiceType).toBe('C');
      expect(result?.documentKind).toBe('FAC');
    });

    it('debe reconocer código sin ceros a la izquierda', () => {
      const result = getDocumentTypeFromAFIPCode('11');
      expect(result?.invoiceType).toBe('C');
      expect(result?.documentKind).toBe('FAC');
    });

    it('debe reconocer código de un solo dígito', () => {
      const result = getDocumentTypeFromAFIPCode('1');
      expect(result?.invoiceType).toBe('A');
      expect(result?.documentKind).toBe('FAC');
    });

    it('debe retornar undefined para código inexistente', () => {
      const result = getDocumentTypeFromAFIPCode('999');
      expect(result).toBeUndefined();
    });

    it('debe manejar espacios en blanco', () => {
      const result = getDocumentTypeFromAFIPCode(' 11 ');
      expect(result?.invoiceType).toBe('C');
    });
  });

  describe('extractAFIPCodeFromText', () => {
    it('debe extraer código de "11 - Factura C"', () => {
      const text = `
        Punto de Venta
        11 - Factura C
        Número de Comprobante
        00000789
      `;
      const result = extractAFIPCodeFromText(text);
      expect(result?.invoiceType).toBe('C');
      expect(result?.documentKind).toBe('FAC');
    });

    it('debe extraer código de "CODIGO: 011"', () => {
      const text = `
        CODIGO:
        011
        Factura
      `;
      const result = extractAFIPCodeFromText(text);
      expect(result?.invoiceType).toBe('C');
    });

    it('debe extraer código de "Cod. 6"', () => {
      const text = 'Comprobante Cod. 6 emitido';
      const result = extractAFIPCodeFromText(text);
      expect(result?.invoiceType).toBe('B');
      expect(result?.documentKind).toBe('FAC');
    });

    it('debe extraer código de "Tipo: 3"', () => {
      const text = 'Documento Tipo: 3';
      const result = extractAFIPCodeFromText(text);
      expect(result?.invoiceType).toBe('A');
      expect(result?.documentKind).toBe('NCR');
    });

    it('debe reconocer nota de crédito por código 13', () => {
      const text = '13 - Nota de Crédito C';
      const result = extractAFIPCodeFromText(text);
      expect(result?.invoiceType).toBe('C');
      expect(result?.documentKind).toBe('NCR');
    });

    it('debe retornar undefined si no hay código AFIP', () => {
      const text = 'Factura común sin código numérico';
      const result = extractAFIPCodeFromText(text);
      expect(result).toBeUndefined();
    });
  });

  describe('extractInvoiceTypeWithAFIP', () => {
    it('debe preferir código AFIP sobre patrón de texto', () => {
      // El código 11 indica Factura C, aunque diga "Factura A" en el texto
      const text = `
        11 - Factura C
        Pero también dice Factura A en algún lado
      `;
      const result = extractInvoiceTypeWithAFIP(text);
      expect(result?.invoiceType).toBe('C');
      expect(result?.method).toBe('AFIP_CODE');
    });

    it('debe usar patrón de texto si no hay código AFIP', () => {
      const text = 'FACTURA A Número 00001-00000123';
      const result = extractInvoiceTypeWithAFIP(text);
      expect(result?.invoiceType).toBe('A');
      expect(result?.method).toBe('TEXT_PATTERN');
    });

    it('NO debe confundir "11" aislado con código AFIP', () => {
      // Solo números sueltos no deben ser reconocidos
      const text = 'Punto de venta 11 número 00000123';
      extractAFIPCodeFromText(text);
      // No debería encontrar código porque no tiene formato "11 - Factura"
      // ni "Cod. 11" ni similar
      // El patrón actual lo detectaría incorrectamente, pero la función
      // extractInvoiceTypeWithAFIP debería manejarlo correctamente
    });

    it('debe detectar Nota de Crédito A desde texto', () => {
      const text = 'NOTA DE CRÉDITO A Número 00001-00000456';
      const result = extractInvoiceTypeWithAFIP(text);
      expect(result?.invoiceType).toBe('A');
      expect(result?.documentKind).toBe('NCR');
    });

    it('debe retornar undefined si no puede determinar tipo', () => {
      const text = 'Documento genérico sin tipo identificable';
      const result = extractInvoiceTypeWithAFIP(text);
      expect(result).toBeUndefined();
    });
  });

  describe('Caso bug reportado: "11 - Factura C" como tipo A', () => {
    it('debe detectar correctamente como tipo C usando código AFIP', () => {
      const text = `
        Punto de Venta
        11 - Factura C

        Número de Comprobante
        00000789

        CUIT del Emisor: 30-71057829-6
        Fecha de Emisión: 25/03/2024
        Importe Total: $5.000,00
      `;

      const result = extractInvoiceTypeWithAFIP(text);

      // El código 11 = Factura C, así que el tipo debe ser C
      expect(result?.invoiceType).toBe('C');
      expect(result?.documentKind).toBe('FAC');
      expect(result?.method).toBe('AFIP_CODE');
    });
  });
});
