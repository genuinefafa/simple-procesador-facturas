/**
 * API endpoint para gestionar archivos pendientes
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PendingFileRepository } from '@server/database/repositories/pending-file.js';
import type { PendingFileStatus } from '@server/database/repositories/pending-file.js';

/**
 * GET /api/pending-files?status=pending
 * Lista archivos pendientes con filtros opcionales
 */
export const GET: RequestHandler = async ({ url }) => {
  console.info('📋 [PENDING-FILES] Listando archivos pendientes...');

  try {
    const pendingFileRepo = new PendingFileRepository();

    // Obtener parámetros de query
    const statusParam = url.searchParams.get('status');
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');

    // Parse status (puede ser múltiple separado por coma)
    let status: PendingFileStatus | PendingFileStatus[] | undefined;
    if (statusParam) {
      const statuses = statusParam.split(',') as PendingFileStatus[];
      status = statuses.length === 1 ? statuses[0] : statuses;
    }

    // Parse limit y offset
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;
    const offset = offsetParam ? parseInt(offsetParam, 10) : undefined;

    const pendingFiles = pendingFileRepo.list({ status, limit, offset });
    const counts = pendingFileRepo.countByStatus();

    console.info(`✅ [PENDING-FILES] Encontrados ${pendingFiles.length} archivos`);

    return json({
      success: true,
      pendingFiles,
      counts,
    });
  } catch (error) {
    console.error('❌ [PENDING-FILES] Error:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
};
