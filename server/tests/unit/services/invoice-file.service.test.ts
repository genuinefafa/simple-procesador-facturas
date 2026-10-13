/**
 * InvoiceFileService: copying/renaming must never destroy a file (#212).
 *
 * Uses the real data/finalized/ dir (the service has no injectable root), under
 * a year no real invoice uses, and removes it afterwards.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { InvoiceFileService, type InvoiceFileData } from '../../../services/invoice-file.service';
import type { IFileRepository } from '../../../database/repositories/file';
import type { ICategoryRepository } from '../../../database/repositories/category';
import type { File } from '../../../database/schema';
import type { Emitter } from '@shared/types';

const DATA_DIR = join(import.meta.dirname, '..', '..', '..', '..', 'data');
const TEST_SUBDIR = '1999-01';
const TEST_DIR = join(DATA_DIR, 'finalized', TEST_SUBDIR);
const INPUT_DIR = join(DATA_DIR, 'input', '__test_212__');

const emitter: Emitter = {
  cuit: '30123456789',
  name: 'Empresa Test',
  displayName: 'Empresa Test',
  aliases: [],
  active: true,
  totalInvoices: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const invoice: InvoiceFileData = {
  emitterCuit: emitter.cuit,
  invoiceType: 'FACA',
  pointOfSale: 1,
  invoiceNumber: 42,
  issueDate: '1999-01-15',
  fileId: 1,
};

function makeRepo(storagePath: string): IFileRepository & { calls: string[] } {
  const calls: string[] = [];
  const file = { id: 1, storagePath, originalFilename: 'factura.pdf' } as File;
  return {
    calls,
    findById: () => file,
    updatePath: (_id, p) => {
      calls.push(`path:${p}`);
      file.storagePath = p;
    },
    updateStatus: (_id, s) => {
      calls.push(`status:${s}`);
    },
  } as IFileRepository & { calls: string[] };
}

const categoryRepo = {} as ICategoryRepository;

// Bun on macOS only loses the file on a self-copy past some size (small files
// survive), so use a realistic PDF size
const BIG_PDF = Buffer.alloc(600 * 1024, 7);

function canonical(service: InvoiceFileService) {
  return service.generateCanonicalPath(invoice, emitter, 'factura.pdf', null);
}

describe('InvoiceFileService (#212)', () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    rmSync(INPUT_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(INPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    rmSync(INPUT_DIR, { recursive: true, force: true });
  });

  it('copyToFinalized keeps the file when it is already at its canonical path', async () => {
    const probe = canonical(new InvoiceFileService(makeRepo(''), categoryRepo));
    writeFileSync(probe.absolutePath, BIG_PDF);

    const repo = makeRepo(probe.relativePath);
    const result = await new InvoiceFileService(repo, categoryRepo).copyToFinalized(
      1,
      invoice,
      emitter
    );

    expect(result.success).toBe(true);
    expect(existsSync(probe.absolutePath)).toBe(true);
    expect(readFileSync(probe.absolutePath).equals(BIG_PDF)).toBe(true);
    expect(repo.calls).toEqual([`path:${probe.relativePath}`, 'status:processed']);
  });

  it('copyToFinalized refuses to overwrite a different file at the destination', async () => {
    const probe = canonical(new InvoiceFileService(makeRepo(''), categoryRepo));
    writeFileSync(probe.absolutePath, 'another invoice pdf');
    const source = join(INPUT_DIR, 'factura.pdf');
    writeFileSync(source, 'new pdf');

    const repo = makeRepo(source);
    const result = await new InvoiceFileService(repo, categoryRepo).copyToFinalized(
      1,
      invoice,
      emitter
    );

    expect(result.success).toBe(false);
    expect(readFileSync(probe.absolutePath, 'utf-8')).toBe('another invoice pdf');
    expect(existsSync(source)).toBe(true);
    expect(repo.calls).toEqual([]);
  });

  it('copyToFinalized copies from input when the destination is free', async () => {
    const source = join(INPUT_DIR, 'factura.pdf');
    writeFileSync(source, 'new pdf');

    const repo = makeRepo(source);
    const service = new InvoiceFileService(repo, categoryRepo);
    const result = await service.copyToFinalized(1, invoice, emitter);
    const { absolutePath } = canonical(service);

    expect(result.success).toBe(true);
    expect(readFileSync(absolutePath, 'utf-8')).toBe('new pdf');
    expect(existsSync(source)).toBe(true);
  });
});
