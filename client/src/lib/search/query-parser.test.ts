import { describe, it, expect } from 'vitest';
import { parseSearchQuery } from './query-parser';

describe('Query Parser', () => {
  describe('Emisor filters', () => {
    it('should parse simple emisor filter', () => {
      const result = parseSearchQuery('emisor:acme');
      expect(result.errors).toEqual([]);
      expect(result.filters).toHaveLength(1);
      expect(result.filters[0]).toMatchObject({
        type: 'emisor',
        value: 'acme',
        negate: false,
      });
    });

    it('should parse negated emisor filter', () => {
      const result = parseSearchQuery('!emisor:acme');
      expect(result.errors).toEqual([]);
      expect(result.filters).toHaveLength(1);
      expect(result.filters[0]).toMatchObject({
        type: 'emisor',
        value: 'acme',
        negate: true,
      });
    });

    it('should parse CUIT in emisor filter', () => {
      const result = parseSearchQuery('emisor:20-12345678-9');
      expect(result.errors).toEqual([]);
      expect(result.filters[0]).toMatchObject({
        type: 'emisor',
        value: '20-12345678-9',
      });
    });
  });

  describe('Fecha filters', () => {
    it('should parse exact date', () => {
      const result = parseSearchQuery('fecha:2024-01-15');
      expect(result.errors).toEqual([]);
      expect(result.filters).toHaveLength(1);
      const filter = result.filters[0];
      expect(filter.type).toBe('fecha');
      if (filter.type === 'fecha') {
        expect(filter.operator).toBe('eq');
        expect(filter.value).toBeInstanceOf(Date);
        expect(filter.negate).toBe(false);
      }
    });

    it('should expand year-month to range without operator', () => {
      const result = parseSearchQuery('fecha:2024-01');
      expect(result.errors).toEqual([]);
      const filter = result.filters[0];
      expect(filter.type).toBe('fecha');
      if (filter.type === 'fecha') {
        expect(filter.operator).toBe('range');
        expect(filter.value).toHaveProperty('start');
        expect(filter.value).toHaveProperty('end');
      }
    });

    it('should expand year to range without operator', () => {
      const result = parseSearchQuery('fecha:2024');
      expect(result.errors).toEqual([]);
      const filter = result.filters[0];
      expect(filter.type).toBe('fecha');
      if (filter.type === 'fecha') {
        expect(filter.operator).toBe('range');
      }
    });

    it('should parse fecha:>2024-01 as after end of month', () => {
      const result = parseSearchQuery('fecha:>2024-01');
      expect(result.errors).toEqual([]);
      const filter = result.filters[0];
      expect(filter.type).toBe('fecha');
      if (filter.type === 'fecha' && filter.value instanceof Date) {
        expect(filter.operator).toBe('gt');
        expect(filter.value.getFullYear()).toBe(2024);
        expect(filter.value.getMonth()).toBe(0); // January
        expect(filter.value.getDate()).toBe(31); // Last day of January
      }
    });

    it('should parse fecha:<2024-01 as before start of month', () => {
      const result = parseSearchQuery('fecha:<2024-01');
      expect(result.errors).toEqual([]);
      const filter = result.filters[0];
      expect(filter.type).toBe('fecha');
      if (filter.type === 'fecha' && filter.value instanceof Date) {
        expect(filter.operator).toBe('lt');
        expect(filter.value.getFullYear()).toBe(2024);
        expect(filter.value.getMonth()).toBe(0);
        expect(filter.value.getDate()).toBe(1); // First day of January
      }
    });

    it('should parse fecha:>=2024-01 as from start of month', () => {
      const result = parseSearchQuery('fecha:>=2024-01');
      expect(result.errors).toEqual([]);
      const filter = result.filters[0];
      expect(filter.type).toBe('fecha');
      if (filter.type === 'fecha' && filter.value instanceof Date) {
        expect(filter.operator).toBe('gte');
        expect(filter.value.getDate()).toBe(1);
      }
    });

    it('should parse fecha:<=2024-01 as until end of month', () => {
      const result = parseSearchQuery('fecha:<=2024-01');
      expect(result.errors).toEqual([]);
      const filter = result.filters[0];
      expect(filter.type).toBe('fecha');
      if (filter.type === 'fecha' && filter.value instanceof Date) {
        expect(filter.operator).toBe('lte');
        expect(filter.value.getDate()).toBe(31);
      }
    });

    it('should parse fecha:>2025 as after end of year', () => {
      const result = parseSearchQuery('fecha:>2025');
      expect(result.errors).toEqual([]);
      const filter = result.filters[0];
      expect(filter.type).toBe('fecha');
      if (filter.type === 'fecha' && filter.value instanceof Date) {
        expect(filter.operator).toBe('gt');
        expect(filter.value.getFullYear()).toBe(2025);
        expect(filter.value.getMonth()).toBe(11); // December
        expect(filter.value.getDate()).toBe(31); // Last day of year
      }
    });

    it('should parse fecha:<2025 as before start of year', () => {
      const result = parseSearchQuery('fecha:<2025');
      expect(result.errors).toEqual([]);
      const filter = result.filters[0];
      expect(filter.type).toBe('fecha');
      if (filter.type === 'fecha' && filter.value instanceof Date) {
        expect(filter.operator).toBe('lt');
        expect(filter.value.getFullYear()).toBe(2025);
        expect(filter.value.getMonth()).toBe(0); // January
        expect(filter.value.getDate()).toBe(1); // First day of year
      }
    });

    it('should parse date range', () => {
      const result = parseSearchQuery('fecha:2024-01..2024-03');
      expect(result.errors).toEqual([]);
      const filter = result.filters[0];
      expect(filter.type).toBe('fecha');
      if (filter.type === 'fecha') {
        expect(filter.operator).toBe('range');
        expect(filter.value).toHaveProperty('start');
        expect(filter.value).toHaveProperty('end');
      }
    });

    it('should parse negated date filter', () => {
      const result = parseSearchQuery('!fecha:2024-01');
      expect(result.errors).toEqual([]);
      const filter = result.filters[0];
      expect(filter.type).toBe('fecha');
      if (filter.type === 'fecha') {
        expect(filter.negate).toBe(true);
      }
    });

    it('should error on invalid date', () => {
      const result = parseSearchQuery('fecha:invalid');
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Categoria filters', () => {
    it('should parse simple categoria filter', () => {
      const result = parseSearchQuery('categoria:servicios');
      expect(result.errors).toEqual([]);
      expect(result.filters[0]).toMatchObject({
        type: 'categoria',
        value: 'servicios',
        negate: false,
      });
    });

    it('should parse categoria:sin as null', () => {
      const result = parseSearchQuery('categoria:sin');
      expect(result.errors).toEqual([]);
      expect(result.filters[0]).toMatchObject({
        type: 'categoria',
        value: null,
        negate: false,
      });
    });

    it('should parse negated categoria', () => {
      const result = parseSearchQuery('!categoria:servicios');
      expect(result.errors).toEqual([]);
      expect(result.filters[0]).toMatchObject({
        type: 'categoria',
        value: 'servicios',
        negate: true,
      });
    });
  });

  describe('Numero filters', () => {
    it('should parse numero filter', () => {
      const result = parseSearchQuery('numero:0001-00000123');
      expect(result.errors).toEqual([]);
      expect(result.filters[0]).toMatchObject({
        type: 'numero',
        value: '0001-00000123',
        negate: false,
      });
    });

    it('should parse negated numero', () => {
      const result = parseSearchQuery('!numero:123');
      expect(result.errors).toEqual([]);
      expect(result.filters[0]).toMatchObject({
        type: 'numero',
        value: '123',
        negate: true,
      });
    });
  });

  describe('Total filters', () => {
    it('should parse simple total filter', () => {
      const result = parseSearchQuery('total:1000');
      expect(result.errors).toEqual([]);
      const filter = result.filters[0];
      expect(filter.type).toBe('total');
      if (filter.type === 'total') {
        expect(filter.operator).toBe('eq');
        expect(filter.value).toBe(1000);
      }
    });

    it('should parse total:>1000', () => {
      const result = parseSearchQuery('total:>1000');
      expect(result.errors).toEqual([]);
      const filter = result.filters[0];
      expect(filter.type).toBe('total');
      if (filter.type === 'total') {
        expect(filter.operator).toBe('gt');
        expect(filter.value).toBe(1000);
      }
    });

    it('should parse total range', () => {
      const result = parseSearchQuery('total:1000..5000');
      expect(result.errors).toEqual([]);
      const filter = result.filters[0];
      expect(filter.type).toBe('total');
      if (filter.type === 'total' && typeof filter.value === 'object') {
        expect(filter.operator).toBe('range');
        expect(filter.value.min).toBe(1000);
        expect(filter.value.max).toBe(5000);
      }
    });

    it('should error on invalid amount', () => {
      const result = parseSearchQuery('total:invalid');
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Tipo filters', () => {
    it('should parse tipo filter and uppercase it', () => {
      const result = parseSearchQuery('tipo:faca');
      expect(result.errors).toEqual([]);
      expect(result.filters[0]).toMatchObject({
        type: 'tipo',
        value: 'FACA',
        negate: false,
      });
    });

    it('should parse negated tipo', () => {
      const result = parseSearchQuery('!tipo:FACA');
      expect(result.errors).toEqual([]);
      expect(result.filters[0]).toMatchObject({
        type: 'tipo',
        value: 'FACA',
        negate: true,
      });
    });
  });

  describe('Freetext filters', () => {
    it('should parse text without prefix as freetext', () => {
      const result = parseSearchQuery('acme');
      expect(result.errors).toEqual([]);
      expect(result.filters[0]).toMatchObject({
        type: 'freetext',
        value: 'acme',
        negate: false,
      });
    });

    it('should parse negated freetext', () => {
      const result = parseSearchQuery('!acme');
      expect(result.errors).toEqual([]);
      expect(result.filters[0]).toMatchObject({
        type: 'freetext',
        value: 'acme',
        negate: true,
      });
    });
  });

  describe('Combined filters', () => {
    it('should parse multiple filters', () => {
      const result = parseSearchQuery('emisor:acme fecha:>2024-01-01 total:>1000');
      expect(result.errors).toEqual([]);
      expect(result.filters).toHaveLength(3);
      expect(result.filters[0].type).toBe('emisor');
      expect(result.filters[1].type).toBe('fecha');
      expect(result.filters[2].type).toBe('total');
    });

    it('should parse mix of negated and normal filters', () => {
      const result = parseSearchQuery('emisor:acme !categoria:servicios fecha:2024-01');
      expect(result.errors).toEqual([]);
      expect(result.filters).toHaveLength(3);
      expect(result.filters[0].negate).toBe(false);
      expect(result.filters[1].negate).toBe(true);
      expect(result.filters[2].negate).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty query', () => {
      const result = parseSearchQuery('');
      expect(result.errors).toEqual([]);
      expect(result.filters).toEqual([]);
    });

    it('should handle whitespace-only query', () => {
      const result = parseSearchQuery('   ');
      expect(result.errors).toEqual([]);
      expect(result.filters).toEqual([]);
    });

    it('should handle unknown field as freetext', () => {
      const result = parseSearchQuery('unknown:value');
      expect(result.errors).toEqual([]);
      expect(result.filters[0]).toMatchObject({
        type: 'freetext',
        value: 'unknown:value',
      });
    });
  });
});
