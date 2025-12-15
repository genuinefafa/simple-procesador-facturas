/**
 * Endpoint para reasignar emisor a una factura
 * PATCH /api/invoices/:id/emisor
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { InvoiceRepository } from '@server/database/repositories/invoice';
import { EmitterRepository } from '@server/database/repositories/emitter';
import { getDatabase } from '@server/database/connection';

export const PATCH: RequestHandler = async ({ params, request }) => {
  try {
    const invoiceId = parseInt(params.id);

    if (isNaN(invoiceId)) {
      return json({ success: false, error: 'ID de factura inválido' }, { status: 400 });
    }

    const body: any = await request.json();
    const { newCuit } = body;

    if (!newCuit) {
      return json({ success: false, error: 'Missing required field: newCuit' }, { status: 400 });
    }

    const invoiceRepo = new InvoiceRepository();
    const emitterRepo = new EmitterRepository();

    // Verificar que existe la factura
    const invoice = await invoiceRepo.findById(invoiceId);
    if (!invoice) {
      return json({ success: false, error: 'Factura no encontrada' }, { status: 404 });
    }

    // Verificar que existe el emisor destino
    const newEmitter = emitterRepo.findByCUIT(newCuit);
    if (!newEmitter) {
      return json({ success: false, error: 'Emisor destino no encontrado' }, { status: 404 });
    }

    // Verificar unicidad: no debe existir otra factura con mismo (cuit, tipo, pv, número)
    const db = getDatabase();
    const duplicate = db
      .prepare(
        `
      SELECT id FROM facturas 
      WHERE emisor_cuit = ? 
        AND tipo_comprobante = ? 
        AND punto_venta = ? 
        AND numero_comprobante = ?
        AND id != ?
    `
      )
      .get(newCuit, invoice.invoiceType, invoice.pointOfSale, invoice.invoiceNumber, invoiceId);

    if (duplicate) {
      return json(
        {
          success: false,
          error: `Ya existe una factura con este CUIT y número: ${newCuit}`,
        },
        { status: 409 }
      );
    }

    // Actualizar la factura
    const stmt = db.prepare(`
      UPDATE facturas 
      SET emisor_cuit = ?
      WHERE id = ?
    `);
    stmt.run(newCuit, invoiceId);

    // TODO: log audit event (action='invoice.reassign_emitter',
    //   diff={emisorCuit:{from: invoice.emitterCuit, to: newCuit}})

    return json({
      success: true,
      message: 'Emisor actualizado correctamente',
      invoice: { id: invoiceId, emisorCuit: newCuit },
    });
  } catch (e) {
    console.error('Error reassigning emitter:', e);
    return json(
      { success: false, error: 'Failed to reassign emitter', message: String(e) },
      { status: 500 }
    );
  }
};
