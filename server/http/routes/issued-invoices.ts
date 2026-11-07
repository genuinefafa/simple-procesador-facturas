/**
 * Hono router for /api/issued-invoices (read-only; the import goes through
 * POST /api/expected-invoices/import, which detects the "Emitidos" layout).
 */

import { Hono } from 'hono';

import { IssuedInvoicesQuerySchema } from '../../contracts/issued-invoices';
import { formatZodError } from '../../contracts';
import { IssuedInvoiceRepository } from '../../database/repositories/issued-invoice';

export const issuedInvoicesRouter = new Hono();

// GET /api/issued-invoices?from=YYYY-MM-DD&to=YYYY-MM-DD
issuedInvoicesRouter.get('/', (c) => {
  const parsed = IssuedInvoicesQuerySchema.safeParse({
    from: c.req.query('from'),
    to: c.req.query('to'),
  });
  if (!parsed.success) {
    return c.json(formatZodError(parsed.error), 400);
  }

  const invoices = new IssuedInvoiceRepository().list(parsed.data);
  return c.json({ success: true, count: invoices.length, invoices });
});
