/**
 * API endpoint para obtener una factura específica por ID
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { InvoiceRepository } from '../../../../../../src/database/repositories/invoice.js';
import { EmitterRepository } from '../../../../../../src/database/repositories/emitter.js';
import { ZoneAnnotationRepository } from '../../../../../../src/database/repositories/zone-annotation.js';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const invoiceId = parseInt(params.id);

    if (isNaN(invoiceId)) {
      return json({ success: false, error: 'ID de factura inválido' }, { status: 400 });
    }

    const invoiceRepo = new InvoiceRepository();
    const emitterRepo = new EmitterRepository();
    const zoneRepo = new ZoneAnnotationRepository();

    const invoice = invoiceRepo.findById(invoiceId);

    if (!invoice) {
      return json({ success: false, error: 'Factura no encontrada' }, { status: 404 });
    }

    const emitter = emitterRepo.findByCUIT(invoice.emitterCuit);
    const zones = zoneRepo.findByInvoiceId(invoiceId);

    return json({
      success: true,
      invoice: {
        id: invoice.id,
        emitterCuit: invoice.emitterCuit,
        emitterName: emitter?.name || 'Desconocido',
        emitterAlias: emitter?.aliases[0] || null,
        issueDate: invoice.issueDate,
        invoiceType: invoice.invoiceType,
        pointOfSale: invoice.pointOfSale,
        invoiceNumber: invoice.invoiceNumber,
        fullInvoiceNumber: invoice.fullInvoiceNumber,
        total: invoice.total,
        currency: invoice.currency,
        originalFile: invoice.originalFile,
        processedFile: invoice.processedFile,
        fileType: invoice.fileType,
        extractionConfidence: invoice.extractionConfidence,
        requiresReview: invoice.requiresReview,
        manuallyValidated: invoice.manuallyValidated,
      },
      zones: zones.map((zone) => ({
        id: zone.id,
        field: zone.field,
        x: zone.x,
        y: zone.y,
        width: zone.width,
        height: zone.height,
        extractedValue: zone.extractedValue,
      })),
    });
  } catch (error) {
    console.error('Error fetching invoice:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
};
