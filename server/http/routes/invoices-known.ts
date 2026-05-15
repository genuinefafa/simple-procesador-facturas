/**
 * Hono router for /api/invoices-known/*.
 *
 * Mirror of client/src/routes/api/invoices-known/**\/+server.ts during
 * the SvelteKit → Hono migration. See docs/MIGRATION_BUN_HONO.md.
 */

import { Hono } from 'hono';

import { ExpectedInvoiceRepository } from '../../database/repositories/expected-invoice';
import { InvoiceRepository } from '../../database/repositories/invoice';
import { FileRepository } from '../../database/repositories/file';
import { CategoryRepository } from '../../database/repositories/category';
import { normalizeToISO } from '../../utils/dates';
import type { Final, Expected } from '@shared/types';

export const invoicesKnownRouter = new Hono();

invoicesKnownRouter.get('/', async (c) => {
  const invoiceRepo = new InvoiceRepository();
  const expectedRepo = new ExpectedInvoiceRepository();
  const fileRepo = new FileRepository();

  const invoices = await invoiceRepo.list();
  const expectedInvoices = await expectedRepo.listWithFiles({ status: ['pending'] });

  const finals: Final[] = invoices.map((inv) => {
    let filePath: string | undefined;
    let fileHash: string | null = null;
    if (inv.fileId) {
      const file = fileRepo.findById(inv.fileId);
      if (file) {
        filePath = file.storagePath;
        fileHash = file.fileHash ?? null;
      }
    }
    return {
      source: 'final',
      id: inv.id,
      cuit: inv.emitterCuit,
      emitterName: undefined,
      issueDate: normalizeToISO(inv.issueDate),
      invoiceType: inv.invoiceType,
      pointOfSale: inv.pointOfSale,
      invoiceNumber: inv.invoiceNumber,
      total: inv.total ?? null,
      file: filePath,
      fileHash,
      categoryId: inv.categoryId ?? null,
      fileId: inv.fileId ?? null,
      expectedInvoiceId: inv.expectedInvoiceId ?? null,
    };
  });

  const expectedIdsLinkedToInvoice = new Set(
    finals.map((f) => f.expectedInvoiceId).filter((id): id is number => id != null)
  );

  const expecteds: Expected[] = expectedInvoices
    .filter((inv) => !expectedIdsLinkedToInvoice.has(inv.id))
    .map((inv) => ({
      source: 'expected',
      id: inv.id,
      cuit: inv.cuit,
      emitterName: inv.emitterName,
      issueDate: inv.issueDate,
      invoiceType: inv.invoiceType,
      pointOfSale: inv.pointOfSale,
      invoiceNumber: inv.invoiceNumber,
      total: inv.total,
      status: inv.status,
    }));

  const items = [...expecteds, ...finals];

  return c.json({ count: items.length, items });
});

invoicesKnownRouter.post('/category', async (c) => {
  const body = await c.req
    .json<{ expectedId?: number; categoryId?: number }>()
    .catch(() => ({}) as { expectedId?: number; categoryId?: number });
  const { expectedId, categoryId } = body;
  if (!expectedId || !categoryId) {
    return c.json({ ok: false, error: 'expectedId and categoryId are required' }, 400);
  }

  const categoryRepo = new CategoryRepository();
  const category = await categoryRepo.findById(categoryId);
  if (!category) {
    return c.json({ ok: false, error: 'Category not found' }, 404);
  }

  const expectedInvoiceRepo = new ExpectedInvoiceRepository();

  try {
    const expectedInvoice = await expectedInvoiceRepo.findById(expectedId);
    if (!expectedInvoice) {
      return c.json({ ok: false, error: 'Expected invoice not found' }, 404);
    }

    return c.json({ ok: true });
  } catch (error) {
    console.error('Error updating category:', error);
    return c.json({ ok: false, error: 'Failed to update category' }, 500);
  }
});
