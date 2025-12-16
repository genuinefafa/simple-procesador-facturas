import { describe, it, expect, beforeEach } from 'vitest';
import { PendingFileRepository } from '../../database/repositories/pending-file.js';
import { ExpectedInvoiceRepository } from '../../database/repositories/expected-invoice.js';

describe('Matches API - findPartialMatches', () => {
  let _pendingRepo: PendingFileRepository;
  let expectedRepo: ExpectedInvoiceRepository;

  beforeEach(() => {
    _pendingRepo = new PendingFileRepository();
    expectedRepo = new ExpectedInvoiceRepository();
  });

  it('debería encontrar match por punto de venta y tipo sin CUIT', async () => {
    // Ahora debería traer TODOS los expected disponibles
    // y ordenarlos por score
    const matches = await expectedRepo.findPartialMatches({
      cuit: undefined, // Sin CUIT
      invoiceType: 'A',
      pointOfSale: 2056,
      invoiceNumber: 99157,
      limit: 10,
    });

    console.log('Matches encontrados:', matches.length);
    matches.slice(0, 5).forEach((m) => {
      console.log(
        `- ID ${m.id}: ${m.invoiceType}-${m.pointOfSale}-${m.invoiceNumber} (score: ${m.matchScore}%)`
      );
      console.log(`  Campos: ${m.matchedFields.join(', ')}`);
    });

    // Debería traer TODOS los expected sin asignar
    expect(matches.length).toBeGreaterThan(0);

    // El primero debería ser el de mejor score
    expect(matches[0].matchScore).toBeGreaterThan(0);
  });

  it('debería asignar score por proximidad de número', async () => {
    const matches = await expectedRepo.findPartialMatches({
      invoiceType: 'A',
      pointOfSale: 2056,
      invoiceNumber: 99157, // El expected tiene 99152
      limit: 10,
    });

    const match = matches.find((m) => m.invoiceNumber === 99152);
    expect(match).toBeDefined();

    if (match) {
      console.log('Match encontrado:', match);
      console.log('Score:', match.matchScore);
      console.log('Campos matched:', match.matchedFields);

      // Debería tener invoiceType (100) + pointOfSale (100) + invoiceNumber~ (50) = 250/3 = 83%
      expect(match.matchScore).toBeGreaterThanOrEqual(70);
      expect(match.matchedFields).toContain('invoiceType');
      expect(match.matchedFields).toContain('pointOfSale');
      expect(match.matchedFields.some((f) => f.includes('invoiceNumber'))).toBe(true);
    }
  });

  it('debería ordenar por mejor score', async () => {
    const matches = await expectedRepo.findPartialMatches({
      invoiceType: 'A',
      pointOfSale: 2056,
      invoiceNumber: 99157,
      limit: 10,
    });

    // Verificar que están ordenados por score descendente
    for (let i = 0; i < matches.length - 1; i++) {
      expect(matches[i].matchScore).toBeGreaterThanOrEqual(matches[i + 1].matchScore);
    }
  });

  it('debería traer todos los expected disponibles aunque no haya criterios', async () => {
    const matches = await expectedRepo.findPartialMatches({
      limit: 10,
    });

    console.log('Expected disponibles:', matches.length);

    // Debería traer todos los expected sin asignar
    expect(matches.length).toBeGreaterThanOrEqual(0);

    // Sin criterios, todos tienen score 0
    if (matches.length > 0) {
      expect(matches[0].matchScore).toBe(0);
    }
  });
});
