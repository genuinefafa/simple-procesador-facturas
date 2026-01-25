/**
 * API endpoint para gestionar una factura específica por ID
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { InvoiceRepository } from '@server/database/repositories/invoice.js';
import { EmitterRepository } from '@server/database/repositories/emitter.js';
import { FileRepository } from '@server/database/repositories/file.js';
import { ZoneAnnotationRepository } from '@server/database/repositories/zone-annotation.js';
import { CategoryRepository } from '@server/database/repositories/category.js';
import { InvoiceFileService } from '@server/services/invoice-file.service.js';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const invoiceId = parseInt(params.id);

    if (isNaN(invoiceId)) {
      return json({ success: false, error: 'ID de factura inválido' }, { status: 400 });
    }

    const invoiceRepo = new InvoiceRepository();
    const emitterRepo = new EmitterRepository();
    const fileRepo = new FileRepository();
    const zoneRepo = new ZoneAnnotationRepository();

    const invoice = await invoiceRepo.findById(invoiceId);

    if (!invoice) {
      return json({ success: false, error: 'Factura no encontrada' }, { status: 404 });
    }

    // Obtener datos del archivo via fileId
    let originalFile: string | null = null;
    let storagePath: string | null = null;
    let fileHash: string | null = null;
    if (invoice.fileId) {
      const file = fileRepo.findById(invoice.fileId);
      if (file) {
        originalFile = file.originalFilename;
        storagePath = file.storagePath;
        fileHash = file.fileHash ?? null;
      }
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
        originalFile: originalFile,
        storagePath: storagePath,
        fileType: invoice.fileType,
        fileHash: fileHash,
        extractionConfidence: invoice.extractionConfidence,
        requiresReview: invoice.requiresReview,
        manuallyValidated: invoice.manuallyValidated,
        categoryId: invoice.categoryId ?? null,
        expectedInvoiceId: invoice.expectedInvoiceId ?? null,
        fileId: invoice.fileId ?? null,
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
      emitterCuit: string;
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

    if (updates.emitterCuit) {
      // Validar que el emisor existe
      const emitterRepo = new EmitterRepository();
      const emitter = await emitterRepo.findByCUIT(updates.emitterCuit);
      if (!emitter) {
        return json(
          { success: false, error: `Emisor con CUIT ${updates.emitterCuit} no encontrado` },
          { status: 400 }
        );
      }
      updateData.cuitEmisor = emitter.cuit; // Usar formato normalizado del emisor
    }

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

    // Si se cambió algo que afecta el nombre del archivo, renombrarlo/moverlo
    const fileService = new InvoiceFileService();

    if (fileService.shouldRenameFile(updates) && final && final.fileId) {
      try {
        const emitterRepo = new EmitterRepository();
        const emitter = await emitterRepo.findByCUIT(final.emitterCuit);

        if (!emitter) {
          console.warn(`[PATCH] Emisor no encontrado: ${final.emitterCuit}`);
        } else {
          const result = await fileService.renameWithCategoryResolution(
            final.fileId,
            {
              emitterCuit: final.emitterCuit,
              invoiceType: final.invoiceType,
              pointOfSale: final.pointOfSale,
              invoiceNumber: final.invoiceNumber,
              issueDate: final.issueDate,
              fileId: final.fileId,
            },
            emitter,
            final.categoryId
          );

          if (!result.success) {
            console.warn(`[PATCH] No se pudo renombrar archivo: ${result.error}`);
          }
        }
      } catch (err) {
        console.error('[PATCH] Error renombrando archivo:', err);
        // No fallar el PATCH si el renombrado falla
      }
    }

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

    // Eliminar factura con desvinculación segura
    const result = await invoiceRepo.deleteWithUnlink(invoiceId);

    if (!result.success) {
      return json({ success: false, error: result.error }, { status: 404 });
    }

    // Preparar mensaje informativo
    const messages: string[] = ['Factura eliminada correctamente'];
    if (result.unlinkedExpected) {
      messages.push(
        `Factura esperada #${result.unlinkedExpected} desvinculada y marcada como pendiente`
      );
    }
    if (result.unlinkedFile) {
      messages.push(`Archivo #${result.unlinkedFile} desvinculado y marcado como subido`);
    }

    return json({
      success: true,
      message: messages.join('. '),
      unlinkedExpected: result.unlinkedExpected,
      unlinkedFile: result.unlinkedFile,
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
