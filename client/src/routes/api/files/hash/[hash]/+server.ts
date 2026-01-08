/**
 * API endpoint para buscar archivos por hash
 * GET /api/files/hash/:hash
 *
 * Busca tanto en pending_files como en facturas
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PendingFileRepository } from '@server/database/repositories/pending-file.js';
import { InvoiceRepository } from '@server/database/repositories/invoice.js';

export const GET: RequestHandler = async ({ params }) => {
  const { hash } = params;

  if (!hash || hash.length < 16) {
    return json({ error: 'Hash inválido (mínimo 16 caracteres)' }, { status: 400 });
  }

  try {
    const pendingFileRepo = new PendingFileRepository();
    const invoiceRepo = new InvoiceRepository();

    // Buscar en pending files
    const pendingFiles = await pendingFileRepo.findByHash(hash);

    // Buscar en invoices (facturas)
    const invoices = await invoiceRepo.findByFileHash(hash);

    // También intentar con hash corto (primeros 16 chars) si no se encontró con hash completo
    let pendingFilesShort: typeof pendingFiles = [];
    let invoicesShort: typeof invoices = [];

    if (hash.length > 16 && pendingFiles.length === 0 && invoices.length === 0) {
      const shortHash = hash.substring(0, 16);
      pendingFilesShort = await pendingFileRepo.findByHash(shortHash);
      invoicesShort = await invoiceRepo.findByFileHash(shortHash);
    }

    const allPendingFiles = [...pendingFiles, ...pendingFilesShort];
    const allInvoices = [...invoices, ...invoicesShort];

    const found = allPendingFiles.length > 0 || allInvoices.length > 0;

    return json({
      found,
      hash,
      results: {
        pendingFiles: allPendingFiles.map((pf) => ({
          id: pf.id,
          filename: pf.originalFilename,
          status: pf.status,
          uploadDate: pf.uploadDate,
          extractedCuit: pf.extractedCuit,
          extractedDate: pf.extractedDate,
          extractedType: pf.extractedType,
          fileHash: pf.fileHash,
        })),
        invoices: allInvoices.map((inv) => ({
          id: inv.id,
          emitterCuit: inv.emitterCuit,
          issueDate: inv.issueDate,
          invoiceType: inv.invoiceType,
          fullInvoiceNumber: inv.fullInvoiceNumber,
          total: inv.total,
          processedFile: inv.processedFile,
          fileHash: inv.fileHash,
        })),
      },
      totalFound: allPendingFiles.length + allInvoices.length,
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
