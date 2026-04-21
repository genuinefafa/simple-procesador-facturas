/**
 * POST /api/emisores/[id]/archivos/rename
 * Batch-renames invoice files to their canonical paths for a given emitter.
 *
 * Body: { invoiceIds: number[] }
 *
 * Response:
 *   renamed: [{invoiceId, from, to}]
 *   failed:  [{invoiceId, reason}]
 *   skipped: [{invoiceId, reason}]   — wrong emitter, already consistent, no file, etc.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { EmitterRepository } from '@server/database/repositories/emitter.js';
import { InvoiceRepository } from '@server/database/repositories/invoice.js';
import { FileRepository } from '@server/database/repositories/file.js';
import { InvoiceFileService } from '@server/services/invoice-file.service.js';
import { EmitterFilesRenameSchema, formatZodError } from '@server/contracts';

const emitterRepo = new EmitterRepository();

export const POST: RequestHandler = async ({ params, request }) => {
  const { id } = params;

  try {
    const emitter = emitterRepo.findById(id);
    if (!emitter) {
      return json({ error: 'Emisor no encontrado' }, { status: 404 });
    }

    const body: unknown = await request.json();
    const parseResult = EmitterFilesRenameSchema.safeParse(body);
    if (!parseResult.success) {
      return json(formatZodError(parseResult.error), { status: 400 });
    }

    const { invoiceIds } = parseResult.data;

    const invoiceRepo = new InvoiceRepository();
    const fileRepo = new FileRepository();
    const fileService = new InvoiceFileService();

    const renamed: { invoiceId: number; from: string; to: string }[] = [];
    const failed: { invoiceId: number; reason: string }[] = [];
    const skipped: { invoiceId: number; reason: string }[] = [];

    for (const invoiceId of invoiceIds) {
      const invoice = await invoiceRepo.findById(invoiceId);

      // Verify invoice exists and belongs to this emitter
      if (!invoice) {
        skipped.push({ invoiceId, reason: 'Factura no encontrada' });
        continue;
      }

      const normalizedEmitterCuit = emitter.cuit.replace(/[-\s]/g, '');
      const normalizedInvoiceCuit = invoice.emitterCuit.replace(/[-\s]/g, '');
      if (normalizedInvoiceCuit !== normalizedEmitterCuit) {
        skipped.push({ invoiceId, reason: 'La factura no pertenece a este emisor' });
        continue;
      }

      if (!invoice.fileId) {
        skipped.push({ invoiceId, reason: 'La factura no tiene archivo asociado' });
        continue;
      }

      const file = fileRepo.findById(invoice.fileId);
      if (!file) {
        skipped.push({ invoiceId, reason: 'Archivo no encontrado en base de datos' });
        continue;
      }

      // Check if already consistent (avoid unnecessary FS ops)
      const fromPath = file.storagePath;

      try {
        const result = await fileService.renameWithCategoryResolution(
          invoice.fileId,
          {
            emitterCuit: invoice.emitterCuit,
            invoiceType: invoice.invoiceType,
            pointOfSale: invoice.pointOfSale,
            invoiceNumber: invoice.invoiceNumber,
            issueDate: invoice.issueDate.toISOString().split('T')[0],
            fileId: invoice.fileId,
          },
          emitter,
          invoice.categoryId ?? null
        );

        if (!result.success) {
          failed.push({ invoiceId, reason: result.error ?? 'Error desconocido' });
          continue;
        }

        // If newPath equals the current path, the file was already in place
        if (result.relativePath === fromPath) {
          skipped.push({ invoiceId, reason: 'El archivo ya estaba en la ruta canónica' });
          continue;
        }

        renamed.push({
          invoiceId,
          from: fromPath,
          to: result.relativePath ?? '',
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        failed.push({ invoiceId, reason });
      }
    }

    return json({ renamed, failed, skipped });
  } catch (e) {
    console.error('Error in batch rename for emitter:', e);
    return json({ error: 'Error al renombrar archivos', message: String(e) }, { status: 500 });
  }
};
