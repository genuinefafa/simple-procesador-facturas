/**
 * GET /api/emisores/[id]/archivos
 * Returns all invoices (with associated files) for a given emitter,
 * including the canonical path diff for detecting inconsistencies.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { EmitterRepository } from '@server/database/repositories/emitter.js';
import { InvoiceRepository } from '@server/database/repositories/invoice.js';
import { FileRepository } from '@server/database/repositories/file.js';
import { CategoryRepository } from '@server/database/repositories/category.js';
import { InvoiceFileService } from '@server/services/invoice-file.service.js';

const emitterRepo = new EmitterRepository();

export const GET: RequestHandler = async ({ params }) => {
  const { id } = params;

  try {
    const emitter = emitterRepo.findById(id);
    if (!emitter) {
      return json({ error: 'Emisor no encontrado' }, { status: 404 });
    }

    const invoiceRepo = new InvoiceRepository();
    const fileRepo = new FileRepository();
    const categoryRepo = new CategoryRepository();
    const fileService = new InvoiceFileService();

    // List invoices for this emitter, sorted by date desc
    const invoices = await invoiceRepo.list({ emitterCuit: emitter.cuit });

    const result = await Promise.all(
      invoices.map(async (invoice) => {
        const file = invoice.fileId ? fileRepo.findById(invoice.fileId) : null;
        const currentStoragePath = file?.storagePath ?? null;

        // Resolve category key for canonical path calculation
        let categoryKey: string | null = null;
        if (invoice.categoryId) {
          const category = await categoryRepo.findById(invoice.categoryId);
          categoryKey = category?.key ?? null;
        }

        // Compute canonical path (relative, e.g. "finalized/2024-01/...")
        let canonicalRelativePath: string | null = null;
        if (file) {
          const { relativePath } = fileService.generateCanonicalPath(
            {
              emitterCuit: invoice.emitterCuit,
              invoiceType: invoice.invoiceType,
              pointOfSale: invoice.pointOfSale,
              invoiceNumber: invoice.invoiceNumber,
              issueDate: invoice.issueDate.toISOString().split('T')[0],
              fileId: invoice.fileId ?? null,
            },
            emitter,
            file.originalFilename,
            categoryKey
          );
          canonicalRelativePath = relativePath;
        }

        const isInconsistent =
          currentStoragePath !== null &&
          canonicalRelativePath !== null &&
          currentStoragePath !== canonicalRelativePath;

        return {
          invoiceId: invoice.id,
          issueDate: invoice.issueDate.toISOString().split('T')[0],
          invoiceType: invoice.invoiceType,
          pointOfSale: invoice.pointOfSale,
          invoiceNumber: invoice.invoiceNumber,
          categoryId: invoice.categoryId ?? null,
          currentStoragePath,
          canonicalRelativePath,
          isInconsistent,
        };
      })
    );

    return json({ archivos: result });
  } catch (e) {
    console.error('Error fetching archivos for emitter:', e);
    return json(
      { error: 'Error al obtener archivos del emisor', message: String(e) },
      { status: 500 }
    );
  }
};
