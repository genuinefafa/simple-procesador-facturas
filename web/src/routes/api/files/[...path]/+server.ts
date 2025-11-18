/**
 * API endpoint para servir archivos de facturas
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';

export const GET: RequestHandler = async ({ params }) => {
  try {
    // Decode the path parameter (it may be URL-encoded)
    const filePath = decodeURIComponent(params.path);

    // Security: Ensure the path doesn't contain directory traversal attempts
    if (filePath.includes('..') || filePath.includes('~')) {
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
    } else {
      // Intentar primero como ruta relativa al proyecto
      absolutePath = path.resolve(projectRoot, filePath);

      // Si no existe, buscar en directorios comunes
      if (!fs.existsSync(absolutePath)) {
        const searchDirs = [
          path.join(projectRoot, 'examples'),
          path.join(projectRoot, 'data/input'),
          path.join(projectRoot, 'data/processed'),
        ];

        for (const dir of searchDirs) {
          const candidatePath = path.join(dir, path.basename(filePath));
          if (fs.existsSync(candidatePath)) {
            absolutePath = candidatePath;
            break;
          }
        }
      }
    }

    // Check if file exists
    if (!fs.existsSync(absolutePath)) {
      console.error(`File not found: ${absolutePath}`);
      console.error(`  Original path: ${filePath}`);
      console.error(`  Searched in: examples/, data/input/, data/processed/`);
      throw error(404, `File not found: ${path.basename(filePath)}`);
    }

    // Read file
    const fileBuffer = fs.readFileSync(absolutePath);
    const ext = path.extname(absolutePath).toLowerCase();

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
    }

    return new Response(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (err) {
    if (err instanceof Error && 'status' in err) {
      throw err;
    }
    console.error('Error serving file:', err);
    throw error(500, 'Internal server error');
  }
};
