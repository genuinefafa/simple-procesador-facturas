/**
 * Hono router for /api/emisores/*.
 *
 * Mirror of client/src/routes/api/emisores/**\/+server.ts during the
 * SvelteKit → Hono migration. See docs/MIGRATION_BUN_HONO.md.
 */

import { Hono } from 'hono';

import { EmitterRepository } from '../../database/repositories/emitter';
import { InvoiceRepository } from '../../database/repositories/invoice';
import { ExpectedInvoiceRepository } from '../../database/repositories/expected-invoice';
import { FileRepository } from '../../database/repositories/file';
import { FileExtractionRepository } from '../../database/repositories/file-extraction';
import { CategoryRepository } from '../../database/repositories/category';
import { InvoiceFileService } from '../../services/invoice-file.service';
import { EmitterFilesRenameSchema, formatZodError } from '../../contracts';

const emitterRepo = new EmitterRepository();

async function countComprobantesByEmitter(): Promise<Map<string, number>> {
  const invoiceRepo = new InvoiceRepository();
  const expectedRepo = new ExpectedInvoiceRepository();
  const fileRepo = new FileRepository();
  const extractionRepo = new FileExtractionRepository();

  const counts = new Map<string, number>();

  const normalizeCuit = (cuit: string | null | undefined): string | null => {
    if (!cuit) return null;
    return cuit.replace(/[-\s]/g, '');
  };

  const invoices = await invoiceRepo.list();
  for (const inv of invoices) {
    const cuit = normalizeCuit(inv.emitterCuit);
    if (cuit) {
      counts.set(cuit, (counts.get(cuit) || 0) + 1);
    }
  }

  const expectedInvoices = await expectedRepo.listWithFiles({ status: ['pending'] });
  for (const exp of expectedInvoices) {
    const cuit = normalizeCuit(exp.cuit);
    if (cuit) {
      counts.set(cuit, (counts.get(cuit) || 0) + 1);
    }
  }

  const uploadedFiles = fileRepo.list({ status: 'uploaded' });
  for (const file of uploadedFiles) {
    const extraction = extractionRepo.findByFileId(file.id);
    const cuit = normalizeCuit(extraction?.extractedCuit);
    if (cuit) {
      counts.set(cuit, (counts.get(cuit) || 0) + 1);
    }
  }

  return counts;
}

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

  const invoices = await invoiceRepo.list();
  const facturas = invoices.filter(
    (inv) => inv.emitterCuit && inv.emitterCuit.replace(/[-\s]/g, '') === normalizedCuit
  ).length;

  const expectedInvoices = await expectedRepo.listWithFiles({ status: ['pending'] });
  const expected = expectedInvoices.filter(
    (exp) => exp.cuit && exp.cuit.replace(/[-\s]/g, '') === normalizedCuit
  ).length;

  const uploadedFiles = fileRepo.list({ status: 'uploaded' });
  let files = 0;
  for (const file of uploadedFiles) {
    const extraction = extractionRepo.findByFileId(file.id);
    if (extraction?.extractedCuit?.replace(/[-\s]/g, '') === normalizedCuit) {
      files++;
    }
  }

  return { total: facturas + expected + files, facturas, expected, files };
}

export const emisoresRouter = new Hono();

// GET /api/emisores — list/search
emisoresRouter.get('/', async (c) => {
  const q = c.req.query('q');
  const cuit = c.req.query('cuit');
  const name = c.req.query('name');
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const includeStats = c.req.query('stats') !== 'false';

  try {
    let emitters: ReturnType<typeof emitterRepo.list> = [];
    const allEmitters = emitterRepo.list();

    if (q) {
      const qClean = q.replace(/[^\d]/g, '');
      emitters = allEmitters.filter((e) => {
        const cuitNumeric = (e.cuit || '').replace(/[^\d]/g, '');
        const cuitMatches = qClean && cuitNumeric.includes(qClean);
        const nameMatches = (e.name || '').toLowerCase().includes(q.toLowerCase());
        return cuitMatches || nameMatches;
      });
    } else if (cuit) {
      const found = emitterRepo.findByCUIT(cuit);
      if (found) {
        emitters = [found];
      }
    } else if (name) {
      emitters = allEmitters.filter((e) =>
        (e.name || '').toLowerCase().includes(name.toLowerCase())
      );
    } else {
      emitters = allEmitters.slice(0, limit);
    }

    let comprobanteCounts: Map<string, number> | null = null;
    if (includeStats) {
      comprobanteCounts = await countComprobantesByEmitter();
    }

    const enrichedEmitters = emitters.slice(0, limit).map((e) => {
      const cuitNumeric = (e.cuit || '').replace(/[-\s]/g, '');
      return {
        ...e,
        totalInvoices: comprobanteCounts?.get(cuitNumeric) ?? e.totalInvoices ?? 0,
      };
    });

    return c.json({ count: enrichedEmitters.length, emitters: enrichedEmitters });
  } catch (e) {
    console.error('Error fetching emitters:', e);
    return c.json({ error: 'Failed to fetch emitters', message: String(e) }, 500);
  }
});

