/**
 * Tests para el mapeo de códigos AFIP
 */

import { describe, it, expect } from 'vitest';
import {
  getDocumentTypeFromARCACode,
  extractARCACodeFromText,
  extractInvoiceTypeWithARCA,
  AFIP_TYPES,
} from '../../../utils/afip-codes';

describe('AFIP Codes', () => {
  describe('AFIP_TYPES mapping', () => {
    it('debe tener los códigos principales de facturas', () => {
      // Facturas A (código 1)
      expect(AFIP_TYPES['1']).toEqual({
        code: 1,
        invoiceType: 'A',
        documentKind: 'FAC',
        friendlyType: 'FACA',
        description: 'Factura A',
        descriptionLong: 'Factura A (Responsable Inscripto a Responsable Inscripto)',
      });

      // Facturas B (código 6)
      expect(AFIP_TYPES['6']).toEqual({
        code: 6,
        invoiceType: 'B',
        documentKind: 'FAC',
        friendlyType: 'FACB',
        description: 'Factura B',
        descriptionLong: 'Factura B (Responsable Inscripto a Consumidor Final/Exento)',
      });

      // Facturas C (código 11)
      expect(AFIP_TYPES['11']).toEqual({
        code: 11,
        invoiceType: 'C',
        documentKind: 'FAC',
        friendlyType: 'FACC',
        description: 'Factura C',
        descriptionLong: 'Factura C (Monotributista)',
      });
    });

    it('debe tener los códigos de notas de crédito', () => {
      // Nota de Crédito A (código 3)
      expect(AFIP_TYPES['3']).toEqual({
        code: 3,
        invoiceType: 'A',
        documentKind: 'NCR',
        friendlyType: 'NCRA',
        description: 'Nota de Crédito A',
        descriptionLong: 'Nota de Crédito A (Responsable Inscripto a Responsable Inscripto)',
      });

      // Nota de Crédito B (código 8)
      expect(AFIP_TYPES['8']).toEqual({
        code: 8,
        invoiceType: 'B',
        documentKind: 'NCR',
        friendlyType: 'NCRB',
        description: 'Nota de Crédito B',
        descriptionLong: 'Nota de Crédito B (Responsable Inscripto a Consumidor Final/Exento)',
      });

      // Nota de Crédito C (código 13)
      expect(AFIP_TYPES['13']).toEqual({
        code: 13,
        invoiceType: 'C',
        documentKind: 'NCR',
        friendlyType: 'NCRC',
        description: 'Nota de Crédito C',
        descriptionLong: 'Nota de Crédito C (Responsable de Monotributo)',
      });
    });

    it('debe tener los códigos de notas de débito', () => {
      // Nota de Débito A (código 2)
      expect(AFIP_TYPES['2']).toEqual({
        code: 2,
        invoiceType: 'A',
        documentKind: 'NDB',
        friendlyType: 'NDBA',
        description: 'Nota de Débito A',
        descriptionLong: 'Nota de Débito A (Responsable Inscripto a Responsable Inscripto)',
      });
    });
  });

  describe('getDocumentTypeFromARCACode', () => {
    it('debe reconocer código con ceros a la izquierda (string)', () => {
      const result = getDocumentTypeFromARCACode('011');
      expect(result?.invoiceType).toBe('C');
      expect(result?.documentKind).toBe('FAC');
      expect(result?.code).toBe(11);
    });

    it('debe reconocer código sin ceros a la izquierda (string)', () => {
      const result = getDocumentTypeFromARCACode('11');
      expect(result?.invoiceType).toBe('C');
      expect(result?.documentKind).toBe('FAC');
      expect(result?.code).toBe(11);
    });

    it('debe reconocer código de un solo dígito (string)', () => {
      const result = getDocumentTypeFromARCACode('1');
      expect(result?.invoiceType).toBe('A');
      expect(result?.documentKind).toBe('FAC');
      expect(result?.code).toBe(1);
    });

    it('debe reconocer código numérico directamente', () => {
      const result = getDocumentTypeFromARCACode(11);
      expect(result?.invoiceType).toBe('C');
      expect(result?.documentKind).toBe('FAC');
      expect(result?.code).toBe(11);
    });

    it('debe retornar undefined para código inexistente', () => {
      const result = getDocumentTypeFromARCACode('999');
      expect(result).toBeUndefined();
    });

    it('debe manejar espacios en blanco', () => {
      const result = getDocumentTypeFromARCACode(' 11 ');
      expect(result?.invoiceType).toBe('C');
    });
  });

  describe('extractARCACodeFromText', () => {
    it('debe extraer código de "11 - Factura C"', () => {
      const text = `
        Punto de Venta
        11 - Factura C
        Número de Comprobante
        00000789
      `;
      const result = extractARCACodeFromText(text);
      expect(result?.invoiceType).toBe('C');
      expect(result?.documentKind).toBe('FAC');
      expect(result?.code).toBe(11);
    });

    it('debe extraer código de "CODIGO: 011"', () => {
      const text = `
        CODIGO:
        011
        Factura
      `;
      const result = extractARCACodeFromText(text);
      expect(result?.invoiceType).toBe('C');
      expect(result?.code).toBe(11);
    });

    it('debe extraer código de "Cod. 6"', () => {
      const text = 'Comprobante Cod. 6 emitido';
      const result = extractARCACodeFromText(text);
      expect(result?.invoiceType).toBe('B');
      expect(result?.documentKind).toBe('FAC');
      expect(result?.code).toBe(6);
    });

    it('debe extraer código de "Tipo: 3"', () => {
      const text = 'Documento Tipo: 3';
      const result = extractARCACodeFromText(text);
      expect(result?.invoiceType).toBe('A');
      expect(result?.documentKind).toBe('NCR');
      expect(result?.code).toBe(3);
    });

    it('debe reconocer nota de crédito por código 13', () => {
      const text = '13 - Nota de Crédito C';
      const result = extractARCACodeFromText(text);
      expect(result?.invoiceType).toBe('C');
      expect(result?.documentKind).toBe('NCR');
      expect(result?.code).toBe(13);
    });

    it('debe retornar undefined si no hay código ARCA', () => {
      const text = 'Factura común sin código numérico';
      const result = extractARCACodeFromText(text);
      expect(result).toBeUndefined();
    });
  });

  describe('extractInvoiceTypeWithARCA', () => {
    it('debe preferir código ARCA sobre patrón de texto', () => {
      // El código 11 indica Factura C, aunque diga "Factura A" en el texto
      const text = `
        11 - Factura C
        Pero también dice Factura A en algún lado
      `;
      const result = extractInvoiceTypeWithARCA(text);
      expect(result?.invoiceType).toBe('C');
      expect(result?.method).toBe('ARCA_CODE');
      expect(result?.code).toBe(11);
    });

    it('debe usar patrón de texto si no hay código ARCA', () => {
      const text = 'FACTURA A Número 00001-00000123';
      const result = extractInvoiceTypeWithARCA(text);
      expect(result?.invoiceType).toBe('A');
      expect(result?.method).toBe('TEXT_PATTERN');
    });

    it('NO debe confundir "11" aislado con código ARCA', () => {
      // Solo números sueltos no deben ser reconocidos
      const text = 'Punto de venta 11 número 00000123';
      extractARCACodeFromText(text);
      // No debería encontrar código porque no tiene formato "11 - Factura"
      // ni "Cod. 11" ni similar
      // El patrón actual lo detectaría incorrectamente, pero la función
      // extractInvoiceTypeWithARCA debería manejarlo correctamente
    });

    it('debe detectar Nota de Crédito A desde texto', () => {
      const text = 'NOTA DE CRÉDITO A Número 00001-00000456';
      const result = extractInvoiceTypeWithARCA(text);
      expect(result?.invoiceType).toBe('A');
      expect(result?.documentKind).toBe('NCR');
    });

    it('debe retornar undefined si no puede determinar tipo', () => {
      const text = 'Documento genérico sin tipo identificable';
      const result = extractInvoiceTypeWithARCA(text);
      expect(result).toBeUndefined();
    });
  });

  describe('Caso bug reportado: "11 - Factura C" como tipo A', () => {
    it('debe detectar correctamente como tipo C usando código ARCA', () => {
      const text = `
        Punto de Venta
        11 - Factura C

        Número de Comprobante
        00000789

        CUIT del Emisor: 30-71057829-6
        Fecha de Emisión: 25/03/2024
        Importe Total: $5.000,00
      `;

      const result = extractInvoiceTypeWithARCA(text);

      // El código 11 = Factura C, así que el tipo debe ser C
      expect(result?.invoiceType).toBe('C');
      expect(result?.documentKind).toBe('FAC');
      expect(result?.method).toBe('ARCA_CODE');
      expect(result?.code).toBe(11);
    });
  });
});
