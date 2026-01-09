/**
 * API endpoint para servir archivos de facturas
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';
import heicConvert from 'heic-convert';

export const GET: RequestHandler = async ({ params }) => {
  const filename = path.basename(decodeURIComponent(params.path));

  try {
    // Decode the path parameter (it may be URL-encoded)
    const filePath = decodeURIComponent(params.path);

    console.info(`📂 [FILE-SERVER] Solicitado: ${filename}`);
    console.info(`   Path original: ${filePath}`);

    // Security: Ensure the path doesn't contain directory traversal attempts
    if (filePath.includes('..') || filePath.includes('~')) {
      console.error(`❌ [FILE-SERVER] Path inválido (directory traversal): ${filePath}`);
      throw error(400, 'Invalid file path');
    }

    // Resolve the absolute path
    // IMPORTANTE: process.cwd() es /web/ cuando ejecutamos desde npm run web:dev,
    // pero las rutas en la DB pueden ser:
    // 1. Absolutas: /ruta/completa/archivo.pdf
    // 2. Relativas al proyecto: examples/factura4.pdf
    // 3. Solo nombre: factura.pdf (buscar en directorios comunes)

    const projectRoot = path.resolve(process.cwd(), '..');
    let absolutePath: string;

    if (path.isAbsolute(filePath)) {
      // Ruta absoluta
      absolutePath = filePath;
      console.info(`   Usando ruta absoluta: ${absolutePath}`);
    } else {
      // Intentar primero como ruta relativa al proyecto
      absolutePath = path.resolve(projectRoot, filePath);
      console.info(`   Intentando ruta relativa: ${absolutePath}`);

      // Si no existe, buscar en directorios comunes
      if (!fs.existsSync(absolutePath)) {
        const searchDirs = [
          path.join(projectRoot, 'examples'),
          path.join(projectRoot, 'data/processed'),
          path.join(projectRoot, 'data/input'),
        ];

        console.info(`   No encontrado, buscando en directorios comunes...`);

        // Buscar primero en finalized con subdirectorios (yyyy-mm)
        const finalizedDir = path.join(projectRoot, 'data/finalized');
        if (fs.existsSync(finalizedDir)) {
          try {
            const subdirs = fs.readdirSync(finalizedDir).filter((item) => {
              const itemPath = path.join(finalizedDir, item);
              return fs.statSync(itemPath).isDirectory();
            });

            for (const subdir of subdirs) {
              const candidatePath = path.join(finalizedDir, subdir, path.basename(filePath));
              console.info(`     Probando: ${candidatePath}`);
              if (fs.existsSync(candidatePath)) {
                absolutePath = candidatePath;
                console.info(`     ✅ Encontrado en finalized/${subdir}!`);
                break;
              }
            }
          } catch (err) {
            console.warn(`     Error buscando en finalized:`, err);
          }
        }

        // Si no se encontró en finalized, buscar en otros directorios
        if (!fs.existsSync(absolutePath)) {
          for (const dir of searchDirs) {
            const candidatePath = path.join(dir, path.basename(filePath));
            console.info(`     Probando: ${candidatePath}`);
            if (fs.existsSync(candidatePath)) {
              absolutePath = candidatePath;
              console.info(`     ✅ Encontrado!`);
              break;
            }
          }
        }
      }
    }

    // Check if file exists
    if (!fs.existsSync(absolutePath)) {
      console.error(`❌ [FILE-SERVER] Archivo no encontrado: ${filename}`);
      console.error(`   Path original: ${filePath}`);
      console.error(`   Path buscado: ${absolutePath}`);
      console.error(`   Directorios revisados: examples/, data/input/, data/processed/`);
      throw error(404, `File not found: ${filename}`);
    }

    // Read file
    let fileBuffer = fs.readFileSync(absolutePath);
    const ext = path.extname(absolutePath).toLowerCase();

    console.info(`✅ [FILE-SERVER] Sirviendo: ${filename} (${fileBuffer.length} bytes)`);

    // Convert HEIC/HEIF to JPEG for browser compatibility
    if (ext === '.heic' || ext === '.heif') {
      console.info(`   🔄 Convirtiendo HEIC a JPEG...`);
      try {
        const outputBuffer = await heicConvert({
          buffer: fileBuffer,
          format: 'JPEG',
          quality: 0.9,
        });
        fileBuffer = Buffer.from(outputBuffer);
        console.info(`   ✅ Conversión exitosa (${fileBuffer.length} bytes)`);
      } catch (convertErr) {
        console.error(`   ❌ Error convirtiendo HEIC:`, convertErr);
        throw error(500, 'Error converting HEIC file');
      }
    }

    // Determine content type
    let contentType = 'application/octet-stream';
    if (ext === '.pdf') {
      contentType = 'application/pdf';
    } else if (['.jpg', '.jpeg'].includes(ext)) {
      contentType = 'image/jpeg';
    } else if (ext === '.png') {
      contentType = 'image/png';
    } else if (ext === '.tif' || ext === '.tiff') {
      contentType = 'image/tiff';
    } else if (ext === '.webp') {
      contentType = 'image/webp';
    } else if (ext === '.heic' || ext === '.heif') {
      // After conversion, serve as JPEG
      contentType = 'image/jpeg';
    }

    // Encodear filename para soportar caracteres UTF-8 (ñ, tildes, etc)
    const encodedFilename = encodeURIComponent(filename);

    return new Response(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        // Usar ambos formatos para compatibilidad con navegadores
        'Content-Disposition': `inline; filename="${filename.replace(/[^\x00-\x7F]/g, '_')}"; filename*=UTF-8''${encodedFilename}`,
      },
    });
  } catch (err) {
    if (err instanceof Error && 'status' in err) {
      throw err;
    }
    console.error(`❌ [FILE-SERVER] Error sirviendo archivo: ${filename}`);
    console.error(`   Error:`, err);
    throw error(500, 'Internal server error');
  }
};
