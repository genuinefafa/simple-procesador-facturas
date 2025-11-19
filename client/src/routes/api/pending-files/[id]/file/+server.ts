/**
 * API endpoint para servir archivos de pending files
 */

import type { RequestHandler } from './$types';
import { PendingFileRepository } from '@server/database/repositories/pending-file.js';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { json } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params }) => {
  let filename = 'desconocido';
  let filepath = 'desconocido';

  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      console.error(`❌ [FILE-SERVER] ID inválido: ${params.id}`);
      return json(
        { error: 'ID inválido', id: params.id },
        { status: 400 }
      );
    }

    const pendingFileRepo = new PendingFileRepository();
    const pendingFile = pendingFileRepo.findById(id);

    if (!pendingFile) {
      console.error(`❌ [FILE-SERVER] Archivo no encontrado en BD - ID: ${id}`);
      return json(
        { error: 'Archivo no encontrado en base de datos', id },
        { status: 404 }
      );
    }

    filename = pendingFile.originalFilename;
    filepath = pendingFile.filePath;

    console.info(`📂 [FILE-SERVER] Solicitado: ${filename} (ID: ${id})`);
    console.info(`   Ruta: ${filepath}`);

    if (!existsSync(filepath)) {
      console.error(`❌ [FILE-SERVER] Archivo físico no existe: ${filename}`);
      console.error(`   Ruta buscada: ${filepath}`);
      return json(
        {
          error: 'Archivo físico no encontrado en el servidor',
          filename,
          filepath,
          id,
        },
        { status: 404 }
      );
    }

    // Leer archivo
    const fileBuffer = await readFile(filepath);
    console.info(`✅ [FILE-SERVER] Sirviendo: ${filename} (${fileBuffer.length} bytes)`);

    // Detectar tipo MIME
    const ext = filename.split('.').pop()?.toLowerCase();
    let contentType = 'application/octet-stream';

    if (ext === 'pdf') {
      contentType = 'application/pdf';
    } else if (ext === 'jpg' || ext === 'jpeg') {
      contentType = 'image/jpeg';
    } else if (ext === 'png') {
      contentType = 'image/png';
    }

    // Encodear filename para soportar caracteres UTF-8 (ñ, tildes, etc)
    // RFC 5987: filename*=UTF-8''encoded-filename
    const encodedFilename = encodeURIComponent(filename);

    return new Response(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        // Usar ambos formatos para compatibilidad
        'Content-Disposition': `inline; filename="${filename.replace(/[^\x00-\x7F]/g, '_')}"; filename*=UTF-8''${encodedFilename}`,
      },
    });
  } catch (error) {
    console.error(`❌ [FILE-SERVER] Error sirviendo archivo: ${filename}`);
    console.error(`   Ruta: ${filepath}`);
    console.error(`   Error:`, error);
    return json(
      {
        error: 'Error interno del servidor',
        filename,
        filepath,
        details: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
};
