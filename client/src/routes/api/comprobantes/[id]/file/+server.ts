/**
 * Endpoint simplificado para servir archivos de comprobantes
 * Usa el nuevo modelo files (sin fallbacks complejos)
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { InvoiceRepository } from '@server/database/repositories/invoice';
import { FileRepository } from '@server/database/repositories/file';
import { existsSync, createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { join } from 'path';

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

      if (invoice.fileId) {
        // Caso normal: factura tiene fileId
        file = fileRepo.findById(invoice.fileId);
        if (!file) {
          throw error(404, 'Archivo no encontrado en BD');
        }
        filename = file.originalFilename;
        console.log(`📄 [FILE-SERVER] Factura ${id} → File ${file.id}: ${filename}`);
      } else if (invoice.fileHash) {
        // Fallback: buscar file por hash (para facturas sin fileId migrando)
        console.log(`⚠️  [FILE-SERVER] Factura ${id} sin fileId, buscando por hash...`);
        file = fileRepo.findByHash(invoice.fileHash);
        if (file) {
          filename = file.originalFilename;
          console.log(`📄 [FILE-SERVER] Factura ${id} → File ${file.id} (via hash): ${filename}`);
        } else {
          // Último fallback: usar campos legacy de la factura
          console.log(`⚠️  [FILE-SERVER] No se encontró file por hash, usando campos legacy`);
          const legacyPath = invoice.finalizedFile || invoice.processedFile || invoice.originalFile;
          if (!legacyPath) {
            throw error(404, 'Factura sin archivo asociado');
          }
          // Construir objeto file-like para mantener compatibilidad
          file = {
            storagePath: legacyPath,
            originalFilename: legacyPath.split('/').pop() || 'factura.pdf',
          };
          filename = file.originalFilename;
          console.log(`📄 [FILE-SERVER] Factura ${id} usando legacy path: ${legacyPath}`);
        }
      } else {
        throw error(404, 'Factura sin archivo asociado (ni fileId ni fileHash)');
      }
    } else if (type === 'pending' || type === 'file') {
      // "pending:N" es legacy, ahora es "file:N" pero mantenemos compatibilidad
      file = fileRepo.findById(id);

      if (!file) {
        throw error(404, 'Archivo no encontrado');
      }

      filename = file.originalFilename;
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

    // Obtener info del archivo
    const fileStats = await stat(absolutePath);

    console.log(`✅ [FILE-SERVER] Sirviendo: ${filename} (${fileStats.size} bytes)`);

    // Crear stream y servir archivo
    const stream = createReadStream(absolutePath);

    return new Response(stream as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': fileStats.size.toString(),
        'Content-Disposition': `inline; filename="${filename}"`,
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
