/**
 * Endpoint para importar facturas esperadas desde Excel/CSV de AFIP
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createExcelImportService } from '@server/factories';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

const UPLOAD_DIR = path.join(process.cwd(), 'data', 'excel-imports');

export const POST: RequestHandler = async ({ request }) => {
  console.info('\n📥 [API] POST /api/expected-invoices/import');

  try {
    // Crear directorio si no existe
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
      console.info(`   📁 Directorio creado: ${UPLOAD_DIR}`);
    }

    // Obtener el archivo del form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      console.warn('   ❌ No se proporcionó archivo');
      return json(
        {
          success: false,
          error: 'No se proporcionó archivo',
        },
        { status: 400 }
      );
    }

    console.info(`   📄 Archivo recibido: ${file.name} (${file.size} bytes)`);

    // Validar extensión
    const ext = path.extname(file.name).toLowerCase();
    if (!['.xlsx', '.xls', '.csv'].includes(ext)) {
      console.warn(`   ❌ Formato no soportado: ${ext}`);
      return json(
        {
          success: false,
          error: `Formato de archivo no soportado: ${ext}. Use .xlsx, .xls o .csv`,
        },
        { status: 400 }
      );
    }

    // Guardar archivo temporalmente
    const timestamp = Date.now();
    const safeFilename = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = path.join(UPLOAD_DIR, safeFilename);

    const arrayBuffer = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(arrayBuffer));

    console.info(`   💾 Archivo guardado: ${filePath}`);

    // Importar con el servicio
    const importService = await createExcelImportService();
    const result = await importService.importFromFile(filePath);

    console.info(`   ✅ Importación completada:`);
    console.info(`      Lote ID: ${result.batchId}`);
    console.info(`      Importadas: ${result.imported}`);
    console.info(`      Actualizadas: ${result.updated}`);
    console.info(`      Sin cambios: ${result.unchanged}`);
    if (result.emittersCreated > 0 || result.emittersExisting > 0) {
      console.info(`      Emisores creados: ${result.emittersCreated}`);
      console.info(`      Emisores existentes: ${result.emittersExisting}`);
    }
    console.info(`      Errores: ${result.errors.length}`);

    return json({
      success: true,
      batchId: result.batchId,
      filename: result.filename,
      totalRows: result.totalRows,
      imported: result.imported,
      updated: result.updated,
      unchanged: result.unchanged,
      emittersCreated: result.emittersCreated,
      emittersExisting: result.emittersExisting,
      errors: result.errors,
    });
  } catch (error) {
    console.error('   ❌ Error en importación:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido al importar',
      },
      { status: 500 }
    );
  }
};
