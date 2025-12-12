/**
 * API endpoint para subir archivos de facturas
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { PendingFileRepository } from '@server/database/repositories/pending-file.js';

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

    for (const file of files) {
      console.info(`📄 [UPLOAD] Procesando: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`);

      // Validar extensión
      // Soportamos: PDF, imágenes comunes (JPG, PNG), y formatos adicionales para OCR (TIF, WEBP, HEIC)
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
        console.warn(`⚠️  [UPLOAD] Tipo no soportado: ${file.name}`);
        return json(
          {
            success: false,
            error: `Tipo de archivo no soportado: ${file.name}. Formatos aceptados: PDF, JPG, PNG, TIF, WEBP, HEIC`,
          },
          { status: 400 }
        );
      }

      // Validar tamaño (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        console.warn(`⚠️  [UPLOAD] Archivo muy grande: ${file.name}`);
        return json(
          {
            success: false,
            error: `Archivo muy grande: ${file.name}. Máximo 10MB`,
          },
          { status: 400 }
        );
      }

      // Guardar archivo
      const buffer = Buffer.from(await file.arrayBuffer());
      const filePath = join(UPLOAD_DIR, file.name);

      // Verificar si ya existe
      if (existsSync(filePath)) {
        console.warn(`⚠️  [UPLOAD] Archivo ya existe: ${file.name}`);
        return json(
          {
            success: false,
            error: `El archivo ya existe: ${file.name}`,
          },
          { status: 409 }
        );
      }

      await writeFile(filePath, buffer);
      console.info(`✅ [UPLOAD] Guardado: ${filePath}`);

      // Crear registro en pending_files
      const pendingFileRepo = new PendingFileRepository();
      const pendingFile = await pendingFileRepo.create({
        originalFilename: file.name,
        filePath: filePath,
        fileSize: file.size,
        status: 'pending',
      });

      console.info(`📝 [UPLOAD] Registro creado en BD: ID ${pendingFile.id}`);

      uploadedFiles.push({
        pendingFileId: pendingFile.id,
        name: file.name,
        size: file.size,
        path: filePath,
      });
    }

    console.info(`✅ [UPLOAD] Completado: ${uploadedFiles.length} archivo(s)`);

    return json({
      success: true,
      message: `${uploadedFiles.length} archivo(s) subido(s) correctamente`,
      files: uploadedFiles,
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
