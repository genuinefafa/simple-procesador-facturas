/**
 * API endpoint para listar archivos pendientes
 * GET /api/pending-files?status=pending&limit=50
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PendingFileRepository } from '@server/database/repositories/pending-file.js';

export const GET: RequestHandler = async ({ url }) => {
  console.info('📋 [PENDING-FILES] Listando archivos pendientes...');

  try {
    const pendingFileRepo = new PendingFileRepository();

    // Obtener parámetros de query
    const statusParam = url.searchParams.get('status');
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');
    const dateFromParam = url.searchParams.get('dateFrom');
    const dateToParam = url.searchParams.get('dateTo');

    // Construir filtros
    const filters: any = {};

    if (statusParam) {
      // Permitir múltiples estados separados por coma
      const statuses = statusParam.split(',');
      filters.status = statuses.length === 1 ? statuses[0] : statuses;
    }

    if (limitParam) {
      filters.limit = parseInt(limitParam, 10);
    }

    if (offsetParam) {
      filters.offset = parseInt(offsetParam, 10);
    }

    if (dateFromParam) {
      filters.dateFrom = dateFromParam;
    }

    if (dateToParam) {
      filters.dateTo = dateToParam;
    }

    console.info('📋 [PENDING-FILES] Filtros:', filters);

    const pendingFiles = pendingFileRepo.list(filters);

    // Obtener estadísticas por estado
    const stats = {
      total: pendingFileRepo.countByStatus(),
      pending: pendingFileRepo.countByStatus('pending'),
      reviewing: pendingFileRepo.countByStatus('reviewing'),
      processed: pendingFileRepo.countByStatus('processed'),
      failed: pendingFileRepo.countByStatus('failed'),
    };

    console.info(`✅ [PENDING-FILES] Encontrados: ${pendingFiles.length} archivos`);

    return json({
      success: true,
      data: pendingFiles,
      stats,
      filters,
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
