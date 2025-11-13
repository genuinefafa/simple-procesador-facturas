/**
 * Tests para utilidades de nombres de archivo
 */

import { describe, it, expect } from 'vitest';
import {
  getShortestName,
  sanitizeFilename,
  getComprobanteCode,
  padNumber,
  generateProcessedFilename,
} from '../../../src/utils/file-naming';
import type { Emitter } from '../../../src/utils/types';

describe('file-naming utils', () => {
  describe('sanitizeFilename', () => {
    it('debe convertir a minúsculas', () => {
      expect(sanitizeFilename('ANDEREGGEN')).toBe('andereggen');
    });

    it('debe reemplazar espacios por guión bajo', () => {
      expect(sanitizeFilename('Seguros La Segunda')).toBe('seguros_la_segunda');
    });

    it('debe eliminar acentos', () => {
      expect(sanitizeFilename('José María')).toBe('jose_maria');
    });

    it('debe eliminar caracteres especiales', () => {
      expect(sanitizeFilename('ABC & Co. S.A.')).toBe('abc_co_sa');
    });

    it('debe normalizar múltiples espacios', () => {
      expect(sanitizeFilename('ABC   XYZ')).toBe('abc_xyz');
    });
  });

  describe('getShortestName', () => {
    it('debe retornar el nombre si no hay aliases', () => {
      const emitter: Emitter = {
        cuit: '20-12345678-9',
        cuitNumeric: '20123456789',
        name: 'Juan Pérez',
        aliases: [],
        active: true,
        totalInvoices: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(getShortestName(emitter)).toBe('juan_perez');
    });

    it('debe retornar el alias más corto', () => {
      const emitter: Emitter = {
        cuit: '20-13046568-5',
        cuitNumeric: '20130465685',
        name: 'OSCAR ALFREDO ANDEREGGEN',
        aliases: ['andereggen', 'oscar'],
        active: true,
        totalInvoices: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(getShortestName(emitter)).toBe('oscar');
    });

    it('debe retornar el nombre si es más corto que los aliases', () => {
      const emitter: Emitter = {
        cuit: '30-50001770-4',
        cuitNumeric: '30500017704',
        name: 'Seguros',
        aliases: ['seguros-la-segunda', 'lasegunda'],
        active: true,
        totalInvoices: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(getShortestName(emitter)).toBe('seguros');
    });
  });

  describe('getComprobanteCode', () => {
    it('debe mapear tipo A a faca', () => {
      expect(getComprobanteCode('A')).toBe('faca');
    });

    it('debe mapear tipo B a facb', () => {
      expect(getComprobanteCode('B')).toBe('facb');
    });

    it('debe mapear tipo C a facc', () => {
      expect(getComprobanteCode('C')).toBe('facc');
    });

    it('debe generar código genérico para tipos no mapeados', () => {
      expect(getComprobanteCode('X')).toBe('facx');
    });
  });

  describe('padNumber', () => {
    it('debe agregar ceros a la izquierda', () => {
      expect(padNumber(3, 5)).toBe('00003');
      expect(padNumber(3668, 8)).toBe('00003668');
    });

    it('debe mantener el número si ya tiene el ancho correcto', () => {
      expect(padNumber(12345, 5)).toBe('12345');
    });
  });

  describe('generateProcessedFilename', () => {
    it('debe generar nombre correcto con todos los componentes', () => {
      const emitter: Emitter = {
        cuit: '20-13046568-5',
        cuitNumeric: '20130465685',
        name: 'OSCAR ALFREDO ANDEREGGEN',
        aliases: ['andereggen', 'oscar'],
        active: true,
        totalInvoices: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const filename = generateProcessedFilename(emitter, 'A', 3, 3668, 'factura.pdf');

      expect(filename).toBe('oscar_faca_00003_00003668.pdf');
    });

    it('debe preservar la extensión del archivo original', () => {
      const emitter: Emitter = {
        cuit: '30-50001770-4',
        cuitNumeric: '30500017704',
        name: 'Seguros La Segunda',
        aliases: ['seguros'],
        active: true,
        totalInvoices: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const filename = generateProcessedFilename(emitter, 'B', 124, 17649, 'original.tif');

      expect(filename).toBe('seguros_facb_00124_00017649.tif');
    });

    it('debe manejar punto de venta de 5 dígitos', () => {
      const emitter: Emitter = {
        cuit: '20-12345678-9',
        cuitNumeric: '20123456789',
        name: 'Test',
        aliases: [],
        active: true,
        totalInvoices: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const filename = generateProcessedFilename(emitter, 'C', 99999, 1, 'test.pdf');

      expect(filename).toBe('test_facc_99999_00000001.pdf');
    });
  });
});
