/**
 * Tests de integración para actualización de categorías en expected invoices y files.
 * Issue #132: Categories in Expected Invoices and Files
 *
 * Estos tests verifican la lógica de los repositorios usando una DB de test
 * con migraciones aplicadas en beforeAll.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { FileRepository } from '../../database/repositories/file.js';
import { ExpectedInvoiceRepository } from '../../database/repositories/expected-invoice.js';
import { CategoryRepository } from '../../database/repositories/category.js';
import { runTestMigrations, resetTestDb } from '../../database/db-test.js';

describe('Category Updates API', () => {
  let fileRepo: FileRepository;
  let expectedRepo: ExpectedInvoiceRepository;
  let categoryRepo: CategoryRepository;

  beforeAll(async () => {
    await runTestMigrations();
  });

  beforeEach(() => {
    resetTestDb();
    fileRepo = new FileRepository();
    expectedRepo = new ExpectedInvoiceRepository();
    categoryRepo = new CategoryRepository();
  });

  describe('Expected Invoice Category', () => {
    it('debería actualizar categoryId de un expected invoice', async () => {
      // Crear una categoría de prueba
      const category = await categoryRepo.create({
        key: 'TEST_CAT',
        description: 'Categoría de prueba',
      });

      // Crear batch primero (requerido por createManyInvoices)
      const batch = await expectedRepo.createBatch({
        filename: 'test-batch.csv',
        totalRows: 1,
        importedRows: 1,
      });

      // Crear expected invoice via createManyInvoices
      const result = await expectedRepo.createManyInvoices(
        [
          {
            cuit: '20123456789',
            invoiceType: 1,
            pointOfSale: 1,
            invoiceNumber: 1,
            issueDate: '2024-01-15',
            total: 1000,
          },
        ],
        batch.id
      );

      const expected = result.created[0];

      // Actualizar categoría
      const updated = await expectedRepo.updateCategory(expected.id, category.id);

      expect(updated.categoryId).toBe(category.id);
    });

    it('debería permitir setear categoryId a null', async () => {
      // Crear una categoría
      const category = await categoryRepo.create({
        key: 'TEST_CAT_2',
        description: 'Otra categoría',
      });

      // Crear batch y expected invoice
      const batch = await expectedRepo.createBatch({
        filename: 'test-batch-2.csv',
        totalRows: 1,
        importedRows: 1,
      });

      const result = await expectedRepo.createManyInvoices(
        [
          {
            cuit: '20123456789',
            invoiceType: 1,
            pointOfSale: 1,
            invoiceNumber: 2,
            issueDate: '2024-01-15',
            total: 1000,
          },
        ],
        batch.id
      );

      const expected = result.created[0];

      // Primero asignar categoría
      await expectedRepo.updateCategory(expected.id, category.id);

      // Luego quitar categoría
      const updated = await expectedRepo.updateCategory(expected.id, null);

      expect(updated.categoryId).toBeNull();
    });

    it('debería lanzar error si expected invoice no existe', async () => {
      await expect(expectedRepo.updateCategory(99999, 1)).rejects.toThrow();
    });
  });

  describe('File Category', () => {
    it('debería actualizar categoryId de un file', async () => {
      // Crear una categoría de prueba (async)
      const category = await categoryRepo.create({
        key: 'FILE_CAT',
        description: 'Categoría para archivos',
      });

      // Crear un file de prueba con todos los campos requeridos
      const file = fileRepo.create({
        originalFilename: 'test.pdf',
        storagePath: '/tmp/test.pdf',
        fileType: 'PDF_DIGITAL',
        fileHash: 'abc123hash1',
        status: 'uploaded',
      });

      // Actualizar categoría
      fileRepo.updateCategory(file.id, category.id);

      // Verificar
      const updated = fileRepo.findById(file.id);
      expect(updated?.categoryId).toBe(category.id);
    });

    it('debería permitir setear categoryId a null en file', async () => {
      // Crear categoría (async)
      const category = await categoryRepo.create({
        key: 'FILE_CAT_2',
        description: 'Otra categoría archivos',
      });

      // Crear file sin categoría inicialmente
      const file = fileRepo.create({
        originalFilename: 'test2.pdf',
        storagePath: '/tmp/test2.pdf',
        fileType: 'PDF_DIGITAL',
        fileHash: 'abc123hash2',
        status: 'uploaded',
      });

      // Primero asignar categoría
      fileRepo.updateCategory(file.id, category.id);

      // Luego quitar categoría
      fileRepo.updateCategory(file.id, null);

      // Verificar
      const updated = fileRepo.findById(file.id);
      expect(updated?.categoryId).toBeNull();
    });
  });

  describe('Category Repository', () => {
    it('debería crear y recuperar categorías', async () => {
      const created = await categoryRepo.create({
        key: 'SERVICIOS',
        description: 'Servicios profesionales',
      });

      expect(created.id).toBeDefined();
      expect(created.key).toBe('SERVICIOS');
      expect(created.description).toBe('Servicios profesionales');
      expect(created.active).toBe(true);

      const found = await categoryRepo.findById(created.id);
      expect(found).toBeDefined();
      expect(found?.key).toBe('SERVICIOS');
    });

    it('debería listar solo categorías activas', async () => {
      await categoryRepo.create({ key: 'CAT_ACTIVE', description: 'Activa' });
      const inactive = await categoryRepo.create({ key: 'CAT_INACTIVE', description: 'Inactiva' });
      await categoryRepo.deactivate(inactive.id);

      const active = await categoryRepo.findAllActive();
      expect(active.every((c) => c.active)).toBe(true);
      expect(active.find((c) => c.key === 'CAT_INACTIVE')).toBeUndefined();
    });
  });
});