// POST /api/emisores — create
emisoresRouter.post('/', async (c) => {
  try {
    const body = await c.req.json<{
      cuit?: string;
      nombre?: string;
      razonSocial?: string;
      aliases?: string;
      tipoPersona?: 'FISICA' | 'JURIDICA';
    }>();
    const { cuit, nombre, razonSocial, aliases, tipoPersona } = body;

    if (!cuit || !nombre) {
      return c.json({ error: 'Missing required fields: cuit, nombre' }, 400);
    }

    const existing = emitterRepo.findByCUIT(cuit);
    if (existing) {
      return c.json({ error: 'Emitter with this CUIT already exists', emitter: existing }, 409);
    }

    const normalizedCuit = cuit.replace(/[-\s]/g, '');
    const newEmitter = emitterRepo.create({
      cuit: normalizedCuit,
      name: nombre,
      legalName: razonSocial || nombre,
      aliases: aliases
        ? aliases
            .split(',')
            .map((a) => a.trim())
            .filter(Boolean)
        : [],
      personType: tipoPersona || 'JURIDICA',
    });

    return c.json({ emitter: newEmitter }, 201);
  } catch (e) {
    console.error('Error creating emitter:', e);
    return c.json({ error: 'Failed to create emitter', message: String(e) }, 500);
  }
});

// GET /api/emisores/:id/archivos
emisoresRouter.get('/:id/archivos', async (c) => {
  const id = c.req.param('id');

  try {
    const emitter = emitterRepo.findById(id);
    if (!emitter) {
      return c.json({ error: 'Emisor no encontrado' }, 404);
    }

    const invoiceRepo = new InvoiceRepository();
    const fileRepo = new FileRepository();
    const categoryRepo = new CategoryRepository();
    const fileService = new InvoiceFileService();

    const invoices = await invoiceRepo.list({ emitterCuit: emitter.cuit });

    const result = await Promise.all(
      invoices.map(async (invoice) => {
        const file = invoice.fileId ? fileRepo.findById(invoice.fileId) : null;
        const currentStoragePath = file?.storagePath ?? null;

        let categoryKey: string | null = null;
        if (invoice.categoryId) {
          const category = await categoryRepo.findById(invoice.categoryId);
          categoryKey = category?.key ?? null;
        }

        let canonicalRelativePath: string | null = null;
        if (file) {
          const { relativePath } = fileService.generateCanonicalPath(
            {
              emitterCuit: invoice.emitterCuit,
              invoiceType: invoice.invoiceType,
              pointOfSale: invoice.pointOfSale,
              invoiceNumber: invoice.invoiceNumber,
              issueDate: invoice.issueDate.toISOString().split('T')[0]!,
              fileId: invoice.fileId ?? null,
            },
            emitter,
            file.originalFilename,
            categoryKey
          );
          canonicalRelativePath = relativePath;
        }

        const isInconsistent =
          currentStoragePath !== null &&
          canonicalRelativePath !== null &&
          currentStoragePath !== canonicalRelativePath;

        return {
          invoiceId: invoice.id,
          issueDate: invoice.issueDate.toISOString().split('T')[0]!,
          invoiceType: invoice.invoiceType,
          pointOfSale: invoice.pointOfSale,
          invoiceNumber: invoice.invoiceNumber,
          categoryId: invoice.categoryId ?? null,
          currentStoragePath,
          canonicalRelativePath,
          isInconsistent,
        };
      })
    );

    return c.json({ archivos: result });
  } catch (e) {
    console.error('Error fetching archivos for emitter:', e);
    return c.json({ error: 'Error al obtener archivos del emisor', message: String(e) }, 500);
  }
});

