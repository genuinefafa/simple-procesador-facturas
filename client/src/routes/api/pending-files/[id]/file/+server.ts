/**
 * API endpoint para servir archivos de pending files
 */

import type { RequestHandler } from './$types';
import { PendingFileRepository } from '@server/database/repositories/pending-file.js';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return new Response('ID inválido', { status: 400 });
    }

    const pendingFileRepo = new PendingFileRepository();
    const pendingFile = pendingFileRepo.findById(id);

    if (!pendingFile) {
      return new Response('Archivo no encontrado', { status: 404 });
    }

    if (!existsSync(pendingFile.filePath)) {
      return new Response('Archivo físico no encontrado', { status: 404 });
    }

    // Leer archivo
    const fileBuffer = await readFile(pendingFile.filePath);

    // Detectar tipo MIME
    const ext = pendingFile.originalFilename.split('.').pop()?.toLowerCase();
    let contentType = 'application/octet-stream';

    if (ext === 'pdf') {
      contentType = 'application/pdf';
    } else if (ext === 'jpg' || ext === 'jpeg') {
      contentType = 'image/jpeg';
    } else if (ext === 'png') {
      contentType = 'image/png';
    }

    return new Response(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${pendingFile.originalFilename}"`,
      },
    });
  } catch (error) {
    console.error('Error sirviendo archivo:', error);
    return new Response('Error interno del servidor', { status: 500 });
  }
};
