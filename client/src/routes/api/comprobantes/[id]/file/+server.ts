/**
 * Endpoint simplificado para servir archivos de comprobantes
 * Usa el nuevo modelo files (sin fallbacks complejos)
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { InvoiceRepository } from '@server/database/repositories/invoice';
import { FileRepository } from '@server/database/repositories/file';
import { existsSync, readFileSync } from 'fs';
import { join, extname } from 'path';
import heicConvert from 'heic-convert';

const PROJECT_ROOT = join(process.cwd(), '..');
const DATA_DIR = join(PROJECT_ROOT, 'data');

/**
 * Resuelve la ruta absoluta de un archivo desde su storagePath relativo
 */
function resolveAbsolutePath(storagePath: string): string {
  // Si ya es absoluta, retornar tal cual
  if (storagePath.startsWith('/')) {
    return storagePath;
  }
  // Si es relativa, resolver contra DATA_DIR
  return join(DATA_DIR, storagePath);
}

export const GET: RequestHandler = async ({ params }) => {
  const comprobanteId = params.id; // Formato: "factura:56" o "pending:62" (legacy) o "file:62"

  console.log(`📂 [FILE-SERVER] Solicitado comprobante: ${comprobanteId}`);

  try {
    // Parsear el ID del comprobante
    const [type, idStr] = comprobanteId.split(':');
    const id = parseInt(idStr, 10);

    if (!type || isNaN(id)) {
      throw error(400, 'ID de comprobante inválido');
    }

    const fileRepo = new FileRepository();
    let file: any = null;
    let filename: string;

    if (type === 'factura') {
      // Buscar factura → obtener file asociado
      const invoiceRepo = new InvoiceRepository();
      const invoice = await invoiceRepo.findById(id);

      if (!invoice) {
        throw error(404, 'Factura no encontrada');
      }

      if (!invoice.fileId) {
        throw error(404, 'Factura sin archivo asociado (fileId es null)');
      }
      file = fileRepo.findById(invoice.fileId);
      if (!file) {
        throw error(404, 'Archivo no encontrado en BD');
      }
      // Usar nombre del storagePath (normalizado) si existe, sino originalFilename
      filename = file.storagePath.split('/').pop() || file.originalFilename;
      console.log(`📄 [FILE-SERVER] Factura ${id} → File ${file.id}: ${filename}`);
    } else if (type === 'pending' || type === 'file') {
      // "pending:N" es legacy, ahora es "file:N" pero mantenemos compatibilidad
      file = fileRepo.findById(id);

      if (!file) {
        throw error(404, 'Archivo no encontrado');
      }

      filename = file.storagePath.split('/').pop() || file.originalFilename;
      console.log(`📄 [FILE-SERVER] File ${id}: ${filename}`);
    } else {
      throw error(400, `Tipo de comprobante desconocido: ${type}`);
    }

    // Resolver ruta absoluta desde storagePath (ruta relativa)
    const absolutePath = resolveAbsolutePath(file.storagePath);

    if (!existsSync(absolutePath)) {
      console.error(`❌ [FILE-SERVER] Archivo no existe: ${absolutePath}`);
      throw error(404, 'Archivo físico no encontrado en disco');
    }

    // Read file into buffer
    let fileBuffer = readFileSync(absolutePath);
    const ext = extname(absolutePath).toLowerCase();

    console.log(`✅ [FILE-SERVER] Sirviendo: ${file.storagePath} (${fileBuffer.length} bytes)`);

    // Convert HEIC/HEIF to JPEG for browser compatibility
    if (ext === '.heic' || ext === '.heif') {
      console.log(`   🔄 Converting HEIC to JPEG...`);
      try {
        const outputBuffer = await heicConvert({
          buffer: fileBuffer,
          format: 'JPEG',
          quality: 0.9,
        });
        fileBuffer = Buffer.from(outputBuffer);
        console.log(`   ✅ HEIC conversion done (${fileBuffer.length} bytes)`);
      } catch (convertErr) {
        console.error(`   ❌ Error converting HEIC:`, convertErr);
        throw error(500, 'Error converting HEIC file');
      }
    }

    // Determine Content-Type based on file extension
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
      contentType = 'image/jpeg'; // Served as JPEG after conversion
    }

    // Encodear filename para HTTP headers (RFC 5987 para UTF-8)
    const safeFilename = filename.replace(/[^\x20-\x7E]/g, '_'); // ASCII-safe fallback
    const encodedFilename = encodeURIComponent(filename);

    return new Response(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileBuffer.length.toString(),
        'Content-Disposition': `inline; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    if (err instanceof Error && 'status' in err) {
      throw err;
    }
    console.error(`❌ [FILE-SERVER] Error sirviendo comprobante ${comprobanteId}:`, err);
    throw error(500, 'Error interno del servidor');
  }
};