// POST /api/emisores/:id/archivos/rename
emisoresRouter.post('/:id/archivos/rename', async (c) => {
  const id = c.req.param('id');

  try {
    const emitter = emitterRepo.findById(id);
    if (!emitter) {
      return c.json({ error: 'Emisor no encontrado' }, 404);
    }

    const body: unknown = await c.req.json();
    const parseResult = EmitterFilesRenameSchema.safeParse(body);
    if (!parseResult.success) {
      return c.json(formatZodError(parseResult.error), 400);
    }

    const { invoiceIds } = parseResult.data;

    const invoiceRepo = new InvoiceRepository();
    const fileRepo = new FileRepository();
    const fileService = new InvoiceFileService();

    const renamed: { invoiceId: number; from: string; to: string }[] = [];
    const failed: { invoiceId: number; reason: string }[] = [];
    const skipped: { invoiceId: number; reason: string }[] = [];

    for (const invoiceId of invoiceIds) {
      const invoice = await invoiceRepo.findById(invoiceId);

      if (!invoice) {
        skipped.push({ invoiceId, reason: 'Factura no encontrada' });
        continue;
      }

      const normalizedEmitterCuit = emitter.cuit.replace(/[-\s]/g, '');
      const normalizedInvoiceCuit = invoice.emitterCuit.replace(/[-\s]/g, '');
      if (normalizedInvoiceCuit !== normalizedEmitterCuit) {
        skipped.push({ invoiceId, reason: 'La factura no pertenece a este emisor' });
        continue;
      }

      if (!invoice.fileId) {
        skipped.push({ invoiceId, reason: 'La factura no tiene archivo asociado' });
        continue;
      }

      const file = fileRepo.findById(invoice.fileId);
      if (!file) {
        skipped.push({ invoiceId, reason: 'Archivo no encontrado en base de datos' });
        continue;
      }

      const fromPath = file.storagePath;

      try {
        const result = await fileService.renameWithCategoryResolution(
          invoice.fileId,
          {
            emitterCuit: invoice.emitterCuit,
            invoiceType: invoice.invoiceType,
            pointOfSale: invoice.pointOfSale,
            invoiceNumber: invoice.invoiceNumber,
            issueDate: invoice.issueDate.toISOString().split('T')[0]!,
            fileId: invoice.fileId,
          },
          emitter,
          invoice.categoryId ?? null
        );

        if (!result.success) {
          failed.push({ invoiceId, reason: result.error ?? 'Error desconocido' });
          continue;
        }

        if (result.relativePath === fromPath) {
          skipped.push({ invoiceId, reason: 'El archivo ya estaba en la ruta canónica' });
          continue;
        }

        renamed.push({
          invoiceId,
          from: fromPath,
          to: result.relativePath ?? '',
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        failed.push({ invoiceId, reason });
      }
    }

    return c.json({ renamed, failed, skipped });
  } catch (e) {
    console.error('Error in batch rename for emitter:', e);
    return c.json({ error: 'Error al renombrar archivos', message: String(e) }, 500);
  }
});

// GET /api/emisores/:id — detail
emisoresRouter.get('/:id', async (c) => {
  const id = c.req.param('id');

  try {
    const emitter = emitterRepo.findById(id);

    if (!emitter) {
      return c.json({ error: 'Emisor no encontrado' }, 404);
    }

    const counts = await countComprobantesForEmitter(id);
    const fullStats = emitterRepo.getFullStats(id);

    return c.json({
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
    return c.json({ error: 'Error al obtener emisor', message: String(e) }, 500);
  }
});

// PATCH /api/emisores/:id — update
emisoresRouter.patch('/:id', async (c) => {
  const id = c.req.param('id');

  try {
    const body = await c.req.json<{
      name?: string;
      legalName?: string;
      aliases?: string[];
      personType?: 'FISICA' | 'JURIDICA';
      active?: boolean;
    }>();
    const { name, legalName, aliases, personType, active } = body;

    if (
      name === undefined &&
      legalName === undefined &&
      aliases === undefined &&
      personType === undefined &&
      active === undefined
    ) {
      return c.json({ error: 'No hay campos para actualizar' }, 400);
    }

    if (name !== undefined && (!name || typeof name !== 'string' || name.trim() === '')) {
      return c.json({ error: 'El nombre no puede estar vacío' }, 400);
    }

    const updated = emitterRepo.update(id, {
      name: name?.trim(),
      legalName: legalName?.trim(),
      aliases: Array.isArray(aliases) ? aliases.filter((a) => a.trim()) : undefined,
      personType,
      active,
    });

    if (!updated) {
      return c.json({ error: 'Emisor no encontrado' }, 404);
    }

    return c.json({
      success: true,
      message: 'Emisor actualizado correctamente',
      emitter: updated,
    });
  } catch (e) {
    console.error('Error updating emitter:', e);
    return c.json({ error: 'Error al actualizar emisor', message: String(e) }, 500);
  }
});

// DELETE /api/emisores/:id
emisoresRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');

  try {
    const emitter = emitterRepo.findById(id);
    if (!emitter) {
      return c.json({ error: 'Emisor no encontrado' }, 404);
    }

    const counts = await countComprobantesForEmitter(id);

    if (counts.total > 0) {
      const details: string[] = [];
      if (counts.facturas > 0) details.push(`${counts.facturas} factura(s)`);
      if (counts.expected > 0) details.push(`${counts.expected} expected`);
      if (counts.files > 0) details.push(`${counts.files} archivo(s)`);

      return c.json(
        {
          error: 'No se puede eliminar el emisor',
          reason: `Tiene comprobantes vinculados: ${details.join(', ')}`,
          counts,
        },
        409
      );
    }

    const deleted = emitterRepo.delete(id);

    if (!deleted) {
      return c.json({ error: 'Error al eliminar emisor' }, 500);
    }

    return c.json({
      success: true,
      message: 'Emisor eliminado correctamente',
    });
  } catch (e) {
    console.error('Error deleting emitter:', e);
    return c.json({ error: 'Error al eliminar emisor', message: String(e) }, 500);
  }
});
