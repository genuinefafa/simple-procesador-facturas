/**
 * API endpoint para buscar archivos por hash
 * GET /api/files/hash/:hash
 *
 * Busca tanto en files como en facturas
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { FileRepository } from '@server/database/repositories/file.js';
import { FileExtractionRepository } from '@server/database/repositories/file-extraction.js';
import { InvoiceRepository } from '@server/database/repositories/invoice.js';

export const GET: RequestHandler = async ({ params }) => {
  const { hash } = params;

  if (!hash || hash.length < 16) {
    return json({ error: 'Hash inválido (mínimo 16 caracteres)' }, { status: 400 });
  }

  try {
    const fileRepo = new FileRepository();
    const extractionRepo = new FileExtractionRepository();
    const invoiceRepo = new InvoiceRepository();

    // Buscar en files
    const file = fileRepo.findByHash(hash);
    const files = file ? [file] : [];

    // Buscar en invoices (facturas)
    const invoices = await invoiceRepo.findByFileHash(hash);

    // También intentar con hash corto (primeros 16 chars) si no se encontró con hash completo
    let filesShort: typeof files = [];
    let invoicesShort: typeof invoices = [];

    if (hash.length > 16 && files.length === 0 && invoices.length === 0) {
      const shortHash = hash.substring(0, 16);
      const fileShort = fileRepo.findByHash(shortHash);
      if (fileShort) filesShort = [fileShort];
      invoicesShort = await invoiceRepo.findByFileHash(shortHash);
    }

    const allFiles = [...files, ...filesShort];
    const allInvoices = [...invoices, ...invoicesShort];

    const found = allFiles.length > 0 || allInvoices.length > 0;

    return json({
      found,
      hash,
      results: {
        files: allFiles.map((f) => {
          const extraction = extractionRepo.findByFileId(f.id);
          return {
            id: f.id,
            filename: f.originalFilename,
            status: f.status,
            uploadDate: f.createdAt,
            extractedCuit: extraction?.extractedCuit ?? null,
            extractedDate: extraction?.extractedDate ?? null,
            extractedType: extraction?.extractedType ?? null,
            fileHash: f.fileHash,
          };
        }),
        invoices: allInvoices.map((inv) => ({
          id: inv.id,
          emitterCuit: inv.emitterCuit,
          issueDate: inv.issueDate,
          invoiceType: inv.invoiceType,
          fullInvoiceNumber: inv.fullInvoiceNumber,
          total: inv.total,
          fileId: inv.fileId,
        })),
      },
      totalFound: allFiles.length + allInvoices.length,
    });
  } catch (error) {
    console.error('[HASH LOOKUP] Error:', error);
    return json(
      {
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
};
