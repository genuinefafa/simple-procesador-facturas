import { json } from '@sveltejs/kit';
import { EmitterRepository } from '@server/database/repositories/emitter';
import { InvoiceRepository } from '@server/database/repositories/invoice';
import { ExpectedInvoiceRepository } from '@server/database/repositories/expected-invoice';
import { FileRepository } from '@server/database/repositories/file';
import { FileExtractionRepository } from '@server/database/repositories/file-extraction';
import type { RequestHandler } from './$types';

const emitterRepo = new EmitterRepository();

/**
 * Cuenta todos los comprobantes para un emisor específico
 * Usa la misma lógica que /api/comprobantes
 */
async function countComprobantesForEmitter(cuit: string): Promise<{
  total: number;
  facturas: number;
  expected: number;
  files: number;
}> {
  const invoiceRepo = new InvoiceRepository();
  const expectedRepo = new ExpectedInvoiceRepository();
  const fileRepo = new FileRepository();
  const extractionRepo = new FileExtractionRepository();

  const normalizedCuit = cuit.replace(/[-\s]/g, '');

  // 1) Contar facturas finales
  const invoices = await invoiceRepo.list();
  const facturas = invoices.filter(
    (inv) => inv.emitterCuit && inv.emitterCuit.replace(/[-\s]/g, '') === normalizedCuit
  ).length;

  // 2) Contar expected invoices (no matched)
  const expectedInvoices = await expectedRepo.listWithFiles({
    status: ['pending', 'discrepancy', 'manual', 'ignored'],
  });
  const expected = expectedInvoices.filter(
    (exp) => exp.cuit && exp.cuit.replace(/[-\s]/g, '') === normalizedCuit
  ).length;

  // 3) Contar archivos uploaded (sin factura asociada)
  const uploadedFiles = fileRepo.list({ status: 'uploaded' });
  let files = 0;
  for (const file of uploadedFiles) {
    const extraction = extractionRepo.findByFileId(file.id);
    if (extraction?.extractedCuit?.replace(/[-\s]/g, '') === normalizedCuit) {
      files++;
    }
  }

  return {
    total: facturas + expected + files,
    facturas,
    expected,
    files,
  };
}

/**
 * GET /api/emisores/[id] - Obtener un emisor por CUIT
 */
export const GET: RequestHandler = async ({ params }) => {
  const { id } = params;

  try {
    const emitter = emitterRepo.findById(id);

    if (!emitter) {
      return json({ error: 'Emisor no encontrado' }, { status: 404 });
    }

    // Obtener estadísticas usando la lógica correcta de comprobantes
    const counts = await countComprobantesForEmitter(id);
    const fullStats = emitterRepo.getFullStats(id);

    return json({
      emitter,
      stats: {
        totalInvoices: counts.total,
        totalFacturas: counts.facturas,
        totalExpected: counts.expected,
        totalFiles: counts.files,
        totalAmount: fullStats.totalAmount,
        firstInvoiceDate: fullStats.firstDate,
        lastInvoiceDate: fullStats.lastDate,
      },
    });
  } catch (e) {
    console.error('Error fetching emitter:', e);
    return json({ error: 'Error al obtener emisor', message: String(e) }, { status: 500 });
  }
};

/**
 * PATCH /api/emisores/[id] - Actualizar un emisor
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
  const { id } = params;

  try {
    const body = await request.json();
    const { name, legalName, aliases, personType, active } = body;

    // Validar que al menos hay algo que actualizar
    if (
      name === undefined &&
      legalName === undefined &&
      aliases === undefined &&
      personType === undefined &&
      active === undefined
    ) {
      return json({ error: 'No hay campos para actualizar' }, { status: 400 });
    }

    // Validar name si se envía
    if (name !== undefined && (!name || typeof name !== 'string' || name.trim() === '')) {
      return json({ error: 'El nombre no puede estar vacío' }, { status: 400 });
    }

    const updated = emitterRepo.update(id, {
      name: name?.trim(),
      legalName: legalName?.trim(),
      aliases: Array.isArray(aliases) ? aliases.filter((a: string) => a.trim()) : undefined,
      personType,
      active,
    });

    if (!updated) {
      return json({ error: 'Emisor no encontrado' }, { status: 404 });
    }

    return json({
      success: true,
      message: 'Emisor actualizado correctamente',
      emitter: updated,
    });
  } catch (e) {
    console.error('Error updating emitter:', e);
    return json({ error: 'Error al actualizar emisor', message: String(e) }, { status: 500 });
  }
};

/**
 * DELETE /api/emisores/[id] - Eliminar un emisor
 * PROTECCIÓN: No permite borrar si hay comprobantes vinculados (facturas, expected o archivos)
 */
export const DELETE: RequestHandler = async ({ params }) => {
  const { id } = params;

  try {
    const emitter = emitterRepo.findById(id);
    if (!emitter) {
      return json({ error: 'Emisor no encontrado' }, { status: 404 });
    }

    // Verificar TODOS los comprobantes vinculados (misma lógica que /api/comprobantes)
    const counts = await countComprobantesForEmitter(id);

    if (counts.total > 0) {
      const details: string[] = [];
      if (counts.facturas > 0) details.push(`${counts.facturas} factura(s)`);
      if (counts.expected > 0) details.push(`${counts.expected} expected`);
      if (counts.files > 0) details.push(`${counts.files} archivo(s)`);

      return json(
        {
          error: 'No se puede eliminar el emisor',
          reason: `Tiene comprobantes vinculados: ${details.join(', ')}`,
          counts,
        },
        { status: 409 }
      );
    }

    const deleted = emitterRepo.delete(id);

    if (!deleted) {
      return json({ error: 'Error al eliminar emisor' }, { status: 500 });
    }

    return json({
      success: true,
      message: 'Emisor eliminado correctamente',
    });
  } catch (e) {
    console.error('Error deleting emitter:', e);
    return json({ error: 'Error al eliminar emisor', message: String(e) }, { status: 500 });
  }
};
