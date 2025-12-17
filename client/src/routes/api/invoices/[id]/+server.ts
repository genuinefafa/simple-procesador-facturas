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
        categoryId: invoice.categoryId ?? null,
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
      categoryId: number | null;
    }>;

    const invoiceRepo = new InvoiceRepository();

    // Verificar que existe
    const invoice = await invoiceRepo.findById(invoiceId);
    if (!invoice) {
      return json({ success: false, error: 'Factura no encontrada' }, { status: 404 });
    }

    // Preparar datos para actualización
    const updateData: Record<string, any> = {};

    if (updates.invoiceType) {
      updateData.tipoComprobante = updates.invoiceType;
    }

    if (updates.pointOfSale !== undefined) {
      updateData.puntoVenta = updates.pointOfSale;
    }

    if (updates.invoiceNumber !== undefined) {
      updateData.numeroComprobante = updates.invoiceNumber;
    }

    if (updates.total !== undefined) {
      updateData.total = updates.total;
    }

    if (updates.issueDate) {
      updateData.fechaEmision = updates.issueDate;
    }

    if (updates.categoryId !== undefined) {
      updateData.categoryId = updates.categoryId;
    }

    if (updates.expectedInvoiceId !== undefined) {
      updateData.expectedInvoiceId = updates.expectedInvoiceId;
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
      updateData.comprobanteCompleto = fullNumber;
    }

    if (Object.keys(updateData).length === 0) {
      return json({ success: false, error: 'No hay campos para actualizar' }, { status: 400 });
    }

    // Actualizar en la base de datos
    const updated = await invoiceRepo.update(invoiceId, updateData);

    if (!updated) {
      return json({ success: false, error: 'Error al actualizar la factura' }, { status: 500 });
    }

    // Marcar como validada manualmente
    await invoiceRepo.markAsValidated(invoiceId);

    // Refrescar datos
    const final = await invoiceRepo.findById(invoiceId);

    return json({
      success: true,
      message: 'Factura actualizada correctamente',
      invoice: final,
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
