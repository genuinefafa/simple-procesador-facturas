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

    console.info(`✅ [FILE] Encontrado: ${file.originalFilename} → ${file.storagePath}`);

    // Obtener todas las extracciones (ordenadas por fecha DESC)
    const extractions = extractionRepo.findAllByFileId(id);
    // For backward compatibility, use the most recent extraction
    const extraction = extractions.length > 0 ? extractions[0] : null;

    // Formato compatible con el frontend
    const response = {
      id: file.id,
      originalFilename: file.originalFilename,
      filePath: file.storagePath,
      fileHash: file.fileHash,
      status: file.status,
      uploadDate: file.createdAt,
      fileSize: file.fileSize,
      fileType: file.fileType,
      categoryId: file.categoryId ?? null,
      // Datos de extracción más reciente (backward compatible)
      extractedCuit: extraction?.extractedCuit ?? null,
      extractedDate: extraction?.extractedDate ?? null,
      extractedTotal: extraction?.extractedTotal ?? null,
      extractedType: extraction?.extractedType ?? null,
      extractedPointOfSale: extraction?.extractedPointOfSale ?? null,
      extractedInvoiceNumber: extraction?.extractedInvoiceNumber ?? null,
      extractionConfidence: extraction?.confidence ?? null,
      extractionMethod: extraction?.method ?? null,
      extractionErrors: extraction?.errors ?? null,
      // All extractions for this file
      extractions: extractions.map((ext) => ({
        id: ext.id,
        method: ext.method,
        confidence: ext.confidence,
        extractedCuit: ext.extractedCuit,
        extractedDate: ext.extractedDate,
        extractedTotal: ext.extractedTotal,
        extractedType: ext.extractedType,
        extractedPointOfSale: ext.extractedPointOfSale,
        extractedInvoiceNumber: ext.extractedInvoiceNumber,
        extractedAt: ext.extractedAt,
        errors: ext.errors,
      })),
    };

    return json({
      success: true,
      file: response,
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
 * PATCH /api/files/:id
 * Actualizar propiedades de un archivo (ej: categoryId)
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
  console.info(`📝 [FILE] Actualizando archivo ID ${params.id}...`);

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

    const body = await request.json();

    // Actualizar categoryId si viene en el body
    if ('categoryId' in body) {
      fileRepo.updateCategory(id, body.categoryId);
      console.info(`✅ [FILE] Categoría actualizada para archivo ${id}`);
    }

    // Obtener el archivo actualizado
    const updatedFile = fileRepo.findById(id);

    return json({
      success: true,
      file: updatedFile,
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
