/**
 * API endpoint para servir archivos de pending files
 */

import type { RequestHandler } from './$types';
import { PendingFileRepository } from '@server/database/repositories/pending-file.js';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { json } from '@sveltejs/kit';
import convert from 'heic-convert';

export const GET: RequestHandler = async ({ params }) => {
  let filename = 'desconocido';
  let filepath = 'desconocido';

  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      console.error(`❌ [FILE-SERVER] ID inválido: ${params.id}`);
      return json({ error: 'ID inválido', id: params.id }, { status: 400 });
    }

    const pendingFileRepo = new PendingFileRepository();
    const pendingFile = pendingFileRepo.findById(id);

    if (!pendingFile) {
      console.error(`❌ [FILE-SERVER] Archivo no encontrado en BD - ID: ${id}`);
      return json({ error: 'Archivo no encontrado en base de datos', id }, { status: 404 });
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

    // Detectar tipo MIME
    const ext = filename.split('.').pop()?.toLowerCase();
    let contentType = 'application/octet-stream';
    let fileBuffer = await readFile(filepath);
    let displayFilename = filename;

    // Convertir HEIC a JPEG para preview (navegadores no soportan HEIC)
    if (ext === 'heic' || ext === 'heif') {
      console.info(`   🔄 [FILE-SERVER] Convirtiendo HEIC a JPEG para preview...`);
      try {
        // heic-convert no tiene tipos TypeScript, usamos type assertion
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        const jpegBuffer = (await convert({
          buffer: fileBuffer,
          format: 'JPEG',
          quality: 0.9, // Buena calidad para preview
        })) as ArrayBuffer;

        fileBuffer = Buffer.from(jpegBuffer);
        contentType = 'image/jpeg';
        displayFilename = filename.replace(/\.(heic|heif)$/i, '.jpg');
        console.info(`   ✅ [FILE-SERVER] HEIC convertido a JPEG (${fileBuffer.length} bytes)`);
      } catch (conversionError) {
        console.error(
          `   ⚠️ [FILE-SERVER] Error convirtiendo HEIC, sirviendo original:`,
          conversionError
        );
        contentType = 'image/heic'; // Fallback al original
      }
    } else if (ext === 'pdf') {
      contentType = 'application/pdf';
    } else if (ext === 'jpg' || ext === 'jpeg') {
      contentType = 'image/jpeg';
    } else if (ext === 'png') {
      contentType = 'image/png';
    } else if (ext === 'tif' || ext === 'tiff') {
      contentType = 'image/tiff';
    } else if (ext === 'webp') {
      contentType = 'image/webp';
    }

    console.info(`✅ [FILE-SERVER] Sirviendo: ${displayFilename} (${fileBuffer.length} bytes)`);

    // Encodear filename para soportar caracteres UTF-8 (ñ, tildes, etc)
    // RFC 5987: filename*=UTF-8''encoded-filename
    const encodedFilename = encodeURIComponent(displayFilename);

    return new Response(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        // Usar ambos formatos para compatibilidad
        'Content-Disposition': `inline; filename="${displayFilename.replace(/[^\x00-\x7F]/g, '_')}"; filename*=UTF-8''${encodedFilename}`,
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
