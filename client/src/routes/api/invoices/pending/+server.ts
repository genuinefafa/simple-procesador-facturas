/**
 * API endpoint para obtener facturas pendientes de revisión
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Importar repositorios desde @server
import type { Invoice } from '@server/utils/types.js';
import { InvoiceRepository } from '@server/database/repositories/invoice.js';
import { EmitterRepository } from '@server/database/repositories/emitter.js';

export const GET: RequestHandler = async () => {
  try {
    const invoiceRepo = new InvoiceRepository();
    const emitterRepo = new EmitterRepository();

    // Obtener todas las facturas recientes (ordenadas por fecha)
    // El frontend puede filtrar por confianza o estado de revisión
    const pendingInvoices = invoiceRepo.list({
      limit: 50,
    });

    // Enriquecer con datos del emisor
    const enrichedInvoices = pendingInvoices.map((invoice: Invoice) => {
      const emitter = emitterRepo.findByCUIT(invoice.emitterCuit);
      return {
        id: invoice.id,
        emitterCuit: invoice.emitterCuit,
        emitterName: emitter?.name || 'Desconocido',
        emitterAlias: emitter?.aliases[0] || null,
        issueDate: invoice.issueDate,
        invoiceType: invoice.invoiceType,
        fullInvoiceNumber: invoice.fullInvoiceNumber,
        total: invoice.total,
        originalFile: invoice.originalFile,
        extractionConfidence: invoice.extractionConfidence,
        requiresReview: invoice.requiresReview,
        manuallyValidated: invoice.manuallyValidated,
      };
    });

    return json({
      success: true,
      count: enrichedInvoices.length,
      invoices: enrichedInvoices,
    });
  } catch (error) {
    console.error('Error fetching pending invoices:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
};
