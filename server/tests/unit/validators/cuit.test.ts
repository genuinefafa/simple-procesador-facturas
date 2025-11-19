/**
 * Tests para el validador de CUIT argentino
 */

import { describe, it, expect } from 'vitest';
import {
  validateCUIT,
  normalizeCUIT,
  extractCUITFromText,
  getPersonType,
} from '../../../validators/cuit';

describe('validateCUIT', () => {
  describe('debe validar CUITs correctos', () => {
    it('debe validar CUIT con guiones', () => {
      expect(validateCUIT('30-71057829-6')).toBe(true);
      expect(validateCUIT('20-12345678-6')).toBe(true);
      expect(validateCUIT('27-12345678-0')).toBe(true);
    });

    it('debe validar CUIT sin guiones', () => {
      expect(validateCUIT('30710578296')).toBe(true);
      expect(validateCUIT('20123456786')).toBe(true);
      expect(validateCUIT('27123456780')).toBe(true);
    });

    it('debe validar CUIT con espacios', () => {
      expect(validateCUIT('30 71057829 6')).toBe(true);
      expect(validateCUIT('20 12345678 6')).toBe(true);
    });

    it('debe validar diferentes formatos mezclados', () => {
      // Validar que funciona con cualquier formato
      expect(validateCUIT('30-71057829-6')).toBe(true);
      expect(validateCUIT('30 71057829 6')).toBe(true);
      expect(validateCUIT('30710578296')).toBe(true);
    });
  });

  describe('debe rechazar CUITs inválidos', () => {
    it('debe rechazar CUIT con dígito verificador incorrecto', () => {
      expect(validateCUIT('30-71057829-5')).toBe(false);
      expect(validateCUIT('20-12345678-0')).toBe(false);
    });

    it('debe rechazar CUIT con longitud incorrecta', () => {
      expect(validateCUIT('30-7105782-6')).toBe(false); // 10 dígitos
      expect(validateCUIT('30-710578290-6')).toBe(false); // 12 dígitos
      expect(validateCUIT('123')).toBe(false);
    });

    it('debe rechazar CUIT con caracteres no numéricos', () => {
      expect(validateCUIT('30-7105782A-6')).toBe(false);
      expect(validateCUIT('XX-71057829-6')).toBe(false);
      expect(validateCUIT('30-71057829-X')).toBe(false);
    });

    it('debe rechazar strings vacíos', () => {
      expect(validateCUIT('')).toBe(false);
    });
  });
});

describe('normalizeCUIT', () => {
  it('debe normalizar CUIT sin guiones', () => {
    expect(normalizeCUIT('30710578296')).toBe('30-71057829-6');
    expect(normalizeCUIT('20123456786')).toBe('20-12345678-6');
  });

  it('debe mantener CUIT ya normalizado', () => {
    expect(normalizeCUIT('30-71057829-6')).toBe('30-71057829-6');
  });

  it('debe normalizar CUIT con espacios', () => {
    expect(normalizeCUIT('30 71057829 6')).toBe('30-71057829-6');
  });

  it('debe lanzar error para CUIT inválido por longitud', () => {
    expect(() => normalizeCUIT('123')).toThrow('CUIT inválido');
    expect(() => normalizeCUIT('30-7105782-6')).toThrow('CUIT inválido');
  });

  it('debe lanzar error para CUIT con DV incorrecto', () => {
    expect(() => normalizeCUIT('30-71057829-5')).toThrow('dígito verificador incorrecto');
  });

  it('debe lanzar error para CUIT con caracteres no numéricos', () => {
    expect(() => normalizeCUIT('30-7105782A-6')).toThrow('CUIT inválido');
  });
});

describe('extractCUITFromText', () => {
  it('debe extraer CUIT de texto simple', () => {
    const text = 'CUIT: 30-71057829-6';
    const result = extractCUITFromText(text);
    expect(result).toEqual(['30-71057829-6']);
  });

  it('debe extraer CUIT sin etiqueta', () => {
    const text = 'El número es 30-71057829-6 y es válido';
    const result = extractCUITFromText(text);
    expect(result).toEqual(['30-71057829-6']);
  });

  it('debe extraer CUIT sin guiones', () => {
    const text = 'CUIT 30710578296';
    const result = extractCUITFromText(text);
    expect(result).toEqual(['30-71057829-6']);
  });

  it('debe extraer múltiples CUITs', () => {
    const text = 'Emisor: 30-71057829-6 y Receptor: 20-12345678-6';
    const result = extractCUITFromText(text);
    expect(result).toHaveLength(2);
    expect(result).toContain('30-71057829-6');
    expect(result).toContain('20-12345678-6');
  });

  it('debe ignorar CUITs inválidos', () => {
    const text = 'CUIT válido: 30-71057829-6 e inválido: 30-71057829-5';
    const result = extractCUITFromText(text);
    expect(result).toEqual(['30-71057829-6']);
  });

  it('debe retornar array vacío si no hay CUITs', () => {
    const text = 'Este texto no contiene CUITs válidos';
    const result = extractCUITFromText(text);
    expect(result).toEqual([]);
  });

  it('debe extraer CUITs de texto de factura típico', () => {
    const text = `
      FACTURA A
      Razón Social: Empresa SA
      CUIT: 30-71057829-6
      Fecha: 12/11/2025
    `;
    const result = extractCUITFromText(text);
    expect(result).toEqual(['30-71057829-6']);
  });

  it('no debe duplicar CUITs', () => {
    const text = 'CUIT: 30-71057829-6 y nuevamente 30-71057829-6';
    const result = extractCUITFromText(text);
    expect(result).toHaveLength(1);
    expect(result).toEqual(['30-71057829-6']);
  });
});

describe('getPersonType', () => {
  it('debe identificar personas físicas (prefijo 20)', () => {
    expect(getPersonType('20-12345678-6')).toBe('FISICA');
    expect(getPersonType('20123456786')).toBe('FISICA');
  });

  it('debe identificar personas físicas (prefijo 23)', () => {
    expect(getPersonType('23-12345678-5')).toBe('FISICA');
  });

  it('debe identificar personas físicas (prefijo 24)', () => {
    expect(getPersonType('24-12345678-1')).toBe('FISICA');
  });

  it('debe identificar personas físicas (prefijo 27)', () => {
    expect(getPersonType('27-12345678-0')).toBe('FISICA');
  });

  it('debe identificar personas jurídicas (prefijo 30)', () => {
    expect(getPersonType('30-71057829-6')).toBe('JURIDICA');
    expect(getPersonType('30710578296')).toBe('JURIDICA');
  });

  it('debe identificar personas jurídicas (prefijo 33)', () => {
    expect(getPersonType('33-12345678-0')).toBe('JURIDICA');
  });

  it('debe identificar personas jurídicas (prefijo 34)', () => {
    expect(getPersonType('34-12345678-7')).toBe('JURIDICA');
  });

  it('debe retornar null para prefijos desconocidos', () => {
    expect(getPersonType('99-12345678-9')).toBe(null);
    expect(getPersonType('10-12345678-0')).toBe(null);
  });

  it('debe funcionar con CUIT con espacios', () => {
    expect(getPersonType('30 71057829 6')).toBe('JURIDICA');
  });
});
