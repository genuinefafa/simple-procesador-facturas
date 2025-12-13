/**
 * Endpoint para listar y gestionar facturas esperadas (desde Excel AFIP)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  ExpectedInvoiceRepository,
  type ExpectedInvoiceStatus,
} from '@server/database/repositories/expected-invoice.js';
import { ExcelImportService } from '@server/services/excel-import.service.js';

export const GET: RequestHandler = async ({ url }) => {
  console.info('\n📋 [API] GET /api/expected-invoices');

  try {
    const repo = new ExpectedInvoiceRepository();

    // Parsear query params
    const status = url.searchParams.get('status');
    const batchId = url.searchParams.get('batchId');
    const cuit = url.searchParams.get('cuit');
    const limit = url.searchParams.get('limit');
    const offset = url.searchParams.get('offset');

    console.info(`   🔍 Filtros:`);
    console.info(`      Status: ${status || 'todos'}`);
    console.info(`      Batch ID: ${batchId || 'todos'}`);
    console.info(`      CUIT: ${cuit || 'todos'}`);
    console.info(`      Limit: ${limit || 'sin límite'}`);
    console.info(`      Offset: ${offset || '0'}`);

    // Construir filtros
    const filters: any = {};

    if (status) {
      // Soportar múltiples estados separados por coma
      const statuses = status.split(',') as ExpectedInvoiceStatus[];
      filters.status = statuses.length === 1 ? statuses[0] : statuses;
    }

    if (batchId) {
      filters.batchId = parseInt(batchId);
    }

    if (cuit) {
      filters.cuit = cuit;
    }

    if (limit) {
      filters.limit = parseInt(limit);
    }

    if (offset) {
      filters.offset = parseInt(offset);
    }

    // Obtener facturas esperadas
    const invoices = await repo.list(filters);

    // Obtener estadísticas
    const stats = await repo.countByStatus(filters.batchId);

    const total = Object.values(stats).reduce((sum: number, count: number) => sum + count, 0);

    console.info(`   ✅ Facturas encontradas: ${invoices.length}`);
    console.info(`   📊 Estadísticas:`);
    console.info(`      Total: ${total}`);
    console.info(`      Pending: ${stats.pending}`);
    console.info(`      Matched: ${stats.matched}`);
    console.info(`      Manual: ${stats.manual}`);
    console.info(`      Ignored: ${stats.ignored}`);

    return json({
      success: true,
      invoices,
      total,
      stats,
    });
  } catch (error) {
    console.error('   ❌ Error al listar facturas esperadas:', error);
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
 * Endpoint para obtener información de lotes de importación
 */
export const POST: RequestHandler = async ({ request }) => {
  console.info('\n📊 [API] POST /api/expected-invoices (action)');

  try {
    const { action, batchId } = await request.json();

    if (action === 'getBatchStats' && batchId) {
      const service = new ExcelImportService();
      const stats = service.getBatchStats(batchId);

      return json({
        success: true,
        ...stats,
      });
    }

    if (action === 'listBatches') {
      const service = new ExcelImportService();
      const batches = service.listBatches();

      return json({
        success: true,
        batches,
      });
    }

    return json(
      {
        success: false,
        error: 'Acción no soportada',
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('   ❌ Error en acción:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
};
