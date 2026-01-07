/**
 * API endpoint para subir archivos de facturas
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { PendingFileRepository } from '@server/database/repositories/pending-file.js';
import { calculateFileHash } from '@server/utils/file-hash.js';

const UPLOAD_DIR = join(process.cwd(), '..', 'data', 'input');

export const POST: RequestHandler = async ({ request }) => {
  console.info('📤 [UPLOAD] Iniciando subida de archivos...');
  console.info('📤 [UPLOAD] Directorio destino:', UPLOAD_DIR);

  try {
    // Crear directorio si no existe
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
      console.info('📁 [UPLOAD] Directorio creado');
    }

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    console.info(`📤 [UPLOAD] Archivos recibidos: ${files.length}`);

    if (!files || files.length === 0) {
      console.warn('⚠️  [UPLOAD] No se recibieron archivos');
      return json({ success: false, error: 'No se recibieron archivos' }, { status: 400 });
    }

    const uploadedFiles = [];
    const errors = [];
    const pendingFileRepo = new PendingFileRepository();

    for (const file of files) {
      console.info(`📄 [UPLOAD] Procesando: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`);

      try {
        // Validar extensión
        const ext = file.name.split('.').pop()?.toLowerCase();
        const SUPPORTED_EXTENSIONS = [
          'pdf',
          'jpg',
          'jpeg',
          'png',
          'tif',
          'tiff',
          'webp',
          'heic',
          'heif',
        ];
        if (!ext || !SUPPORTED_EXTENSIONS.includes(ext)) {
          throw new Error(`Tipo no soportado. Formatos aceptados: PDF, JPG, PNG, TIF, WEBP, HEIC`);
        }

        // Validar tamaño (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
          throw new Error(`Archivo muy grande. Máximo 10MB`);
        }

        // Guardar archivo
        const buffer = Buffer.from(await file.arrayBuffer());
        const filePath = join(UPLOAD_DIR, file.name);

        // Verificar si ya existe
        if (existsSync(filePath)) {
          throw new Error(`El archivo ya existe`);
        }

        await writeFile(filePath, buffer);
        console.info(`✅ [UPLOAD] Guardado: ${filePath}`);

        // Calcular hash SHA-256
        let fileHash: string | undefined;
        let hashPreview: string | undefined;
        try {
          const hashResult = await calculateFileHash(filePath);
          fileHash = hashResult.hash;
          hashPreview = fileHash.substring(0, 16);
          console.info(`🔐 [UPLOAD] Hash: ${hashPreview}...`);
        } catch (error) {
          console.warn(`⚠️  [UPLOAD] Error calculando hash:`, error);
        }

        // Crear registro en pending_files
        const pendingFile = await pendingFileRepo.create({
          originalFilename: file.name,
          filePath: filePath,
          fileSize: file.size,
          fileHash,
          status: 'pending',
        });

        console.info(`📝 [UPLOAD] Registro creado en BD: ID ${pendingFile.id}`);

        uploadedFiles.push({
          pendingFileId: pendingFile.id,
          name: file.name,
          size: file.size,
          path: filePath,
          hash: fileHash,
          hashPreview,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        console.warn(`⚠️  [UPLOAD] Error con ${file.name}: ${errorMessage}`);
        errors.push({
          name: file.name,
          error: errorMessage,
        });
      }
    }

    const successCount = uploadedFiles.length;
    const errorCount = errors.length;
    const totalCount = successCount + errorCount;

    console.info(`✅ [UPLOAD] Completado: ${successCount}/${totalCount} archivo(s) subido(s)`);

    if (errorCount > 0) {
      console.warn(`⚠️  [UPLOAD] Errores: ${errorCount} archivo(s) fallaron`);
    }

    // Retornar éxito si al menos 1 archivo se subió
    const hasSuccess = successCount > 0;

    return json({
      success: hasSuccess,
      message: hasSuccess
        ? `${successCount} de ${totalCount} archivo(s) subido(s) correctamente`
        : `No se pudo subir ningún archivo`,
      files: uploadedFiles,
      errors,
      summary: {
        total: totalCount,
        success: successCount,
        failed: errorCount,
      },
    });
  } catch (error) {
    console.error('❌ [UPLOAD] Error:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
};
