/**
 * Test para verificar el parsing de tipos de factura
 * Valida que el regex extraiga correctamente la letra del tipo
 */

describe('Invoice Type Parsing', () => {
  function parseInvoiceType(input: string): string {
    const invoiceType = input.trim().toUpperCase();

    // Estrategia: buscar la letra DESPUÉS de "FACTURA" o "FC" o "NC", o al final del string
    let typeMatch = invoiceType.match(/(?:FACTURA|FC|NC)\s+([ABCEMX])/);
    if (typeMatch && typeMatch[1]) {
      return typeMatch[1];
    } else {
      // Si no hay "Factura X", buscar letra sola o al final
      typeMatch = invoiceType.match(/\b([ABCEMX])\b/);
      if (typeMatch && typeMatch[1]) {
        return typeMatch[1];
      } else {
        throw new Error(`No se pudo detectar tipo de factura en: "${invoiceType}"`);
      }
    }
  }

  describe('Formato ARCA/AFIP completo', () => {
    test('debe parsear "1 - Factura A" correctamente', () => {
      expect(parseInvoiceType('1 - Factura A')).toBe('A');
    });

    test('debe parsear "6 - Factura B" correctamente', () => {
      expect(parseInvoiceType('6 - Factura B')).toBe('B');
    });

    test('debe parsear "11 - Factura C" correctamente', () => {
      expect(parseInvoiceType('11 - Factura C')).toBe('C');
    });

    test('debe parsear "3 - Nota de Crédito A" (abreviado NC A)', () => {
      expect(parseInvoiceType('3 - NC A')).toBe('A');
    });

    test('debe parsear "8 - Nota de Crédito B" (abreviado NC B)', () => {
      expect(parseInvoiceType('8 - NC B')).toBe('B');
    });

    test('debe parsear "13 - Nota de Crédito C" (abreviado NC C)', () => {
      expect(parseInvoiceType('13 - NC C')).toBe('C');
    });
  });

  describe('Formato simplificado', () => {
    test('debe parsear "Factura A" sin código', () => {
      expect(parseInvoiceType('Factura A')).toBe('A');
    });

    test('debe parsear "Factura B" sin código', () => {
      expect(parseInvoiceType('Factura B')).toBe('B');
    });

    test('debe parsear "Factura C" sin código', () => {
      expect(parseInvoiceType('Factura C')).toBe('C');
    });

    test('debe parsear "FC A" (abreviado)', () => {
      expect(parseInvoiceType('FC A')).toBe('A');
    });
  });

  describe('Solo letra', () => {
    test('debe parsear "A" sola', () => {
      expect(parseInvoiceType('A')).toBe('A');
    });

    test('debe parsear "B" sola', () => {
      expect(parseInvoiceType('B')).toBe('B');
    });

    test('debe parsear "C" sola', () => {
      expect(parseInvoiceType('C')).toBe('C');
    });
  });

  describe('Otros tipos válidos', () => {
    test('debe parsear "Factura E" (exportación)', () => {
      expect(parseInvoiceType('Factura E')).toBe('E');
    });

    test('debe parsear "Factura M" (monotributo)', () => {
      expect(parseInvoiceType('Factura M')).toBe('M');
    });

    test('debe parsear "Factura X" (especial)', () => {
      expect(parseInvoiceType('Factura X')).toBe('X');
    });
  });

  describe('Casos inválidos', () => {
    test('debe fallar con "11 - Factura" sin letra', () => {
      expect(() => parseInvoiceType('11 - Factura')).toThrow();
    });

    test('debe fallar con "Factura Z" (tipo inválido)', () => {
      expect(() => parseInvoiceType('Factura Z')).toThrow();
    });

    test('debe fallar con string vacío', () => {
      expect(() => parseInvoiceType('')).toThrow();
    });
  });

  describe('Case insensitivity', () => {
    test('debe parsear "factura a" en minúsculas', () => {
      expect(parseInvoiceType('factura a')).toBe('A');
    });

    test('debe parsear "11 - factura c" mixto', () => {
      expect(parseInvoiceType('11 - factura c')).toBe('C');
    });
  });
});
