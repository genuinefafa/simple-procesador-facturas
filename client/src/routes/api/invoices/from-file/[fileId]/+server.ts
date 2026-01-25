/**
 * POST /api/invoices/from-file/:fileId
 * Thin controller: parsea request, delega a InvoiceCreationService, formatea response.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  InvoiceCreationService,
  type InvoiceCreationData,
  type InvoiceCreationOptions,
} from '@server/services/invoice-creation.service';

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const fileId = parseInt(params.fileId, 10);
    if (isNaN(fileId)) {
      return json({ success: false, error: 'ID de archivo inválido' }, { status: 400 });
    }

    const body: unknown = await request.json();
    const { source, expectedId, data } = body as {
      source: 'extraction' | 'expected' | 'manual';
      expectedId?: number;
      data: InvoiceCreationData;
    };

    if (!source || !data) {
      return json({ success: false, error: 'Se requieren campos: source, data' }, { status: 400 });
    }

    if (
      !data.cuit ||
      !data.invoiceType ||
      data.pointOfSale == null ||
      data.invoiceNumber == null ||
      !data.issueDate ||
      !data.total
    ) {
      return json({ success: false, error: 'Datos de factura incompletos' }, { status: 400 });
    }

    const options: InvoiceCreationOptions = { source, expectedId };

    const service = new InvoiceCreationService();
    const result = await service.createFromFile(fileId, data, options);

    if (!result.success) {
      return json({ success: false, error: result.error }, { status: 400 });
    }

    return json({ success: true, invoice: result.invoice });
  } catch (error) {
    console.error('❌ [FROM-FILE] Error:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
};
