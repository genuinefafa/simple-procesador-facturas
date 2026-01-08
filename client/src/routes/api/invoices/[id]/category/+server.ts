import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { InvoiceRepository } from '@server/database/repositories/invoice';
import { CategoryRepository } from '@server/database/repositories/category';
import { EmitterRepository } from '@server/database/repositories/emitter';
import { generateProcessedFilename, generateSubdirectory } from '@server/utils/file-naming.js';
import { join } from 'path';
import { rename, access } from 'fs/promises';

const FINALIZED_DIR = join(process.cwd(), '..', 'data', 'finalized');

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
    const oldPath = invoice.processedFile; // Ruta absoluta actual
    const newPath = join(FINALIZED_DIR, subdir, newFileName);

    // Renombrar archivo físico si existe y la ruta cambió
    if (oldPath && oldPath !== newPath) {
      try {
        await access(oldPath);
        await rename(oldPath, newPath);
        console.log(`[CATEGORY] Archivo renombrado: ${oldPath} -> ${newPath}`);
      } catch (err) {
        console.warn(`[CATEGORY] No se pudo renombrar archivo: ${err}`);
        // Continuar de todas formas - el archivo puede no existir todavía
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
