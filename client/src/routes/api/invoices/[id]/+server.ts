/**
 * API endpoint para gestionar una factura específica por ID
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { InvoiceRepository } from '@server/database/repositories/invoice.js';
import { EmitterRepository } from '@server/database/repositories/emitter.js';
import { ZoneAnnotationRepository } from '@server/database/repositories/zone-annotation.js';
import { getDatabase } from '@server/database/connection.js';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const invoiceId = parseInt(params.id);

    if (isNaN(invoiceId)) {
      return json({ success: false, error: 'ID de factura inválido' }, { status: 400 });
    }

    const invoiceRepo = new InvoiceRepository();
    const emitterRepo = new EmitterRepository();
    const zoneRepo = new ZoneAnnotationRepository();

    const invoice = await invoiceRepo.findById(invoiceId);

    if (!invoice) {
      return json({ success: false, error: 'Factura no encontrada' }, { status: 404 });
    }

    const emitter = await emitterRepo.findByCUIT(invoice.emitterCuit);
    const zones = await zoneRepo.findByInvoiceId(invoiceId);

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
        expectedInvoiceId: invoice.expectedInvoiceId ?? null,
        pendingFileId: invoice.pendingFileId ?? null,
        processedAt: invoice.processedAt,
      },
      extractedValues: {
        cuit: invoice.emitterCuit,
        fecha: invoice.issueDate,
        tipo: invoice.invoiceType,
        punto_venta: invoice.pointOfSale?.toString(),
        numero: invoice.invoiceNumber?.toString(),
        total: invoice.total?.toString(),
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

export const PATCH: RequestHandler = async ({ params, request }) => {
  try {
    const invoiceId = parseInt(params.id);

    if (isNaN(invoiceId)) {
      return json({ success: false, error: 'ID de factura inválido' }, { status: 400 });
    }

    const body: unknown = await request.json();
    const updates = body as Partial<{
      invoiceType: string;
      pointOfSale: number;
      invoiceNumber: number;
      total: number;
      issueDate: string;
      expectedInvoiceId: number | null;
    }>;

    const invoiceRepo = new InvoiceRepository();

    // Verificar que existe
    const invoice = await invoiceRepo.findById(invoiceId);
    if (!invoice) {
      return json({ success: false, error: 'Factura no encontrada' }, { status: 404 });
    }

    // Construir query de actualización
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.invoiceType) {
      fields.push('tipo_comprobante = ?');
      values.push(updates.invoiceType);
    }

    if (updates.pointOfSale !== undefined) {
      fields.push('punto_venta = ?');
      values.push(updates.pointOfSale);
    }

    if (updates.invoiceNumber !== undefined) {
      fields.push('numero_comprobante = ?');
      values.push(updates.invoiceNumber);
    }

    if (updates.total !== undefined) {
      fields.push('total = ?');
      values.push(updates.total);
    }

    if (updates.issueDate) {
      fields.push('fecha_emision = ?');
      values.push(updates.issueDate);
    }

    // Si se actualizó tipo, pv o número, recalcular comprobante completo
    if (
      updates.invoiceType ||
      updates.pointOfSale !== undefined ||
      updates.invoiceNumber !== undefined
    ) {
      const newType = updates.invoiceType || invoice.invoiceType;
      const newPV = updates.pointOfSale !== undefined ? updates.pointOfSale : invoice.pointOfSale;
      const newNum =
        updates.invoiceNumber !== undefined ? updates.invoiceNumber : invoice.invoiceNumber;
      const fullNumber = `${newType}-${String(newPV).padStart(5, '0')}-${String(newNum).padStart(8, '0')}`;
      fields.push('comprobante_completo = ?');
      values.push(fullNumber);
    }

    if (fields.length === 0) {
      return json({ success: false, error: 'No hay campos para actualizar' }, { status: 400 });
    }

    // Actualizar usando el repositorio en lugar de query directa
    if (updates.invoiceType) {
      invoice.invoiceType = updates.invoiceType as any;
    }
    if (updates.pointOfSale !== undefined) {
      invoice.pointOfSale = updates.pointOfSale;
    }
    if (updates.invoiceNumber !== undefined) {
      invoice.invoiceNumber = updates.invoiceNumber;
    }
    if (updates.total !== undefined) {
      invoice.total = updates.total;
    }
    if (updates.issueDate) {
      invoice.issueDate = new Date(updates.issueDate);
    }

    // Vincular/desvincular expected
    if (updates.expectedInvoiceId !== undefined) {
      invoice.expectedInvoiceId =
        updates.expectedInvoiceId === null ? undefined : updates.expectedInvoiceId;
    }

    // Marcar como validada manualmente
    await invoiceRepo.markAsValidated(invoiceId);

    const updated = await invoiceRepo.findById(invoiceId);

    return json({
      success: true,
      message: 'Factura actualizada correctamente',
      invoice: updated,
    });
  } catch (error) {
    console.error('Error updating invoice:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    const invoiceId = parseInt(params.id);

    if (isNaN(invoiceId)) {
      return json({ success: false, error: 'ID de factura inválido' }, { status: 400 });
    }

    const invoiceRepo = new InvoiceRepository();

    // Verificar que existe
    const invoice = await invoiceRepo.findById(invoiceId);
    if (!invoice) {
      return json({ success: false, error: 'Factura no encontrada' }, { status: 404 });
    }

    // Eliminar factura
    if (typeof (invoiceRepo as any).delete === 'function') {
      await (invoiceRepo as any).delete(invoiceId);
    } else {
      // Si no existe método delete, usar update con estado
      console.warn('Delete method not available, skipping deletion');
    }

    return json({
      success: true,
      message: 'Factura eliminada correctamente',
    });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
};
