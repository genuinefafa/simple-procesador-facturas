/**
 * Tests unitarios para file-hash utility
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import {
  calculateFileHash,
  verifyFileHash,
  calculateBatchHashes,
} from '../../../utils/file-hash.js';

const TEST_DIR = join(process.cwd(), 'server/tests/fixtures/hash-test');
const FILE_1 = join(TEST_DIR, 'test-file-1.txt');
const FILE_2 = join(TEST_DIR, 'test-file-2.txt');
const FILE_3 = join(TEST_DIR, 'test-file-same.txt');

beforeAll(() => {
  // Crear directorio de fixtures
  mkdirSync(TEST_DIR, { recursive: true });

  // Crear archivos de prueba
  writeFileSync(FILE_1, 'Hello World');
  writeFileSync(FILE_2, 'Different content');
  writeFileSync(FILE_3, 'Hello World'); // Mismo contenido que FILE_1
});

afterAll(() => {
  // Limpiar fixtures
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('calculateFileHash', () => {
  it('should calculate SHA-256 hash correctly', async () => {
    const result = await calculateFileHash(FILE_1);

    expect(result).toHaveProperty('hash');
    expect(result).toHaveProperty('algorithm', 'sha256');
    expect(result).toHaveProperty('fileSize');
    expect(result).toHaveProperty('calculatedAt');

    // Hash debe ser string de 64 caracteres hexadecimales
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.algorithm).toBe('sha256');
    expect(result.fileSize).toBe(11); // 'Hello World' = 11 bytes
    expect(result.calculatedAt).toBeInstanceOf(Date);
  });

  it('should produce consistent hashes for same content', async () => {
    const result1 = await calculateFileHash(FILE_1);
    const result2 = await calculateFileHash(FILE_1);
    const result3 = await calculateFileHash(FILE_3); // Mismo contenido

    expect(result1.hash).toBe(result2.hash);
    expect(result1.hash).toBe(result3.hash);
  });

  it('should produce different hashes for different content', async () => {
    const result1 = await calculateFileHash(FILE_1);
    const result2 = await calculateFileHash(FILE_2);

    expect(result1.hash).not.toBe(result2.hash);
  });

  it('should throw error for non-existent file', async () => {
    await expect(calculateFileHash('/non/existent/file.txt')).rejects.toThrow();
  });

  it('should calculate correct hash for known content', async () => {
    // 'Hello World' → SHA-256 conocido
    const knownHash = 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e';
    const result = await calculateFileHash(FILE_1);

    expect(result.hash).toBe(knownHash);
  });
});

describe('verifyFileHash', () => {
  it('should return true for matching hash', async () => {
    const result = await calculateFileHash(FILE_1);
    const isValid = await verifyFileHash(FILE_1, result.hash);

    expect(isValid).toBe(true);
  });

  it('should return false for non-matching hash', async () => {
    const wrongHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const isValid = await verifyFileHash(FILE_1, wrongHash);

    expect(isValid).toBe(false);
  });

  it('should be case-insensitive', async () => {
    const result = await calculateFileHash(FILE_1);
    const uppercaseHash = result.hash.toUpperCase();
    const isValid = await verifyFileHash(FILE_1, uppercaseHash);

    expect(isValid).toBe(true);
  });

  it('should return false for non-existent file', async () => {
    const isValid = await verifyFileHash('/non/existent/file.txt', 'abc123');

    expect(isValid).toBe(false);
  });
});

describe('calculateBatchHashes', () => {
  it('should calculate hashes for multiple files', async () => {
    const hashes = await calculateBatchHashes([FILE_1, FILE_2, FILE_3]);

    expect(hashes.size).toBe(3);
    expect(hashes.has(FILE_1)).toBe(true);
    expect(hashes.has(FILE_2)).toBe(true);
    expect(hashes.has(FILE_3)).toBe(true);
  });

  it('should handle partial failures gracefully', async () => {
    const hashes = await calculateBatchHashes([FILE_1, '/non/existent.txt', FILE_2]);

    // Solo los archivos válidos deben estar en el resultado
    expect(hashes.size).toBe(2);
    expect(hashes.has(FILE_1)).toBe(true);
    expect(hashes.has(FILE_2)).toBe(true);
    expect(hashes.has('/non/existent.txt')).toBe(false);
  });

  it('should handle empty array', async () => {
    const hashes = await calculateBatchHashes([]);

    expect(hashes.size).toBe(0);
  });

  it('should produce consistent hashes for files with same content', async () => {
    const hashes = await calculateBatchHashes([FILE_1, FILE_3]);

    const hash1 = hashes.get(FILE_1);
    const hash3 = hashes.get(FILE_3);

    expect(hash1).toBeDefined();
    expect(hash3).toBeDefined();
    expect(hash1!.hash).toBe(hash3!.hash);
  });
});
