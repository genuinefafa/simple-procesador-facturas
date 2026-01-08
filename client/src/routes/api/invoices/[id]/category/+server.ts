import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { InvoiceRepository } from '@server/database/repositories/invoice';
import { CategoryRepository } from '@server/database/repositories/category';
import { EmitterRepository } from '@server/database/repositories/emitter';
import { generateProcessedFilename, generateSubdirectory } from '@server/utils/file-naming.js';
import { join, dirname } from 'path';
import { rename, access, mkdir } from 'fs/promises';
import { existsSync, readdirSync, statSync } from 'fs';

const FINALIZED_DIR = join(process.cwd(), '..', 'data', 'finalized');

/**
 * Busca un archivo en el filesystem basándose en CUIT y número de factura
 * Útil cuando la fecha o categoría cambió y el nombre ya no coincide
 */
async function findFileByInvoiceData(
  cuit: string,
  tipo: number,
  pv: number,
  num: number
): Promise<string | null> {
  try {
    const cuitNumeric = cuit.replace(/\D/g, '');
    const pvFormatted = String(pv).padStart(5, '0');
    const numFormatted = String(num).padStart(8, '0');

    // Buscar archivos que contengan estos identificadores
    const subdirs = readdirSync(FINALIZED_DIR).filter((item) => {
      const itemPath = join(FINALIZED_DIR, item);
      return statSync(itemPath).isDirectory();
    });

    for (const subdir of subdirs) {
      const subdirPath = join(FINALIZED_DIR, subdir);
      const files = readdirSync(subdirPath);

      for (const file of files) {
        // Buscar archivo que contenga CUIT y número de factura
        if (file.includes(cuitNumeric) && file.includes(`${pvFormatted}-${numFormatted}`)) {
          const candidatePath = join(subdirPath, file);
          console.log(`[FIND-FILE] Encontrado por CUIT/número en ${subdir}: ${file}`);
          return candidatePath;
        }
      }
    }
  } catch (err) {
    console.error('[FIND-FILE] Error:', err);
  }

  return null;
}

export const POST: RequestHandler = async ({ params, request }) => {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return json({ ok: false, error: 'Invalid invoice id' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const { categoryId } = body as { categoryId?: number | null };
  if (categoryId === undefined) {
    return json({ ok: false, error: 'categoryId is required' }, { status: 400 });
  }

  const categoryRepo = new CategoryRepository();
  let categoryKey: string | null = null;
  if (categoryId !== null) {
    const cat = await categoryRepo.findById(categoryId);
    if (!cat) return json({ ok: false, error: 'Category not found' }, { status: 404 });
    categoryKey = cat.key;
  }

  const invoiceRepo = new InvoiceRepository();
  try {
    // Obtener factura actual
    const invoice = await invoiceRepo.findById(id);
    if (!invoice) return json({ ok: false, error: 'Invoice not found' }, { status: 404 });

    // Obtener información del emisor
    const emitterRepo = new EmitterRepository();
    const emitter = await emitterRepo.findByCUIT(invoice.emitterCuit);
    if (!emitter) {
      return json({ ok: false, error: 'Emitter not found' }, { status: 404 });
    }

    // Generar nuevo nombre de archivo
    const issueDate = new Date(invoice.issueDate);
    const subdir = generateSubdirectory(issueDate);
    const newFileName = generateProcessedFilename(
      issueDate,
      emitter,
      invoice.invoiceType,
      invoice.pointOfSale,
      invoice.invoiceNumber,
      invoice.originalFile,
      categoryKey
    );

    // Rutas de archivos
    const newPath = join(FINALIZED_DIR, subdir, newFileName);

    // Buscar archivo actual (puede estar en ruta diferente por cambios previos)
    let actualOldPath: string | null = null;
    if (existsSync(invoice.processedFile)) {
      actualOldPath = invoice.processedFile;
    } else if (invoice.invoiceType !== null) {
      actualOldPath = await findFileByInvoiceData(
        invoice.emitterCuit,
        invoice.invoiceType,
        invoice.pointOfSale,
        invoice.invoiceNumber
      );
    }

    // Mover/renombrar archivo físico si existe y la ruta cambió
    if (actualOldPath && actualOldPath !== newPath) {
      try {
        // Crear directorio destino si no existe
        await mkdir(dirname(newPath), { recursive: true });
        // Mover archivo al nuevo path
        await rename(actualOldPath, newPath);
        console.log(`[CATEGORY] Archivo movido: ${actualOldPath} -> ${newPath}`);
      } catch (err) {
        console.warn(`[CATEGORY] No se pudo mover archivo: ${err}`);
        // Continuar de todas formas
      }
    }

    // Actualizar en la base de datos
    const updated = await invoiceRepo.updateLinking(id, { categoryId: categoryId ?? null });
    if (!updated) return json({ ok: false, error: 'Invoice not found' }, { status: 404 });

    // Actualizar ruta del archivo procesado
    await invoiceRepo.updateProcessedFile(id, newPath);

    return json({
      ok: true,
      invoiceId: updated.id,
      categoryId: updated.categoryId ?? null,
      newFilePath: newPath,
    });
  } catch (e) {
    console.error('Error updating invoice category', e);
    return json({ ok: false, error: 'Failed to update category' }, { status: 500 });
  }
};
