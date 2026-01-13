/**
 * API endpoint para operaciones sobre un archivo (nuevo modelo)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { FileRepository } from '@server/database/repositories/file.js';
import { FileExtractionRepository } from '@server/database/repositories/file-extraction.js';

/**
 * GET /api/files/:id
 * Obtener detalle de un archivo (files + file_extraction_results)
 */
export const GET: RequestHandler = async ({ params }) => {
  console.info(`📋 [FILE] Obteniendo archivo ID ${params.id}...`);

  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return json({ success: false, error: 'ID inválido' }, { status: 400 });
    }

    const fileRepo = new FileRepository();
    const extractionRepo = new FileExtractionRepository();

    const file = fileRepo.findById(id);

    if (!file) {
      return json({ success: false, error: 'Archivo no encontrado' }, { status: 404 });
    }

    console.info(`✅ [FILE] Encontrado: ${file.originalFilename}`);

    // Obtener datos de extracción si existen
    const extraction = extractionRepo.findByFileId(id);

    // Formato compatible con el frontend (similar a pending_file)
    const response = {
      id: file.id,
      originalFilename: file.originalFilename,
      filePath: file.storagePath,
      fileHash: file.fileHash,
      status: file.status,
      uploadDate: file.createdAt,
      fileSize: file.fileSize,
      fileType: file.fileType,
      // Datos de extracción (si existen)
      extractedCuit: extraction?.extractedCuit ?? null,
      extractedDate: extraction?.extractedDate ?? null,
      extractedTotal: extraction?.extractedTotal ?? null,
      extractedType: extraction?.extractedType ?? null,
      extractedPointOfSale: extraction?.extractedPointOfSale ?? null,
      extractedInvoiceNumber: extraction?.extractedInvoiceNumber ?? null,
      extractionConfidence: extraction?.confidence ?? null,
      extractionMethod: extraction?.method ?? null,
      extractionErrors: extraction?.errors ?? null,
    };

    return json({
      success: true,
      pendingFile: response, // Mantener nombre por compatibilidad con frontend
    });
  } catch (error) {
    console.error('❌ [FILE] Error:', error);
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
 * DELETE /api/files/:id
 * Eliminar un archivo (soft delete: marca como deleted o hard delete si no tiene factura)
 */
export const DELETE: RequestHandler = async ({ params }) => {
  console.info(`🗑️  [FILE] Eliminando archivo ID ${params.id}...`);

  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return json({ success: false, error: 'ID inválido' }, { status: 400 });
    }

    const fileRepo = new FileRepository();
    const file = fileRepo.findById(id);

    if (!file) {
      return json({ success: false, error: 'Archivo no encontrado' }, { status: 404 });
    }

    // TODO: Verificar si tiene factura asociada antes de borrar
    // Por ahora simplemente borramos
    await fileRepo.delete(id);

    console.info(`✅ [FILE] Archivo ${id} eliminado`);

    return json({
      success: true,
      message: 'Archivo eliminado correctamente',
    });
  } catch (error) {
    console.error('❌ [FILE] Error:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
};
