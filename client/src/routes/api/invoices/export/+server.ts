/**
 * API endpoint para exportar facturas procesadas
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { FileExportService } from '@server/services/file-export.service.js';
import { InvoiceRepository } from '@server/database/repositories/invoice.js';
import { FileRepository } from '@server/database/repositories/file.js';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), '..', 'data');
const OUTPUT_DIR = join(process.cwd(), '..', 'data', 'finalized');

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body: unknown = await request.json();
    const { invoiceIds } = body as { invoiceIds: number[] };

    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return json(
        { success: false, error: 'Se requiere un array de IDs de facturas' },
        { status: 400 }
      );
    }

    const invoiceRepo = new InvoiceRepository();
    const fileRepo = new FileRepository();
    const exportService = new FileExportService(OUTPUT_DIR);

    const invoices = (await Promise.all(invoiceIds.map((id) => invoiceRepo.findById(id)))).filter(
      (inv) => inv !== null
    );

    if (invoices.length === 0) {
      return json({ success: false, error: 'No se encontraron facturas' }, { status: 404 });
    }

    // Exportar cada factura
    const results = await Promise.all(
      invoices.map(async (invoice) => {
        // Obtener ruta del archivo via fileId
        let originalPath = '';
        if (invoice.fileId) {
          const file = fileRepo.findById(invoice.fileId);
          if (file) {
            originalPath = join(DATA_DIR, file.storagePath);
          }
        }
        return {
          invoice,
          result: await exportService.exportInvoice(invoice, originalPath),
        };
      })
    );

    const successful = results.filter((r) => r.result.success);
    const failed = results.filter((r) => !r.result.success);

    return json({
      success: failed.length === 0,
      message: `Exportadas ${successful.length}/${invoices.length} facturas`,
      stats: {
        total: invoices.length,
        successful: successful.length,
        failed: failed.length,
      },
      results: results.map((r) => ({
        invoiceId: r.invoice.id,
        fullInvoiceNumber: r.invoice.fullInvoiceNumber,
        success: r.result.success,
        newPath: r.result.newPath,
        error: r.result.error,
      })),
    });
  } catch (error) {
    console.error('Error exporting invoices:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
};
