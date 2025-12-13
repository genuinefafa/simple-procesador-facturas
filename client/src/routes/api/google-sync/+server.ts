/**
 * API endpoint para sincronización manual con Google Sheets + Drive
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  getGoogleSyncService,
  type SyncMode,
  type SheetType,
} from '@server/services/google/google-sync.service.js';

export const POST: RequestHandler = async ({ request }) => {
  console.info('☁️  [GOOGLE-SYNC] Iniciando sincronización con Google...');

  try {
    const body: unknown = await request.json();
    const { sheet, mode } = body as {
      sheet?: SheetType;
      mode?: SyncMode;
    };

    // Validar parámetros
    if (!sheet || !['emisores', 'facturas', 'esperadas', 'logs'].includes(sheet)) {
      return json(
        {
          success: false,
          error:
            'Parámetro "sheet" requerido. Valores válidos: emisores, facturas, esperadas, logs',
        },
        { status: 400 }
      );
    }

    if (!mode || !['sync', 'push', 'pull'].includes(mode)) {
      return json(
        {
          success: false,
          error: 'Parámetro "mode" requerido. Valores válidos: sync, push, pull',
        },
        { status: 400 }
      );
    }

    console.info(`☁️  [GOOGLE-SYNC] Sincronizando "${sheet}" en modo "${mode}"...`);

    // Obtener servicio de sincronización
    const syncService = getGoogleSyncService();

    // Inicializar si es necesario
    if (!syncService.isReady()) {
      console.info('☁️  [GOOGLE-SYNC] Inicializando servicio de Google...');
      await syncService.initialize();
    }

    // Ejecutar sincronización
    const result = await syncService.syncSheet(sheet, mode);

    if (result.success) {
      console.info(
        `✅ [GOOGLE-SYNC] Completado: ⬆️ ${result.stats.uploaded} subidos, ⬇️ ${result.stats.downloaded} descargados`
      );
    } else {
      console.error(`❌ [GOOGLE-SYNC] Error: ${result.error} (${result.stats.errors} errores)`);
    }

    return json({
      success: result.success,
      sheet: result.sheet,
      mode: result.mode,
      stats: result.stats,
      details: result.details,
      error: result.error,
    });
  } catch (error) {
    console.error('❌ [GOOGLE-SYNC] Error inesperado:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido al sincronizar',
      },
      { status: 500 }
    );
  }
};
