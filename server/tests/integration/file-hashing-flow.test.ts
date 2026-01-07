/**
 * Tests de integración para el flujo completo de file hashing
 *
 * Cubre:
 * 1. Upload → hash guardado en pending_files
 * 2. Hash operations on pending_files
 * 3. Workflow básico de hashing
 *
 * IMPORTANTE: Usa base de datos de TEST (database.test.sqlite)
 * separada de la DB real para evitar contaminar datos de producción.
 * Vitest automáticamente setea VITEST=true, lo que hace que db.ts
 * use la DB de test.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { runTestMigrations, resetTestDb, cleanupTestDb } from '../../database/db-test.js';
import { PendingFileRepository } from '../../database/repositories/pending-file.js';
import { calculateFileHash } from '../../utils/file-hash.js';

const TEST_DIR = join(process.cwd(), 'server/tests/fixtures/hash-flow-test');
const TEST_FILE = join(TEST_DIR, 'test-invoice.txt');

beforeAll(async () => {
  // 1. Ejecutar migraciones en DB de test
  await runTestMigrations();

  // 2. Crear directorio de fixtures
  mkdirSync(TEST_DIR, { recursive: true });

  // 3. Crear archivo de prueba
  writeFileSync(TEST_FILE, 'Test Invoice Content');
});

afterAll(() => {
  // Limpiar fixtures
  rmSync(TEST_DIR, { recursive: true, force: true });

  // Limpiar y cerrar DB de test
  cleanupTestDb();
});

describe('File Hashing Integration Flow', () => {
  const pendingFileRepo = new PendingFileRepository();

  // Resetear DB antes de cada test (estado limpio garantizado)
  beforeEach(() => {
    resetTestDb();
  });

  it('should calculate and store hash on upload (pending_files)', async () => {
    // Simular upload: calcular hash y crear registro
    const hashResult = await calculateFileHash(TEST_FILE);
    const fileHash = hashResult.hash;

    const pendingFile = await pendingFileRepo.create({
      originalFilename: 'test-invoice.txt',
      filePath: TEST_FILE,
      fileSize: 20,
      fileHash,
      status: 'pending',
    });

    // Verificar que el hash se guardó correctamente
    expect(pendingFile.fileHash).toBe(fileHash);
    expect(pendingFile.fileHash).toMatch(/^[a-f0-9]{64}$/);

    // Verificar que podemos recuperar el archivo por hash
    const foundByHash = await pendingFileRepo.findByHash(fileHash);
    expect(foundByHash.length).toBeGreaterThan(0);
    const found = foundByHash.find((pf) => pf.id === pendingFile.id);
    expect(found).toBeDefined();
    expect(found!.fileHash).toBe(fileHash);
  });

  it('should handle hash operations on pending files', async () => {
    // 1. Crear pending_file con hash
    const hashResult = await calculateFileHash(TEST_FILE);
    const fileHash = hashResult.hash;

    const pendingFile = await pendingFileRepo.create({
      originalFilename: 'test-invoice-2.txt',
      filePath: TEST_FILE,
      fileSize: 20,
      fileHash,
      status: 'pending',
    });

    // 2. Verificar que el hash se guardó correctamente
    expect(pendingFile.fileHash).toBe(fileHash);

    // 3. Buscar por hash
    const foundByHash = await pendingFileRepo.findByHash(fileHash);
    expect(foundByHash.length).toBeGreaterThan(0);

    // 4. Verificar integridad recalculando hash
    const verifyHashResult = await calculateFileHash(TEST_FILE);
    expect(verifyHashResult.hash).toBe(fileHash); // Archivo íntegro
  });

  it('should support complete upload workflow', async () => {
    // 1. UPLOAD: Calcular hash y guardar en pending_files
    const hashResult = await calculateFileHash(TEST_FILE);
    const originalHash = hashResult.hash;

    const pendingFile = await pendingFileRepo.create({
      originalFilename: 'workflow-test.txt',
      filePath: TEST_FILE,
      fileSize: 20,
      fileHash: originalHash,
      status: 'pending',
    });

    expect(pendingFile.fileHash).toBe(originalHash);

    // 2. VERIFY: Recalcular hash y comparar (simular verificación)
    const verifyHashResult = await calculateFileHash(TEST_FILE);
    const currentHash = verifyHashResult.hash;

    expect(currentHash).toBe(originalHash); // Archivo íntegro

    // 3. Recuperar por ID y verificar
    const retrieved = await pendingFileRepo.findById(pendingFile.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.fileHash).toBe(originalHash);
  });

  it('should detect if file hash changes (integrity check)', async () => {
    // 1. Crear pending_file con hash del contenido original
    const originalHashResult = await calculateFileHash(TEST_FILE);
    const originalHash = originalHashResult.hash;

    const pendingFile = await pendingFileRepo.create({
      originalFilename: 'integrity-test.txt',
      filePath: TEST_FILE,
      fileSize: 20,
      fileHash: originalHash,
      status: 'pending',
    });

    // 2. Modificar archivo
    const modifiedContent = 'Modified Invoice Content - DIFFERENT';
    writeFileSync(TEST_FILE, modifiedContent);

    // 3. Recalcular hash
    const newHashResult = await calculateFileHash(TEST_FILE);
    const newHash = newHashResult.hash;

    // 4. Verificar que el hash cambió
    expect(newHash).not.toBe(originalHash);

    // 5. Restaurar contenido original para otros tests
    writeFileSync(TEST_FILE, 'Test Invoice Content');
  });

  it('should handle updateFileHash for pending files', async () => {
    const pendingFile = await pendingFileRepo.create({
      originalFilename: 'update-test.txt',
      filePath: TEST_FILE,
      fileSize: 20,
      status: 'pending',
    });

    // Inicialmente sin hash
    expect(pendingFile.fileHash).toBeNull();

    // Calcular y actualizar hash
    const hashResult = await calculateFileHash(TEST_FILE);
    const updatedPendingFile = await pendingFileRepo.updateFileHash(
      pendingFile.id,
      hashResult.hash
    );

    expect(updatedPendingFile.fileHash).toBe(hashResult.hash);
    expect(updatedPendingFile.fileHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
