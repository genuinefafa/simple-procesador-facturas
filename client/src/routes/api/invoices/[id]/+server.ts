/**
 * API endpoint para gestionar una factura específica por ID
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { InvoiceRepository } from '@server/database/repositories/invoice.js';
import { EmitterRepository } from '@server/database/repositories/emitter.js';
import { ZoneAnnotationRepository } from '@server/database/repositories/zone-annotation.js';
import { CategoryRepository } from '@server/database/repositories/category.js';
import { getDatabase } from '@server/database/connection.js';
import { generateProcessedFilename, generateSubdirectory } from '@server/utils/file-naming.js';
import { join, dirname } from 'path';
import { rename, access, mkdir } from 'fs/promises';
import { existsSync, readdirSync, statSync } from 'fs';

const FINALIZED_DIR = join(process.cwd(), '..', 'data', 'finalized');

/**
 * Busca un archivo en el filesystem basándose en CUIT y número de factura
 * Útil cuando la fecha o categoría cambió y el nombre ya no coincide
 */
async function findFileByInvoiceData(
  cuit: string,
  tipo: number,
  pv: number,
  num: number
): Promise<string | null> {
  try {
    const cuitNumeric = cuit.replace(/\D/g, '');
    const pvFormatted = String(pv).padStart(5, '0');
    const numFormatted = String(num).padStart(8, '0');

    // Buscar archivos que contengan estos identificadores
    const subdirs = readdirSync(FINALIZED_DIR).filter((item) => {
      const itemPath = join(FINALIZED_DIR, item);
      return statSync(itemPath).isDirectory();
    });

    for (const subdir of subdirs) {
      const subdirPath = join(FINALIZED_DIR, subdir);
      const files = readdirSync(subdirPath);

      for (const file of files) {
        // Buscar archivo que contenga CUIT y número de factura
        if (file.includes(cuitNumeric) && file.includes(`${pvFormatted}-${numFormatted}`)) {
          const candidatePath = join(subdirPath, file);
          console.log(`[FIND-FILE] Encontrado por CUIT/número en ${subdir}: ${file}`);
          return candidatePath;
        }
      }
    }
  } catch (err) {
    console.error('[FIND-FILE] Error:', err);
  }

  return null;
}

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
        fileHash: invoice.fileHash,
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

    // Si se cambió algo que afecta el nombre del archivo, renombrarlo/moverlo
    const shouldRenameFile =
      updates.invoiceType ||
      updates.pointOfSale !== undefined ||
      updates.invoiceNumber !== undefined ||
      updates.issueDate;

    if (shouldRenameFile && final) {
      try {
        const emitterRepo = new EmitterRepository();
        const categoryRepo = new CategoryRepository();

        const emitter = await emitterRepo.findByCUIT(final.emitterCuit);
        if (!emitter) {
          console.warn(`[PATCH] Emisor no encontrado: ${final.emitterCuit}`);
        } else {
          // Obtener categoryKey si tiene categoría
          let categoryKey: string | null = null;
          if (final.categoryId) {
            const category = await categoryRepo.findById(final.categoryId);
            categoryKey = category?.key || null;
          }

          // Generar nuevo nombre y ruta
          const issueDate = new Date(final.issueDate);
          const subdir = generateSubdirectory(issueDate);
          const newFileName = generateProcessedFilename(
            issueDate,
            emitter,
            final.invoiceType,
            final.pointOfSale,
            final.invoiceNumber,
            final.originalFile,
            categoryKey
          );

          const newPath = join(FINALIZED_DIR, subdir, newFileName);

          // Buscar archivo actual (puede estar en ruta diferente)
          let actualOldPath: string | null = null;
          if (existsSync(final.processedFile)) {
            actualOldPath = final.processedFile;
          } else if (final.invoiceType !== null) {
            actualOldPath = await findFileByInvoiceData(
              final.emitterCuit,
              final.invoiceType,
              final.pointOfSale,
              final.invoiceNumber
            );
          }

          if (actualOldPath && actualOldPath !== newPath) {
            // Crear directorio destino si no existe
            await mkdir(dirname(newPath), { recursive: true });
            // Mover archivo
            await rename(actualOldPath, newPath);
            // Actualizar ruta en DB
            await invoiceRepo.updateProcessedFile(invoiceId, newPath);
            console.log(`[PATCH] Archivo movido: ${actualOldPath} -> ${newPath}`);
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
    if (result.unlinkedPending) {
      messages.push(
        `Archivo pendiente #${result.unlinkedPending} desvinculado y marcado para revisión`
      );
    }

    return json({
      success: true,
      message: messages.join('. '),
      unlinkedExpected: result.unlinkedExpected,
      unlinkedPending: result.unlinkedPending,
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
