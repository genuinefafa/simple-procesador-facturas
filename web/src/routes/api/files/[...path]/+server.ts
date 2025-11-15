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
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);

    // Check if file exists
    if (!fs.existsSync(absolutePath)) {
      throw error(404, 'File not found');
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
