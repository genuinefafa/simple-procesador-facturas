/**
 * Hono router for /api/comprobantes/*.
 *
 * Mirror of client/src/routes/api/comprobantes/**\/+server.ts during the
 * SvelteKit → Hono migration. See docs/MIGRATION_BUN_HONO.md.
 */

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { existsSync, readFileSync } from 'fs';
import { join, extname } from 'path';

import { InvoiceRepository } from '../../database/repositories/invoice';
import { FileRepository } from '../../database/repositories/file';
import { createComprobanteService } from '../../factories';
import type { File as FileRecord } from '../../database/schema';

// @ts-expect-error - no type definitions available for heic-convert
import heicConvertUntyped from 'heic-convert';
const heicConvert = heicConvertUntyped as (opts: {
  buffer: Buffer;
  format: 'JPEG' | 'PNG';
  quality?: number;
}) => Promise<ArrayBuffer>;

const PROJECT_ROOT = join(import.meta.dirname, '..', '..', '..');
const DATA_DIR = join(PROJECT_ROOT, 'data');

function resolveAbsolutePath(storagePath: string): string {
  if (storagePath.startsWith('/')) {
    return storagePath;
  }
  return join(DATA_DIR, storagePath);
}

export const comprobantesRouter = new Hono();

comprobantesRouter.get('/', async (c) => {
  const service = createComprobanteService();
  const { comprobantes } = await service.listAll();
  return c.json({ count: comprobantes.length, comprobantes });
});

// GET /api/comprobantes/:id/file
// :id format: "factura:N" | "pending:N" | "file:N"
comprobantesRouter.get('/:id/file', async (c) => {
  const comprobanteId = c.req.param('id');

  console.log(`📂 [FILE-SERVER] Solicitado comprobante: ${comprobanteId}`);

  try {
    const [type, idStr] = comprobanteId.split(':');
    const id = parseInt(idStr ?? '', 10);

    if (!type || isNaN(id)) {
      throw new HTTPException(400, { message: 'ID de comprobante inválido' });
    }

    const fileRepo = new FileRepository();
    let file: FileRecord | null = null;
    let filename: string;

    if (type === 'factura') {
      const invoiceRepo = new InvoiceRepository();
      const invoice = await invoiceRepo.findById(id);

      if (!invoice) {
        throw new HTTPException(404, { message: 'Factura no encontrada' });
      }

      if (!invoice.fileId) {
        throw new HTTPException(404, {
          message: 'Factura sin archivo asociado (fileId es null)',
        });
      }
      file = fileRepo.findById(invoice.fileId);
      if (!file) {
        throw new HTTPException(404, { message: 'Archivo no encontrado en BD' });
      }
      filename = file.storagePath.split('/').pop() || file.originalFilename;
      console.log(`📄 [FILE-SERVER] Factura ${id} → File ${file.id}: ${filename}`);
    } else if (type === 'pending' || type === 'file') {
      file = fileRepo.findById(id);

      if (!file) {
        throw new HTTPException(404, { message: 'Archivo no encontrado' });
      }

      filename = file.storagePath.split('/').pop() || file.originalFilename;
      console.log(`📄 [FILE-SERVER] File ${id}: ${filename}`);
    } else {
      throw new HTTPException(400, {
        message: `Tipo de comprobante desconocido: ${type}`,
      });
    }

    const absolutePath = resolveAbsolutePath(file.storagePath);

    if (!existsSync(absolutePath)) {
      console.error(`❌ [FILE-SERVER] Archivo no existe: ${absolutePath}`);
      throw new HTTPException(404, { message: 'Archivo físico no encontrado en disco' });
    }

    let fileBuffer: Buffer<ArrayBufferLike> = readFileSync(absolutePath);
    const ext = extname(absolutePath).toLowerCase();

    console.log(`✅ [FILE-SERVER] Sirviendo: ${file.storagePath} (${fileBuffer.length} bytes)`);

    if (ext === '.heic' || ext === '.heif') {
      console.log(`   🔄 Converting HEIC to JPEG...`);
      try {
        const outputBuffer = await heicConvert({
          buffer: fileBuffer,
          format: 'JPEG',
          quality: 0.9,
        });
        fileBuffer = Buffer.from(outputBuffer) as Buffer;
        console.log(`   ✅ HEIC conversion done (${fileBuffer.length} bytes)`);
      } catch (convertErr) {
        console.error(`   ❌ Error converting HEIC:`, convertErr);
        throw new HTTPException(500, { message: 'Error converting HEIC file' });
      }
    }

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
      contentType = 'image/jpeg';
    }

    const safeFilename = filename.replace(/[^\x20-\x7E]/g, '_');
    const encodedFilename = encodeURIComponent(filename);

    return new Response(new Uint8Array(fileBuffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileBuffer.length.toString(),
        'Content-Disposition': `inline; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    if (err instanceof HTTPException) {
      throw err;
    }
    console.error(`❌ [FILE-SERVER] Error sirviendo comprobante ${comprobanteId}:`, err);
    throw new HTTPException(500, { message: 'Error interno del servidor' });
  }
});
