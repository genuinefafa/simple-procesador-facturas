/**
 * Tests de integración para verificar la protección de archivos al eliminar pending_files
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PendingFileRepository } from '../../database/repositories/pending-file.js';
import { InvoiceRepository } from '../../database/repositories/invoice.js';
import { EmitterRepository } from '../../database/repositories/emitter.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { runTestMigrations, resetTestDb, cleanupTestDb } from '../../database/db-test.js';

const TEST_DIR = join(process.cwd(), 'server/tests/fixtures/deletion-test');
const TEST_FILE = join(TEST_DIR, 'test-invoice.pdf');

describe('Pending File Deletion Protection', () => {
  let pendingFileRepo: PendingFileRepository;
  let invoiceRepo: InvoiceRepository;
  let emitterRepo: EmitterRepository;

  beforeAll(async () => {
    // Ejecutar migraciones en DB de test
    await runTestMigrations();

    // Crear directorio de fixtures
    mkdirSync(TEST_DIR, { recursive: true });

    // Crear archivo de prueba
    writeFileSync(TEST_FILE, 'Test PDF content');
  });

  afterAll(() => {
    // Limpiar archivos de prueba
    rmSync(TEST_DIR, { recursive: true, force: true });

    // Limpiar DB de test
    cleanupTestDb();
  });

  beforeEach(async () => {
    // Resetear DB entre tests
    await resetTestDb();

    pendingFileRepo = new PendingFileRepository();
    invoiceRepo = new InvoiceRepository();
    emitterRepo = new EmitterRepository();
  });

  it('should find invoices linked to a pending file', async () => {
    // 1. Crear emisor
    const emitter = await emitterRepo.create({
      cuit: '20-12345678-9',
      cuitNumeric: '20123456789',
      name: 'Test Emitter',
      aliases: [],
    });

    // 2. Crear pending file
    const pendingFile = await pendingFileRepo.create({
      originalFilename: 'test-invoice.pdf',
      filePath: TEST_FILE,
      fileSize: 100,
      fileHash: 'abc123hash',
      status: 'processed',
    });

    // 3. Crear factura vinculada al pending file
    const invoice = await invoiceRepo.create({
      emitterCuit: emitter.cuit,
      issueDate: '2024-01-15',
      invoiceType: 1,
      pointOfSale: 1,
      invoiceNumber: 123,
      total: 1000,
      originalFile: TEST_FILE,
      processedFile: TEST_FILE,
      fileType: 'PDF_DIGITAL',
      fileHash: 'abc123hash',
      extractionMethod: 'MANUAL',
      extractionConfidence: 100,
      requiresReview: false,
      pendingFileId: pendingFile.id,
    });

    // 4. Buscar facturas vinculadas al pending file
    const linkedInvoices = await invoiceRepo.findByPendingFileId(pendingFile.id);

    // Verificar que encontró la factura
    expect(linkedInvoices).toHaveLength(1);
    expect(linkedInvoices[0].id).toBe(invoice.id);
    expect(linkedInvoices[0].pendingFileId).toBe(pendingFile.id);
  });

  it('should return empty array when no invoices are linked to pending file', async () => {
    // 1. Crear pending file sin facturas vinculadas
    const pendingFile = await pendingFileRepo.create({
      originalFilename: 'orphan-file.pdf',
      filePath: TEST_FILE,
      fileSize: 100,
      status: 'pending',
    });

    // 2. Buscar facturas vinculadas
    const linkedInvoices = await invoiceRepo.findByPendingFileId(pendingFile.id);

    // Verificar que no hay facturas vinculadas
    expect(linkedInvoices).toHaveLength(0);
  });

  it('should find multiple invoices if linked to the same pending file', async () => {
    // 1. Crear emisor
    const emitter = await emitterRepo.create({
      cuit: '20-12345678-9',
      cuitNumeric: '20123456789',
      name: 'Test Emitter',
      aliases: [],
    });

    // 2. Crear pending file
    const pendingFile = await pendingFileRepo.create({
      originalFilename: 'test-invoice.pdf',
      filePath: TEST_FILE,
      fileSize: 100,
      fileHash: 'abc123hash',
      status: 'processed',
    });

    // 3. Crear dos facturas vinculadas al mismo pending file
    const invoice1 = await invoiceRepo.create({
      emitterCuit: emitter.cuit,
      issueDate: '2024-01-15',
      invoiceType: 1,
      pointOfSale: 1,
      invoiceNumber: 123,
      total: 1000,
      originalFile: TEST_FILE,
      processedFile: TEST_FILE,
      fileType: 'PDF_DIGITAL',
      fileHash: 'abc123hash',
      extractionMethod: 'MANUAL',
      extractionConfidence: 100,
      requiresReview: false,
      pendingFileId: pendingFile.id,
    });

    const invoice2 = await invoiceRepo.create({
      emitterCuit: emitter.cuit,
      issueDate: '2024-01-16',
      invoiceType: 1,
      pointOfSale: 1,
      invoiceNumber: 124,
      total: 2000,
      originalFile: TEST_FILE,
      processedFile: TEST_FILE + '.processed2', // Diferente archivo procesado para evitar UNIQUE constraint
      fileType: 'PDF_DIGITAL',
      fileHash: 'abc123hash',
      extractionMethod: 'MANUAL',
      extractionConfidence: 100,
      requiresReview: false,
      pendingFileId: pendingFile.id,
    });

    // 4. Buscar facturas vinculadas
    const linkedInvoices = await invoiceRepo.findByPendingFileId(pendingFile.id);

    // Verificar que encontró ambas facturas
    expect(linkedInvoices).toHaveLength(2);
    expect(linkedInvoices.map((inv) => inv.id).sort()).toEqual([invoice1.id, invoice2.id].sort());
  });
});
