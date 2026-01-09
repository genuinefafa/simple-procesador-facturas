import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { InvoiceRepository } from '@server/database/repositories/invoice.js';

// Lista de facturas procesadas
export const GET: RequestHandler = async ({ url }) => {
  try {
    const repo = new InvoiceRepository();

    // Filtro opcional por pendingFileId
    const pendingFileIdParam = url.searchParams.get('pendingFileId');
    if (pendingFileIdParam) {
      const pendingFileId = parseInt(pendingFileIdParam, 10);
      if (!isNaN(pendingFileId)) {
        const invoices = await repo.findByPendingFileId(pendingFileId);
        return json({ success: true, invoices });
      }
    }

    const invoices = await repo.list();

    return json({ success: true, invoices });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ success: false, error: message }, { status: 500 });
  }
};
