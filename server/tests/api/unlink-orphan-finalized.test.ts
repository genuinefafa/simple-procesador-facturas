/**
 * Deleting an invoice must not leave its finalized copy orphaned, and PATCH
 * must report rename failures. Fictitious data only.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getRawDb } from '../../database/db.js';
import { cleanupTestDb, runTestMigrations, resetTestDb } from '../../database/db-test.js';
import { app } from '../../http/app.js';

const CUIT = '30123456781';
const CUIT_FORMATTED = '30-12345678-1';

const DATA_DIR = join(import.meta.dirname, '..', '..', '..', 'data');
const INPUT_DIR = join(DATA_DIR, 'input');
const FINALIZED_DIR = join(DATA_DIR, 'finalized', '1998-05');
const PREFIX = '__test_unlink_orphan__';

interface FileRow {
  storage_path: string;
  status: string;
}

const send = (method: string, url: string, body?: unknown): Promise<Response> =>
  app.request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

function insertPhysicalFile(name: string, content: string): number {
  mkdirSync(INPUT_DIR, { recursive: true });
  writeFileSync(join(INPUT_DIR, name), content);
  const hash = createHash('sha256').update(content).digest('hex');
  return Number(
    getRawDb()
      .prepare(
        `INSERT INTO files (original_filename, file_type, file_hash, storage_path, status)
         VALUES (?, 'pdf', ?, ?, 'uploaded')`
      )
      .run(name, hash, `input/${name}`).lastInsertRowid
  );
}

const fileRow = (id: number): FileRow =>
  getRawDb().prepare('SELECT storage_path, status FROM files WHERE id = ?').get(id) as FileRow;

const fromFile = (fileId: number, invoiceNumber: number): Promise<Response> =>
  send('POST', `/api/invoices/from-file/${fileId}`, {
    source: 'manual',
    data: {
      cuit: CUIT_FORMATTED,
      invoiceType: 1,
      pointOfSale: 1,
      invoiceNumber,
      issueDate: '1998-05-10',
      total: 121,
    },
  });

const invoiceIdOf = (fileId: number): number =>
  (
    getRawDb().prepare('SELECT id FROM facturas WHERE file_id = ?').get(fileId) as {
      id: number;
    }
  ).id;

const finalizedFiles = (): string[] =>
  existsSync(FINALIZED_DIR) ? readdirSync(FINALIZED_DIR) : [];

function cleanup(): void {
  rmSync(FINALIZED_DIR, { recursive: true, force: true });
  if (existsSync(INPUT_DIR)) {
    for (const f of readdirSync(INPUT_DIR)) {
      if (f.startsWith(PREFIX)) rmSync(join(INPUT_DIR, f), { force: true });
    }
  }
}

afterAll(cleanup);

describe('Unlinking an invoice releases the finalized file', () => {
  beforeAll(async () => {
    cleanupTestDb();
    await runTestMigrations();
  });

  beforeEach(() => {
    cleanup();
    resetTestDb();
    getRawDb()
      .prepare('INSERT INTO emisores (cuit, nombre) VALUES (?, ?)')
      .run(CUIT, 'Emisor Test');
  });

  it('points the file back to its input copy and removes the finalized one', async () => {
    const fileId = insertPhysicalFile(`${PREFIX}a.pdf`, 'contenido-a');
    expect((await fromFile(fileId, 100)).status).toBe(200);
    expect(fileRow(fileId).storage_path).toMatch(/^finalized\//);
    expect(finalizedFiles()).toHaveLength(1);

    const res = await send('DELETE', `/api/invoices/${invoiceIdOf(fileId)}`);
    expect(res.status).toBe(200);

    const row = fileRow(fileId);
    expect(row.status).toBe('uploaded');
    expect(row.storage_path).toBe(`input/${PREFIX}a.pdf`);
    expect(existsSync(join(DATA_DIR, row.storage_path))).toBe(true);
    expect(finalizedFiles()).toHaveLength(0);
  });

  it('restores into input/ when the input copy is gone (never loses the only copy)', async () => {
    const fileId = insertPhysicalFile(`${PREFIX}b.pdf`, 'contenido-b');
    expect((await fromFile(fileId, 101)).status).toBe(200);
    rmSync(join(INPUT_DIR, `${PREFIX}b.pdf`));

    expect((await send('DELETE', `/api/invoices/${invoiceIdOf(fileId)}`)).status).toBe(200);

    const row = fileRow(fileId);
    expect(row.storage_path).toMatch(new RegExp(`^input/${PREFIX}b`));
    expect(existsSync(join(DATA_DIR, row.storage_path))).toBe(true);
    expect(finalizedFiles()).toHaveLength(0);
  });

  it('does not reuse an input file with the same name but other content', async () => {
    const fileId = insertPhysicalFile(`${PREFIX}c.pdf`, 'contenido-c');
    expect((await fromFile(fileId, 102)).status).toBe(200);
    writeFileSync(join(INPUT_DIR, `${PREFIX}c.pdf`), 'otro contenido');

    expect((await send('DELETE', `/api/invoices/${invoiceIdOf(fileId)}`)).status).toBe(200);

    const row = fileRow(fileId);
    expect(row.storage_path).not.toBe(`input/${PREFIX}c.pdf`);
    expect(existsSync(join(DATA_DIR, row.storage_path))).toBe(true);
    expect(finalizedFiles()).toHaveLength(0);
  });

  it('reassigning a file leaves no orphan and frees the original data for another file', async () => {
    const fileA = insertPhysicalFile(`${PREFIX}d.pdf`, 'contenido-d');
    const fileB = insertPhysicalFile(`${PREFIX}e.pdf`, 'contenido-e');

    expect((await fromFile(fileA, 200)).status).toBe(200);
    await send('DELETE', `/api/invoices/${invoiceIdOf(fileA)}`);
    expect((await fromFile(fileA, 201)).status).toBe(200);

    // Only the finalized copy for invoice 201 remains
    expect(finalizedFiles()).toHaveLength(1);
    expect(finalizedFiles()[0]).toContain('00000201');

    // Original data (200) can now be used with another file
    const res = await fromFile(fileB, 200);
    expect(res.status).toBe(200);
    expect(finalizedFiles()).toHaveLength(2);
  });
});

describe('PATCH reports rename failures', () => {
  beforeAll(async () => {
    cleanupTestDb();
    await runTestMigrations();
  });

  beforeEach(() => {
    cleanup();
    resetTestDb();
    getRawDb()
      .prepare('INSERT INTO emisores (cuit, nombre) VALUES (?, ?)')
      .run(CUIT, 'Emisor Test');
  });

  it('returns fileRenameWarning when the physical file cannot be found', async () => {
    const fileId = insertPhysicalFile(`${PREFIX}h.pdf`, 'contenido-h');
    expect((await fromFile(fileId, 400)).status).toBe(200);
    const row = fileRow(fileId);
    rmSync(join(DATA_DIR, row.storage_path));

    const res = await send('PATCH', `/api/invoices/${invoiceIdOf(fileId)}`, {
      issueDate: '1998-05-11',
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; fileRenameWarning?: string };
    expect(body.success).toBe(true);
    expect(body.fileRenameWarning).toMatch(/No se pudo renombrar el archivo/);
  });

  it('omits fileRenameWarning on a successful rename', async () => {
    const fileId = insertPhysicalFile(`${PREFIX}i.pdf`, 'contenido-i');
    expect((await fromFile(fileId, 500)).status).toBe(200);

    const res = await send('PATCH', `/api/invoices/${invoiceIdOf(fileId)}`, {
      issueDate: '1998-05-12',
    });

    const body = (await res.json()) as { fileRenameWarning?: string };
    expect(res.status).toBe(200);
    expect(body.fileRenameWarning).toBeUndefined();
  });
});
