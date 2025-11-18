/**
 * API endpoint para subir archivos de facturas
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const UPLOAD_DIR = join(process.cwd(), '..', 'data', 'input');

export const POST: RequestHandler = async ({ request }) => {
  try {
    // Crear directorio si no existe
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return json({ success: false, error: 'No se recibieron archivos' }, { status: 400 });
    }

    const uploadedFiles = [];

    for (const file of files) {
      // Validar extensión
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!ext || !['pdf', 'jpg', 'jpeg', 'png'].includes(ext)) {
        return json(
          {
            success: false,
            error: `Tipo de archivo no soportado: ${file.name}. Solo se aceptan PDF, JPG y PNG`,
          },
          { status: 400 }
        );
      }

      // Validar tamaño (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
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
        return json(
          {
            success: false,
            error: `El archivo ya existe: ${file.name}`,
          },
          { status: 409 }
        );
      }

      await writeFile(filePath, buffer);

      uploadedFiles.push({
        name: file.name,
        size: file.size,
        path: filePath,
      });
    }

    return json({
      success: true,
      message: `${uploadedFiles.length} archivo(s) subido(s) correctamente`,
      files: uploadedFiles,
    });
  } catch (error) {
    console.error('Error uploading files:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
};
