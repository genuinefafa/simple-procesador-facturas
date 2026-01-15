import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { InvoiceRepository } from '@server/database/repositories/invoice';
import { CategoryRepository } from '@server/database/repositories/category';
import { EmitterRepository } from '@server/database/repositories/emitter';
import { FileRepository } from '@server/database/repositories/file';
import { generateProcessedFilename, generateSubdirectory } from '@server/utils/file-naming.js';
import { join, dirname } from 'path';
import { mkdir, rename } from 'fs/promises';
import { existsSync, readdirSync, statSync } from 'fs';

const PROJECT_ROOT = join(process.cwd(), '..');
const DATA_DIR = join(PROJECT_ROOT, 'data');
const FINALIZED_DIR = join(DATA_DIR, 'finalized');

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
  const fileRepo = new FileRepository();

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

    // Obtener archivo asociado para la extensión
    let originalFilename = 'invoice.pdf';
    if (invoice.fileId) {
      const file = fileRepo.findById(invoice.fileId);
      if (file) {
        originalFilename = file.originalFilename;
      }
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
      originalFilename, // Para obtener extensión
      categoryKey
    );

    // Rutas de archivos
    const newPath = join(FINALIZED_DIR, subdir, newFileName);
    const relativePath = `finalized/${subdir}/${newFileName}`;

    // Buscar archivo actual via fileId -> files.storage_path
    let actualOldPath: string | null = null;
    if (invoice.fileId) {
      const file = fileRepo.findById(invoice.fileId);
      if (file) {
        const absoluteStoragePath = join(DATA_DIR, file.storagePath);
        if (existsSync(absoluteStoragePath)) {
          actualOldPath = absoluteStoragePath;
          console.log(`[CATEGORY] ✅ Encontrado via fileId: ${actualOldPath}`);
        }
      }
    }

    // Fallback: buscar en finalized por CUIT/número
    if (!actualOldPath && invoice.invoiceType !== null) {
      console.log(`[CATEGORY] ⚠️ No encontrado via fileId, buscando por CUIT/número...`);
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
      // Continuar de todas formas para actualizar la categoría en DB
    }

    // Mover archivo si existe y la ruta cambió
    if (actualOldPath && actualOldPath !== newPath) {
      try {
        // Crear directorio destino si no existe
        await mkdir(dirname(newPath), { recursive: true });

        // Renombrar archivo
        await rename(actualOldPath, newPath);
        console.log(`[CATEGORY] ✅ Archivo movido: ${actualOldPath} -> ${newPath}`);
      } catch (err) {
        console.error(`[CATEGORY] ❌ Error moviendo archivo: ${err}`);
        // Continuar de todas formas
      }
    } else if (actualOldPath === newPath) {
      console.log(`[CATEGORY] ℹ️ Archivo ya está en la ubicación correcta`);
    }

    // Actualizar categoría en la base de datos
    const updated = await invoiceRepo.updateLinking(id, { categoryId: categoryId ?? null });
    if (!updated) return json({ ok: false, error: 'Invoice not found' }, { status: 404 });

    // Actualizar storagePath en files
    if (invoice.fileId) {
      fileRepo.updatePath(invoice.fileId, relativePath);
      console.log(`[CATEGORY] ✅ storagePath actualizado: ${relativePath}`);
    }

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
