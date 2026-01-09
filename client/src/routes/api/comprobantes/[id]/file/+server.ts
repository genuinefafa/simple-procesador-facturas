/**
 * Endpoint inteligente para servir archivos de comprobantes
 * Basado en el ID del comprobante (factura:N o pending:N), busca y sirve el archivo correcto
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { InvoiceRepository } from '@server/database/repositories/invoice';
import { PendingFileRepository } from '@server/database/repositories/pending-file';
import { existsSync, createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { join } from 'path';

const PROJECT_ROOT = join(process.cwd(), '..');
const DATA_DIR = join(PROJECT_ROOT, 'data');

/**
 * Busca el archivo en el filesystem siguiendo el orden de prioridad:
 * 1. Si tiene finalizedFile (ruta relativa) → usar esa
 * 2. Si existe processedFile (ruta absoluta legacy) → usar esa
 * 3. Si existe originalFile (uploaded/) → usar esa
 * 4. Buscar en finalized/ por nombre de archivo
 */
async function findInvoiceFile(invoice: any): Promise<string | null> {
  console.log(`[FILE-SERVER] Buscando archivo para factura ${invoice.id}...`);

  // 1. Prioridad: finalizedFile (ruta relativa a data/)
  if (invoice.finalizedFile) {
    const relativePath = join(DATA_DIR, invoice.finalizedFile);
    console.log(`   📍 Intentando finalizedFile: ${relativePath}`);
    if (existsSync(relativePath)) {
      console.log(`   ✅ Encontrado en finalizedFile (ruta relativa)`);
      return relativePath;
    }
  }

  // 2. Fallback: processedFile (ruta absoluta legacy)
  if (invoice.processedFile && existsSync(invoice.processedFile)) {
    console.log(`   ⚠️ Usando processedFile legacy: ${invoice.processedFile}`);
    return invoice.processedFile;
  }

  // 3. Fallback: originalFile (en uploaded/input)
  if (invoice.originalFile && existsSync(invoice.originalFile)) {
    console.log(`   ⚠️ Usando originalFile (uploaded): ${invoice.originalFile}`);
    return invoice.originalFile;
  }

  // 4. Último recurso: buscar en finalized/ por nombre
  console.log(`   🔍 Buscando en finalized/ por nombre...`);
  const finalizedDir = join(DATA_DIR, 'finalized');
  if (existsSync(finalizedDir)) {
    try {
      const { readdirSync, statSync } = await import('fs');
      const subdirs = readdirSync(finalizedDir).filter((item) => {
        const itemPath = join(finalizedDir, item);
        return statSync(itemPath).isDirectory();
      });

      const processedBasename = invoice.processedFile
        ? join(invoice.processedFile).split('/').pop()
        : null;
      const originalBasename = invoice.originalFile
        ? join(invoice.originalFile).split('/').pop()
        : null;

      for (const subdir of subdirs) {
        const subdirPath = join(finalizedDir, subdir);
        const files = readdirSync(subdirPath);

        // Buscar por basename de processedFile o originalFile
        for (const basename of [processedBasename, originalBasename]) {
          if (basename && files.includes(basename)) {
            const candidatePath = join(subdirPath, basename);
            console.log(`   ✅ Encontrado en finalized/${subdir}/: ${basename}`);
            return candidatePath;
          }
        }
      }
    } catch (err) {
      console.error(`   ❌ Error buscando en finalized:`, err);
    }
  }

  console.error(`   ❌ No se encontró el archivo físico para factura ${invoice.id}`);
  return null;
}

async function findPendingFile(pendingFile: any): Promise<string | null> {
  console.log(`[FILE-SERVER] Buscando archivo para pending ${pendingFile.id}...`);

  // Para pending files, usar directamente filePath
  if (pendingFile.filePath && existsSync(pendingFile.filePath)) {
    console.log(`   ✅ Encontrado en filePath: ${pendingFile.filePath}`);
    return pendingFile.filePath;
  }

  console.error(`   ❌ No se encontró el archivo físico para pending ${pendingFile.id}`);
  return null;
}

export const GET: RequestHandler = async ({ params }) => {
  const comprobanteId = params.id; // Formato: "factura:56" o "pending:62"

  console.log(`📂 [FILE-SERVER] Solicitado comprobante: ${comprobanteId}`);

  try {
    // Parsear el ID del comprobante
    const [type, idStr] = comprobanteId.split(':');
    const id = parseInt(idStr, 10);

    if (!type || isNaN(id)) {
      throw error(400, 'ID de comprobante inválido');
    }

    let filePath: string | null = null;
    let filename: string | null = null;

    if (type === 'factura') {
      // Buscar factura
      const invoiceRepo = new InvoiceRepository();
      const invoice = await invoiceRepo.findById(id);

      if (!invoice) {
        throw error(404, 'Factura no encontrada');
      }

      filePath = await findInvoiceFile(invoice);
      filename = filePath ? filePath.split('/').pop() || 'factura.pdf' : null;
    } else if (type === 'pending') {
      // Buscar pending file
      const pendingRepo = new PendingFileRepository();
      const pendingFile = await pendingRepo.findById(id);

      if (!pendingFile) {
        throw error(404, 'Archivo pendiente no encontrado');
      }

      filePath = await findPendingFile(pendingFile);
      filename = pendingFile.originalFilename || 'pending.pdf';
    } else {
      throw error(400, `Tipo de comprobante desconocido: ${type}`);
    }

    if (!filePath) {
      throw error(404, 'Archivo físico no encontrado');
    }

    // Obtener info del archivo
    const fileStats = await stat(filePath);

    console.log(`✅ [FILE-SERVER] Sirviendo: ${filename} (${fileStats.size} bytes)`);

    // Crear stream y servir archivo
    const stream = createReadStream(filePath);

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
