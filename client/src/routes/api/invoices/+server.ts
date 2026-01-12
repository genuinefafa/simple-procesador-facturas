import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { InvoiceRepository } from '@server/database/repositories/invoice.js';

// Lista de facturas procesadas
export const GET: RequestHandler = async ({ url }) => {
  try {
    const repo = new InvoiceRepository();

    // Filtro opcional por fileId (nuevo modelo)
    const fileIdParam = url.searchParams.get('fileId');
    if (fileIdParam) {
      const fileId = parseInt(fileIdParam, 10);
      if (!isNaN(fileId)) {
        const invoices = await repo.findByFileId(fileId);
        return json({ success: true, invoices });
      }
    }

    // Filtro opcional por pendingFileId (legacy, mantener por compatibilidad)
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
