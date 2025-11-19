/**
 * Tests para utilidades de nombres de archivo
 */

import { describe, it, expect } from 'vitest';
import {
  getShortestName,
  sanitizeFilename,
  getComprobanteCode,
  padNumber,
  formatDateForFilename,
  generateProcessedFilename,
} from '../../../utils/file-naming';
import type { Emitter } from '../../../utils/types';

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

  describe('formatDateForFilename', () => {
    it('debe formatear fecha correctamente', () => {
      const date = new Date(2023, 1, 14); // Mes 1 = Febrero
      expect(formatDateForFilename(date)).toBe('2023-02-14');
    });

    it('debe agregar ceros a mes y día', () => {
      const date = new Date(2023, 0, 5); // Mes 0 = Enero
      expect(formatDateForFilename(date)).toBe('2023-01-05');
    });
  });

  describe('generateProcessedFilename', () => {
    it('debe generar nombre correcto con todos los componentes', () => {
      const issueDate = new Date(2023, 1, 14); // Mes 1 = Febrero
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

      const filename = generateProcessedFilename(issueDate, emitter, 'A', 3, 3668, 'factura.pdf');

      expect(filename).toBe('2023-02-14_20-13046568-5_oscar_faca_00003_00003668.pdf');
    });

    it('debe preservar la extensión del archivo original', () => {
      const issueDate = new Date(2023, 4, 20); // Mes 4 = Mayo
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

      const filename = generateProcessedFilename(
        issueDate,
        emitter,
        'B',
        124,
        17649,
        'original.tif'
      );

      expect(filename).toBe('2023-05-20_30-50001770-4_seguros_facb_00124_00017649.tif');
    });

    it('debe manejar punto de venta de 5 dígitos', () => {
      const issueDate = new Date(2024, 11, 31); // Mes 11 = Diciembre
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

      const filename = generateProcessedFilename(issueDate, emitter, 'C', 99999, 1, 'test.pdf');

      expect(filename).toBe('2024-12-31_20-12345678-9_test_facc_99999_00000001.pdf');
    });
  });
});
