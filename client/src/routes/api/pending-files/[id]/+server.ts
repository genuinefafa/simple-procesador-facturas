/**
 * API endpoint para operaciones con un archivo pendiente específico
 * GET /api/pending-files/:id - Obtener detalles
 * PATCH /api/pending-files/:id - Actualizar datos
 * DELETE /api/pending-files/:id - Eliminar
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PendingFileRepository } from '@server/database/repositories/pending-file.js';
import { unlink } from 'fs/promises';
import { existsSync } from 'fs';

export const GET: RequestHandler = async ({ params }) => {
  console.info(`📄 [PENDING-FILE] Obteniendo detalles del archivo ID=${params.id}...`);

  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return json({ success: false, error: 'ID inválido' }, { status: 400 });
    }

    const pendingFileRepo = new PendingFileRepository();
    const pendingFile = pendingFileRepo.findById(id);

    if (!pendingFile) {
      console.warn(`⚠️  [PENDING-FILE] No encontrado: ID=${id}`);
      return json({ success: false, error: 'Archivo no encontrado' }, { status: 404 });
    }

    console.info(`✅ [PENDING-FILE] Encontrado: ${pendingFile.originalFilename}`);

    return json({
      success: true,
      data: pendingFile,
    });
  } catch (error) {
    console.error('❌ [PENDING-FILE] Error:', error);
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
  console.info(`✏️  [PENDING-FILE] Actualizando archivo ID=${params.id}...`);

  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return json({ success: false, error: 'ID inválido' }, { status: 400 });
    }

    const body: unknown = await request.json();
    const updateData = body as {
      extractedCuit?: string;
      extractedDate?: string;
      extractedTotal?: number;
      extractedType?: string;
      extractedPointOfSale?: number;
      extractedInvoiceNumber?: number;
      extractionConfidence?: number;
      status?: 'pending' | 'reviewing' | 'processed' | 'failed';
    };

    const pendingFileRepo = new PendingFileRepository();

    // Verificar que existe
    const existing = pendingFileRepo.findById(id);
    if (!existing) {
      return json({ success: false, error: 'Archivo no encontrado' }, { status: 404 });
    }

    // Actualizar datos extraídos si se proporcionaron
    if (
      updateData.extractedCuit !== undefined ||
      updateData.extractedDate !== undefined ||
      updateData.extractedTotal !== undefined ||
      updateData.extractedType !== undefined ||
      updateData.extractedPointOfSale !== undefined ||
      updateData.extractedInvoiceNumber !== undefined ||
      updateData.extractionConfidence !== undefined
    ) {
      pendingFileRepo.updateExtractedData(id, {
        extractedCuit: updateData.extractedCuit,
        extractedDate: updateData.extractedDate,
        extractedTotal: updateData.extractedTotal,
        extractedType: updateData.extractedType,
        extractedPointOfSale: updateData.extractedPointOfSale,
        extractedInvoiceNumber: updateData.extractedInvoiceNumber,
        extractionConfidence: updateData.extractionConfidence,
      });
    }

    // Actualizar estado si se proporcionó
    if (updateData.status) {
      pendingFileRepo.updateStatus(id, updateData.status);
    }

    const updated = pendingFileRepo.findById(id);

    console.info(`✅ [PENDING-FILE] Actualizado: ${updated!.originalFilename}`);

    return json({
      success: true,
      message: 'Archivo actualizado correctamente',
      data: updated,
    });
  } catch (error) {
    console.error('❌ [PENDING-FILE] Error:', error);
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
  console.info(`🗑️  [PENDING-FILE] Eliminando archivo ID=${params.id}...`);

  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return json({ success: false, error: 'ID inválido' }, { status: 400 });
    }

    const pendingFileRepo = new PendingFileRepository();

    // Verificar que existe
    const existing = pendingFileRepo.findById(id);
    if (!existing) {
      return json({ success: false, error: 'Archivo no encontrado' }, { status: 404 });
    }

    // Eliminar archivo físico si existe
    if (existsSync(existing.filePath)) {
      await unlink(existing.filePath);
      console.info(`🗑️  [PENDING-FILE] Archivo físico eliminado: ${existing.filePath}`);
    }

    // Eliminar registro de BD
    const deleted = pendingFileRepo.delete(id);

    if (!deleted) {
      return json({ success: false, error: 'No se pudo eliminar el archivo' }, { status: 500 });
    }

    console.info(`✅ [PENDING-FILE] Eliminado: ${existing.originalFilename}`);

    return json({
      success: true,
      message: 'Archivo eliminado correctamente',
    });
  } catch (error) {
    console.error('❌ [PENDING-FILE] Error:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
};
