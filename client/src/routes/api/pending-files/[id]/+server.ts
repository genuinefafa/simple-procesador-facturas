/**
 * API endpoint para operaciones sobre un archivo pendiente específico
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PendingFileRepository } from '@server/database/repositories/pending-file.js';
import type { PendingFileStatus } from '@server/database/repositories/pending-file.js';
import { unlink } from 'fs/promises';
import { existsSync } from 'fs';

/**
 * GET /api/pending-files/:id
 * Obtener detalle de un archivo pendiente
 */
export const GET: RequestHandler = async ({ params }) => {
  console.info(`📋 [PENDING-FILE] Obteniendo archivo pendiente ID ${params.id}...`);

  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return json({ success: false, error: 'ID inválido' }, { status: 400 });
    }

    const pendingFileRepo = new PendingFileRepository();
    const pendingFile = pendingFileRepo.findById(id);

    if (!pendingFile) {
      return json({ success: false, error: 'Archivo pendiente no encontrado' }, { status: 404 });
    }

    console.info(`✅ [PENDING-FILE] Encontrado: ${pendingFile.originalFilename}`);

    return json({
      success: true,
      pendingFile,
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

/**
 * PATCH /api/pending-files/:id
 * Actualizar datos extraídos o estado de un archivo pendiente
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
  console.info(`✏️  [PENDING-FILE] Actualizando archivo pendiente ID ${params.id}...`);

  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return json({ success: false, error: 'ID inválido' }, { status: 400 });
    }

    const body: unknown = await request.json();
    const data = body as {
      status?: PendingFileStatus;
      extractedCuit?: string;
      extractedDate?: string;
      extractedTotal?: number;
      extractedType?: string;
      extractedPointOfSale?: number;
      extractedInvoiceNumber?: number;
      extractionConfidence?: number;
    };

    const pendingFileRepo = new PendingFileRepository();

    // Verificar que existe
    const existing = pendingFileRepo.findById(id);
    if (!existing) {
      return json({ success: false, error: 'Archivo pendiente no encontrado' }, { status: 404 });
    }

    let updated;

    // Si solo se actualiza el estado
    if (data.status && Object.keys(data).length === 1) {
      console.info(`📝 Actualizando solo estado a: ${data.status}`);
      updated = pendingFileRepo.updateStatus(id, data.status);
    } else {
      // Actualizar datos extraídos
      const extractedData = {
        extractedCuit: data.extractedCuit,
        extractedDate: data.extractedDate,
        extractedTotal: data.extractedTotal,
        extractedType: data.extractedType,
        extractedPointOfSale: data.extractedPointOfSale,
        extractedInvoiceNumber: data.extractedInvoiceNumber,
        extractionConfidence: data.extractionConfidence,
      };

      console.info(`📝 Actualizando datos extraídos`);
      updated = pendingFileRepo.updateExtractedData(id, extractedData);

      // Si también se especifica un estado, actualizarlo
      if (data.status) {
        updated = pendingFileRepo.updateStatus(id, data.status);
      }
    }

    console.info(`✅ [PENDING-FILE] Actualizado correctamente`);

    return json({
      success: true,
      pendingFile: updated,
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

/**
 * DELETE /api/pending-files/:id
 * Eliminar un archivo pendiente (registro y archivo físico)
 */
export const DELETE: RequestHandler = async ({ params }) => {
  console.info(`🗑️  [PENDING-FILE] Eliminando archivo pendiente ID ${params.id}...`);

  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return json({ success: false, error: 'ID inválido' }, { status: 400 });
    }

    const pendingFileRepo = new PendingFileRepository();

    // Obtener información del archivo antes de eliminarlo
    const pendingFile = pendingFileRepo.findById(id);
    if (!pendingFile) {
      return json({ success: false, error: 'Archivo pendiente no encontrado' }, { status: 404 });
    }

    // Eliminar archivo físico si existe
    if (existsSync(pendingFile.filePath)) {
      console.info(`🗑️  Eliminando archivo físico: ${pendingFile.filePath}`);
      await unlink(pendingFile.filePath);
    }

    // Eliminar registro de BD
    const deleted = pendingFileRepo.delete(id);
    if (!deleted) {
      return json({ success: false, error: 'No se pudo eliminar el registro' }, { status: 500 });
    }

    console.info(`✅ [PENDING-FILE] Eliminado correctamente: ${pendingFile.originalFilename}`);

    return json({
      success: true,
      message: 'Archivo pendiente eliminado correctamente',
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
