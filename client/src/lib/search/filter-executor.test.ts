import { describe, it, expect } from 'vitest';
import { createFilterMatcher } from './filter-executor';
import type { Comprobante } from '../../routes/api/comprobantes/+server';
import type { FilterNode } from './query-parser';

// Helper para crear comprobantes de prueba
function createTestComprobante(overrides: Partial<Comprobante> = {}): Comprobante {
  return {
    id: 'test:1',
    kind: 'factura',
    final: null,
    expected: null,
    file: null,
    emitterCuit: null,
    emitterName: null,
    ...overrides,
  };
}

describe('Filter Executor', () => {
  const categories = [
    { id: 1, description: 'Servicios' },
    { id: 2, description: 'Productos' },
  ];

  const matcher = createFilterMatcher(categories);

  describe('Emisor matching', () => {
    it('should match by emitter name (top-level)', () => {
      const comprobante = createTestComprobante({
        emitterName: 'Coto',
      });

      const filter: FilterNode = {
        type: 'emisor',
        value: 'coto',
        negate: false,
      };

      expect(matcher(comprobante, filter)).toBe(true);
    });

    it('should match by emitter name (case insensitive)', () => {
      const comprobante = createTestComprobante({
        emitterName: 'ACME Corporation',
      });

      const filter: FilterNode = {
        type: 'emisor',
        value: 'acme',
        negate: false,
      };

      expect(matcher(comprobante, filter)).toBe(true);
    });

    it('should NOT match incorrect emitter name', () => {
      const comprobante = createTestComprobante({
        emitterName: 'Walmart',
      });

      const filter: FilterNode = {
        type: 'emisor',
        value: 'coto',
        negate: false,
      };

      expect(matcher(comprobante, filter)).toBe(false);
    });

    it('should match by CUIT digits', () => {
      const comprobante = createTestComprobante({
        emitterCuit: '30-71084210-3',
      });

      const filter: FilterNode = {
        type: 'emisor',
        value: '30710842',
        negate: false,
      };

      expect(matcher(comprobante, filter)).toBe(true);
    });

    it('should NOT match non-digit query against CUIT', () => {
      const comprobante = createTestComprobante({
        emitterCuit: '30-71084210-3',
        emitterName: null,
      });

      const filter: FilterNode = {
        type: 'emisor',
        value: 'coto',
        negate: false,
      };

      // Should NOT match because "coto" has no digits
      expect(matcher(comprobante, filter)).toBe(false);
    });

    it('should match from final.emitterName fallback', () => {
      const comprobante = createTestComprobante({
        emitterName: null,
        final: {
          source: 'final',
          id: 1,
          cuit: '30-71084210-3',
          emitterName: 'Coto',
          issueDate: '2024-01-15',
          invoiceType: 6,
          pointOfSale: 1,
          invoiceNumber: 123,
          total: 1000,
        },
      });

      const filter: FilterNode = {
        type: 'emisor',
        value: 'coto',
        negate: false,
      };

      expect(matcher(comprobante, filter)).toBe(true);
    });

    it('should apply negation', () => {
      const comprobante = createTestComprobante({
        emitterName: 'Coto',
      });

      const filter: FilterNode = {
        type: 'emisor',
        value: 'coto',
        negate: true,
      };

      expect(matcher(comprobante, filter)).toBe(false);
    });
  });

  describe('Fecha matching', () => {
    it('should match exact date', () => {
      const comprobante = createTestComprobante({
        final: {
          source: 'final',
          id: 1,
          cuit: '30-71084210-3',
          issueDate: '2024-01-15',
          invoiceType: 6,
          pointOfSale: 1,
          invoiceNumber: 123,
          total: 1000,
        },
      });

      const filter: FilterNode = {
        type: 'fecha',
        operator: 'eq',
        value: new Date('2024-01-15T00:00:00'),
        negate: false,
      };

      expect(matcher(comprobante, filter)).toBe(true);
    });

    it('should match date > (greater than)', () => {
      const comprobante = createTestComprobante({
        final: {
          source: 'final',
          id: 1,
          cuit: '30-71084210-3',
          issueDate: '2024-02-15',
          invoiceType: 6,
          pointOfSale: 1,
          invoiceNumber: 123,
          total: 1000,
        },
      });

      const filter: FilterNode = {
        type: 'fecha',
        operator: 'gt',
        value: new Date('2024-01-31T00:00:00'), // End of January
        negate: false,
      };

      expect(matcher(comprobante, filter)).toBe(true);
    });

    it('should NOT match date <= when using >', () => {
      const comprobante = createTestComprobante({
        final: {
          source: 'final',
          id: 1,
          cuit: '30-71084210-3',
          issueDate: '2024-01-15',
          invoiceType: 6,
          pointOfSale: 1,
          invoiceNumber: 123,
          total: 1000,
        },
      });

      const filter: FilterNode = {
        type: 'fecha',
        operator: 'gt',
        value: new Date('2024-01-31T00:00:00'),
        negate: false,
      };

      expect(matcher(comprobante, filter)).toBe(false);
    });

    it('should match date range', () => {
      const comprobante = createTestComprobante({
        final: {
          source: 'final',
          id: 1,
          cuit: '30-71084210-3',
          issueDate: '2024-01-15',
          invoiceType: 6,
          pointOfSale: 1,
          invoiceNumber: 123,
          total: 1000,
        },
      });

      const filter: FilterNode = {
        type: 'fecha',
        operator: 'range',
        value: {
          start: new Date('2024-01-01T00:00:00'),
          end: new Date('2024-01-31T23:59:59'),
        },
        negate: false,
      };

      expect(matcher(comprobante, filter)).toBe(true);
    });

    it('should NOT match comprobante without date', () => {
      const comprobante = createTestComprobante({
        final: null,
        file: {
          id: 1,
          originalFilename: 'test.pdf',
          filePath: '/test.pdf',
          status: 'uploaded',
          extractedDate: null,
        },
      });

      const filter: FilterNode = {
        type: 'fecha',
        operator: 'eq',
        value: new Date('2024-01-15T00:00:00'),
        negate: false,
      };

      expect(matcher(comprobante, filter)).toBe(false);
    });
  });

  describe('Categoria matching', () => {
    it('should match by category name', () => {
      const comprobante = createTestComprobante({
        final: {
          source: 'final',
          id: 1,
          cuit: '30-71084210-3',
          issueDate: '2024-01-15',
          invoiceType: 6,
          pointOfSale: 1,
          invoiceNumber: 123,
          total: 1000,
          categoryId: 1, // Servicios
        },
      });

      const filter: FilterNode = {
        type: 'categoria',
        value: 'servicios',
        negate: false,
      };

      expect(matcher(comprobante, filter)).toBe(true);
    });

    it('should match categoria:sin for null category', () => {
      const comprobante = createTestComprobante({
        final: {
          source: 'final',
          id: 1,
          cuit: '30-71084210-3',
          issueDate: '2024-01-15',
          invoiceType: 6,
          pointOfSale: 1,
          invoiceNumber: 123,
          total: 1000,
          categoryId: null,
        },
      });

      const filter: FilterNode = {
        type: 'categoria',
        value: null,
        negate: false,
      };

      expect(matcher(comprobante, filter)).toBe(true);
    });

    it('should NOT match wrong category', () => {
      const comprobante = createTestComprobante({
        final: {
          source: 'final',
          id: 1,
          cuit: '30-71084210-3',
          issueDate: '2024-01-15',
          invoiceType: 6,
          pointOfSale: 1,
          invoiceNumber: 123,
          total: 1000,
          categoryId: 1, // Servicios
        },
      });

      const filter: FilterNode = {
        type: 'categoria',
        value: 'productos',
        negate: false,
      };

      expect(matcher(comprobante, filter)).toBe(false);
    });
  });

  describe('Numero matching', () => {
    it('should match formatted invoice number', () => {
      const comprobante = createTestComprobante({
        final: {
          source: 'final',
          id: 1,
          cuit: '30-71084210-3',
          issueDate: '2024-01-15',
          invoiceType: 6,
          pointOfSale: 1,
          invoiceNumber: 123,
          total: 1000,
        },
      });

      const filter: FilterNode = {
        type: 'numero',
        value: '0001-00000123',
        negate: false,
      };

      expect(matcher(comprobante, filter)).toBe(true);
    });

    it('should match partial number', () => {
      const comprobante = createTestComprobante({
        final: {
          source: 'final',
          id: 1,
          cuit: '30-71084210-3',
          issueDate: '2024-01-15',
          invoiceType: 6,
          pointOfSale: 1,
          invoiceNumber: 123,
          total: 1000,
        },
      });

      const filter: FilterNode = {
        type: 'numero',
        value: '123',
        negate: false,
      };

      expect(matcher(comprobante, filter)).toBe(true);
    });

    it('should match pending filename', () => {
      const comprobante = createTestComprobante({
        file: {
          id: 1,
          originalFilename: 'factura-coto-123.pdf',
          filePath: '/test.pdf',
          status: 'uploaded',
        },
      });

      const filter: FilterNode = {
        type: 'numero',
        value: 'coto',
        negate: false,
      };

      expect(matcher(comprobante, filter)).toBe(true);
    });
  });

  describe('Total matching', () => {
    it('should match exact total', () => {
      const comprobante = createTestComprobante({
        final: {
          source: 'final',
          id: 1,
          cuit: '30-71084210-3',
          issueDate: '2024-01-15',
          invoiceType: 6,
          pointOfSale: 1,
          invoiceNumber: 123,
          total: 1000,
        },
      });

      const filter: FilterNode = {
        type: 'total',
        operator: 'eq',
        value: 1000,
        negate: false,
      };

      expect(matcher(comprobante, filter)).toBe(true);
    });

    it('should match total > (greater than)', () => {
      const comprobante = createTestComprobante({
        final: {
          source: 'final',
          id: 1,
          cuit: '30-71084210-3',
          issueDate: '2024-01-15',
          invoiceType: 6,
          pointOfSale: 1,
          invoiceNumber: 123,
          total: 2000,
        },
      });

      const filter: FilterNode = {
        type: 'total',
        operator: 'gte',
        value: 1000,
        negate: false,
      };

      expect(matcher(comprobante, filter)).toBe(true);
    });

    it('should match total range', () => {
      const comprobante = createTestComprobante({
        final: {
          source: 'final',
          id: 1,
          cuit: '30-71084210-3',
          issueDate: '2024-01-15',
          invoiceType: 6,
          pointOfSale: 1,
          invoiceNumber: 123,
          total: 3000,
        },
      });

      const filter: FilterNode = {
        type: 'total',
        operator: 'range',
        value: { min: 1000, max: 5000 },
        negate: false,
      };

      expect(matcher(comprobante, filter)).toBe(true);
    });
  });

  describe('Tipo matching', () => {
    it('should match invoice type code', () => {
      const comprobante = createTestComprobante({
        final: {
          source: 'final',
          id: 1,
          cuit: '30-71084210-3',
          issueDate: '2024-01-15',
          invoiceType: 6, // FACB
          pointOfSale: 1,
          invoiceNumber: 123,
          total: 1000,
        },
      });

      const filter: FilterNode = {
        type: 'tipo',
        value: 'FACB',
        negate: false,
      };

      expect(matcher(comprobante, filter)).toBe(true);
    });
  });

  describe('Freetext matching', () => {
    it('should match emitter name in freetext', () => {
      const comprobante = createTestComprobante({
        emitterName: 'Coto',
      });

      const filter: FilterNode = {
        type: 'freetext',
        value: 'coto',
        negate: false,
      };

      expect(matcher(comprobante, filter)).toBe(true);
    });

    it('should match CUIT in freetext (with digits)', () => {
      const comprobante = createTestComprobante({
        emitterCuit: '30-71084210-3',
      });

      const filter: FilterNode = {
        type: 'freetext',
        value: '30710842',
        negate: false,
      };

      expect(matcher(comprobante, filter)).toBe(true);
    });

    it('should NOT match CUIT in freetext (without digits)', () => {
      const comprobante = createTestComprobante({
        emitterCuit: '30-71084210-3',
        emitterName: null,
      });

      const filter: FilterNode = {
        type: 'freetext',
        value: 'coto',
        negate: false,
      };

      expect(matcher(comprobante, filter)).toBe(false);
    });

    it('should match filename in freetext', () => {
      const comprobante = createTestComprobante({
        file: {
          id: 1,
          originalFilename: 'factura-coto.pdf',
          filePath: '/test.pdf',
          status: 'uploaded',
        },
      });

      const filter: FilterNode = {
        type: 'freetext',
        value: 'coto',
        negate: false,
      };

      expect(matcher(comprobante, filter)).toBe(true);
    });
  });

  describe('Negation', () => {
    it('should negate emisor filter', () => {
      const comprobante = createTestComprobante({
        emitterName: 'Walmart',
      });

      const filter: FilterNode = {
        type: 'emisor',
        value: 'coto',
        negate: true,
      };

      // Should match because it's NOT coto
      expect(matcher(comprobante, filter)).toBe(true);
    });

    it('should negate categoria filter', () => {
      const comprobante = createTestComprobante({
        final: {
          source: 'final',
          id: 1,
          cuit: '30-71084210-3',
          issueDate: '2024-01-15',
          invoiceType: 6,
          pointOfSale: 1,
          invoiceNumber: 123,
          total: 1000,
          categoryId: 2, // Productos
        },
      });

      const filter: FilterNode = {
        type: 'categoria',
        value: 'servicios',
        negate: true,
      };

      // Should match because it's NOT servicios
      expect(matcher(comprobante, filter)).toBe(true);
    });
  });
});
