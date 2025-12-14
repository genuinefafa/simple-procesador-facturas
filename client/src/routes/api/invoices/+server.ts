import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { InvoiceRepository } from '@server/database/repositories/invoice.js';

// Lista de facturas procesadas
export const GET: RequestHandler = async () => {
  try {
    const repo = new InvoiceRepository();
    const invoices = await repo.list();

    return json({ success: true, invoices });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ success: false, error: message }, { status: 500 });
  }
};
