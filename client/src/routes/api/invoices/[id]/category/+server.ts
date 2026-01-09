import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { InvoiceRepository } from '@server/database/repositories/invoice';
import { CategoryRepository } from '@server/database/repositories/category';
import { EmitterRepository } from '@server/database/repositories/emitter';
import { generateProcessedFilename, generateSubdirectory } from '@server/utils/file-naming.js';
import { join, dirname } from 'path';
import { copyFile, mkdir } from 'fs/promises';
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
    console.log(`[CATEGORY] Nueva ruta destino: ${newPath}`);
    console.log(`[CATEGORY] Ruta en DB (processedFile): ${invoice.processedFile}`);
    console.log(`[CATEGORY] Ruta en DB (originalFile): ${invoice.originalFile}`);

    // Buscar archivo actual (puede estar en ruta diferente por cambios previos)
    let actualOldPath: string | null = null;

    // 1. Intentar con processedFile
    if (existsSync(invoice.processedFile)) {
      actualOldPath = invoice.processedFile;
      console.log(`[CATEGORY] ✅ Encontrado en processedFile: ${actualOldPath}`);
    }
    // 2. Intentar con originalFile (puede estar en input/)
    else if (existsSync(invoice.originalFile)) {
      actualOldPath = invoice.originalFile;
      console.log(`[CATEGORY] ✅ Encontrado en originalFile: ${actualOldPath}`);
    }
    // 3. Buscar en finalized por CUIT/número
    else if (invoice.invoiceType !== null) {
      console.log(`[CATEGORY] ⚠️ No encontrado en rutas DB, buscando por CUIT/número...`);
      actualOldPath = await findFileByInvoiceData(
        invoice.emitterCuit,
        invoice.invoiceType,
        invoice.pointOfSale,
        invoice.invoiceNumber
      );
      if (actualOldPath) {
        console.log(`[CATEGORY] ✅ Encontrado por búsqueda: ${actualOldPath}`);
      }
    }

    if (!actualOldPath) {
      console.error(`[CATEGORY] ❌ No se encontró el archivo físico para factura ${id}`);
    }

    // Mover/copiar archivo a finalized si existe y la ruta cambió
    if (actualOldPath && actualOldPath !== newPath) {
      try {
        // Crear directorio destino si no existe
        await mkdir(dirname(newPath), { recursive: true });

        // Si el archivo ya está en finalized/, MOVER (rename)
        // Si viene de uploaded/input, COPIAR (preserve original)
        const isInFinalized = actualOldPath.includes('/finalized/');

        if (isInFinalized) {
          const { rename } = await import('fs/promises');
          await rename(actualOldPath, newPath);
          console.log(`[CATEGORY] ✅ Archivo movido (rename): ${actualOldPath} -> ${newPath}`);
        } else {
          await copyFile(actualOldPath, newPath);
          console.log(
            `[CATEGORY] ✅ Archivo copiado (desde uploaded): ${actualOldPath} -> ${newPath}`
          );
        }
      } catch (err) {
        console.error(`[CATEGORY] ❌ Error copiando archivo: ${err}`);
        // Continuar de todas formas
      }
    } else if (actualOldPath === newPath) {
      console.log(`[CATEGORY] ℹ️ Archivo ya está en la ubicación correcta`);
    }

    // Actualizar en la base de datos
    const updated = await invoiceRepo.updateLinking(id, { categoryId: categoryId ?? null });
    if (!updated) return json({ ok: false, error: 'Invoice not found' }, { status: 404 });

    // Calcular ruta relativa: finalized/yyyy-mm/nombre.pdf
    const relativePath = join('finalized', subdir, newFileName);

    // Actualizar ruta del archivo procesado (absoluta y relativa)
    await invoiceRepo.updateProcessedFile(id, newPath, relativePath);

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
