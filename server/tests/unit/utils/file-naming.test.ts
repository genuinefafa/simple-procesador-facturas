/**
 * Tests para utilidades de nombres de archivo
 *
 * Nuevo formato:
 * - Directorio: yyyy-mm
 * - Nombre: yyyy-mm-dd Nombre_Emisor CUIT TIPO PV NUM.ext
 */

import { describe, it, expect } from 'vitest';
import {
  getShortestName,
  sanitizeFilename,
  sanitizeFilenameReadable,
  getComprobanteCode,
  getDocumentTypeCode,
  padNumber,
  formatDateForFilename,
  generateProcessedFilename,
  generateSubdirectory,
  generateProcessedPath,
} from '../../../utils/file-naming';
import type { Emitter } from '../../../utils/types';

describe('file-naming utils', () => {
  describe('sanitizeFilename (legacy)', () => {
    it('debe convertir a minúsculas', () => {
      expect(sanitizeFilename('ANDEREGGEN')).toBe('andereggen');
    });

    it('debe reemplazar espacios por guión bajo', () => {
      expect(sanitizeFilename('Seguros La Segunda')).toBe('seguros_la_segunda');
    });

    it('debe eliminar acentos', () => {
      expect(sanitizeFilename('José María')).toBe('jose_maria');
    });
  });

  describe('sanitizeFilenameReadable', () => {
    it('debe mantener mayúsculas/minúsculas', () => {
      expect(sanitizeFilenameReadable('ANDEREGGEN')).toBe('ANDEREGGEN');
      expect(sanitizeFilenameReadable('Seguros')).toBe('Seguros');
    });

    it('debe reemplazar espacios por guión bajo', () => {
      expect(sanitizeFilenameReadable('Seguros La Segunda')).toBe('Seguros_La_Segunda');
    });

    it('debe eliminar acentos', () => {
      expect(sanitizeFilenameReadable('José María')).toBe('Jose_Maria');
    });

    it('debe eliminar caracteres especiales', () => {
      expect(sanitizeFilenameReadable('ABC & Co. S.A.')).toBe('ABC_Co_SA');
    });

    it('debe normalizar múltiples espacios', () => {
      expect(sanitizeFilenameReadable('ABC   XYZ')).toBe('ABC_XYZ');
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

      expect(getShortestName(emitter)).toBe('Juan_Perez');
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

      expect(getShortestName(emitter)).toBe('Seguros');
    });
  });

  describe('getComprobanteCode (legacy)', () => {
    it('debe mapear tipo A a FACA', () => {
      expect(getComprobanteCode('A')).toBe('FACA');
    });

    it('debe mapear tipo B a FACB', () => {
      expect(getComprobanteCode('B')).toBe('FACB');
    });

    it('debe generar código genérico para tipos no mapeados', () => {
      expect(getComprobanteCode('X')).toBe('FACX');
    });
  });

  describe('getDocumentTypeCode', () => {
    it('debe retornar friendlyType para códigos ARCA válidos', () => {
      expect(getDocumentTypeCode(1)).toBe('FACA'); // Factura A
      expect(getDocumentTypeCode(6)).toBe('FACB'); // Factura B
      expect(getDocumentTypeCode(11)).toBe('FACC'); // Factura C
      expect(getDocumentTypeCode(3)).toBe('NCRA'); // Nota de Crédito A
      expect(getDocumentTypeCode(8)).toBe('NCRB'); // Nota de Crédito B
      expect(getDocumentTypeCode(2)).toBe('NDBA'); // Nota de Débito A
    });

    it('debe retornar UNKN para códigos inválidos', () => {
      expect(getDocumentTypeCode(null)).toBe('UNKN');
      expect(getDocumentTypeCode(undefined)).toBe('UNKN');
      expect(getDocumentTypeCode(999)).toBe('UNKN');
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

  describe('generateSubdirectory', () => {
    it('debe generar subdirectorio yyyy-mm', () => {
      const date = new Date(2024, 0, 15); // Enero 2024
      expect(generateSubdirectory(date)).toBe('2024-01');
    });

    it('debe agregar cero al mes', () => {
      const date = new Date(2024, 8, 1); // Septiembre 2024
      expect(generateSubdirectory(date)).toBe('2024-09');
    });

    it('debe manejar diciembre correctamente', () => {
      const date = new Date(2024, 11, 31); // Diciembre 2024
      expect(generateSubdirectory(date)).toBe('2024-12');
    });
  });

  describe('generateProcessedFilename', () => {
    it('debe generar nombre correcto con formato nuevo (con categoría)', () => {
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

      const filename = generateProcessedFilename(
        issueDate,
        emitter,
        1, // Código ARCA para Factura A
        3,
        3668,
        'factura.pdf',
        '3f' // Categoría
      );

      // Formato: yyyy-mm-dd Nombre_Emisor CUIT TIPO PV-NUM [cat].ext
      expect(filename).toBe('2023-02-14 oscar 20-13046568-5 FACA 00003-00003668 [3f].pdf');
    });

    it('debe generar nombre sin categoría cuando no se provee', () => {
      const issueDate = new Date(2023, 1, 14);
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

      const filename = generateProcessedFilename(
        issueDate,
        emitter,
        1, // Código ARCA para Factura A
        3,
        3668,
        'factura.pdf'
        // Sin categoría
      );

      // Formato: yyyy-mm-dd Nombre_Emisor CUIT TIPO PV-NUM [].ext
      expect(filename).toBe('2023-02-14 oscar 20-13046568-5 FACA 00003-00003668 [].pdf');
    });

    it('debe preservar la extensión del archivo original', () => {
      const issueDate = new Date(2023, 4, 20); // Mes 4 = Mayo
      const emitter: Emitter = {
        cuit: '30-50001770-4',
        cuitNumeric: '30500017704',
        name: 'Seguros La Segunda',
        aliases: ['Seguros'],
        active: true,
        totalInvoices: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const filename = generateProcessedFilename(
        issueDate,
        emitter,
        6, // Código ARCA para Factura B
        124,
        17649,
        'original.tif'
      );

      expect(filename).toBe('2023-05-20 Seguros 30-50001770-4 FACB 00124-00017649 [].tif');
    });

    it('debe manejar Nota de Crédito A', () => {
      const issueDate = new Date(2024, 11, 31); // Diciembre 2024
      const emitter: Emitter = {
        cuit: '20-12345678-9',
        cuitNumeric: '20123456789',
        name: 'Test Empresa',
        aliases: [],
        active: true,
        totalInvoices: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const filename = generateProcessedFilename(
        issueDate,
        emitter,
        3, // Código ARCA para Nota de Crédito A
        99999,
        1,
        'test.pdf',
        'sw' // Categoría software
      );

      expect(filename).toBe('2024-12-31 Test_Empresa 20-12345678-9 NCRA 99999-00000001 [sw].pdf');
    });

    it('debe manejar Nota de Débito B', () => {
      const issueDate = new Date(2024, 5, 15); // Junio 2024
      const emitter: Emitter = {
        cuit: '30-99999999-9',
        cuitNumeric: '30999999999',
        name: 'Proveedor',
        aliases: [],
        active: true,
        totalInvoices: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const filename = generateProcessedFilename(
        issueDate,
        emitter,
        7, // Código ARCA para Nota de Débito B
        1,
        12345678,
        'nota.pdf'
      );

      expect(filename).toBe('2024-06-15 Proveedor 30-99999999-9 NDBB 00001-12345678 [].pdf');
    });
  });

  describe('generateProcessedPath', () => {
    it('debe generar ruta completa con subdirectorio', () => {
      const issueDate = new Date(2024, 0, 15); // Enero 2024
      const emitter: Emitter = {
        cuit: '20-12345678-9',
        cuitNumeric: '20123456789',
        name: 'Empresa',
        aliases: [],
        active: true,
        totalInvoices: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const fullPath = generateProcessedPath(
        '/data/processed',
        issueDate,
        emitter,
        1, // Código ARCA para Factura A
        1,
        100,
        'doc.pdf',
        '3f' // Categoría
      );

      // Formato: /baseDir/yyyy-mm/yyyy-mm-dd Nombre CUIT TIPO PV-NUM [cat].ext
      expect(fullPath).toBe(
        '/data/processed/2024-01/2024-01-15 Empresa 20-12345678-9 FACA 00001-00000100 [3f].pdf'
      );
    });

    it('debe generar ruta con categoría vacía si no se provee', () => {
      const issueDate = new Date(2024, 0, 15);
      const emitter: Emitter = {
        cuit: '20-12345678-9',
        cuitNumeric: '20123456789',
        name: 'Empresa',
        aliases: [],
        active: true,
        totalInvoices: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const fullPath = generateProcessedPath(
        '/data/processed',
        issueDate,
        emitter,
        1, // Código ARCA para Factura A
        1,
        100,
        'doc.pdf'
        // Sin categoría
      );

      // Formato: /baseDir/yyyy-mm/yyyy-mm-dd Nombre CUIT TIPO PV-NUM [].ext
      expect(fullPath).toBe(
        '/data/processed/2024-01/2024-01-15 Empresa 20-12345678-9 FACA 00001-00000100 [].pdf'
      );
    });
  });
});
