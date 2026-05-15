/**
 * Hono router for /api/expected-invoices/*.
 *
 * Mirror of client/src/routes/api/expected-invoices/**\/+server.ts during
 * the SvelteKit → Hono migration. See docs/MIGRATION_BUN_HONO.md.
 */

import { Hono } from 'hono';
import path from 'path';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

import {
  ExpectedInvoiceRepository,
  type ExpectedInvoiceStatus,
} from '../../database/repositories/expected-invoice';
import { InvoiceRepository } from '../../database/repositories/invoice';
import { EmitterRepository } from '../../database/repositories/emitter';
import { FileRepository } from '../../database/repositories/file';
import { getExpectedInvoiceRepository, createExcelImportService } from '../../factories';
import { createComprobanteService } from '../../factories';
import {
  BalanceGroupAddSchema,
  BalanceGroupSetPrincipalSchema,
  ExpectedInvoicePatchSchema,
  formatZodError,
  type BalanceGroupMember,
  type BalanceGroupResponse,
} from '../../contracts';
import { getPersonType } from '@shared/validators/cuit';
import type { InvoiceType } from '@shared/types';

const balanceRepo = new ExpectedInvoiceRepository();

async function buildBalanceGroupResponse(
  principalId: number
): Promise<BalanceGroupResponse | null> {
  const group = await balanceRepo.getBalanceGroup(principalId);
  if (group.length === 0) return null;

  const principal = group.find((inv) => inv.balancedWithId === null);
  if (!principal) return null;

  const balance = await balanceRepo.calculateGroupBalance(principal.id);

  const members: BalanceGroupMember[] = group.map((inv) => ({
    id: inv.id,
    cuit: inv.cuit,
    emitterName: inv.emitterName,
    invoiceType: inv.invoiceType,
    pointOfSale: inv.pointOfSale,
    invoiceNumber: inv.invoiceNumber,
    total: inv.total,
    issueDate: inv.issueDate,
    isPrincipal: inv.balancedWithId === null,
  }));

  return {
    principalId: principal.id,
    members,
    total: balance.total,
    isBalanced: balance.isBalanced,
  };
}

const UPLOAD_DIR = path.join(process.cwd(), 'data', 'excel-imports');

export const expectedInvoicesRouter = new Hono();

// GET /api/expected-invoices — list
expectedInvoicesRouter.get('/', async (c) => {
  console.info('\n📋 [API] GET /api/expected-invoices');

  try {
    const repo = getExpectedInvoiceRepository();

    const status = c.req.query('status');
    const batchId = c.req.query('batchId');
    const cuit = c.req.query('cuit');
    const limit = c.req.query('limit');
    const offset = c.req.query('offset');

    console.info(`   🔍 Filtros:`);
    console.info(`      Status: ${status || 'todos'}`);
    console.info(`      Batch ID: ${batchId || 'todos'}`);
    console.info(`      CUIT: ${cuit || 'todos'}`);
    console.info(`      Limit: ${limit || 'sin límite'}`);
    console.info(`      Offset: ${offset || '0'}`);

    const filters: Parameters<typeof repo.list>[0] = {};

    if (status) {
      const statuses = status.split(',') as ExpectedInvoiceStatus[];
      filters.status = statuses.length === 1 ? statuses[0] : statuses;
    }

    if (batchId) {
      filters.batchId = parseInt(batchId, 10);
    }

    if (cuit) {
      filters.cuit = cuit;
    }

    if (limit) {
      filters.limit = parseInt(limit, 10);
    }

    if (offset) {
      filters.offset = parseInt(offset, 10);
    }

    const invoices = await repo.list(filters);
    const stats = await repo.countByStatus(filters.batchId);

    const total = Object.values(stats).reduce((sum: number, count: number) => sum + count, 0);

    console.info(`   ✅ Facturas encontradas: ${invoices.length}`);
    console.info(`   📊 Estadísticas:`);
    console.info(`      Total: ${total}`);
    console.info(`      Pending: ${stats.pending}`);
    console.info(`      Matched: ${stats.matched}`);

    return c.json({
      success: true,
      invoices,
      total,
      stats,
    });
  } catch (error) {
    console.error('   ❌ Error al listar facturas esperadas:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      500
    );
  }
});

// POST /api/expected-invoices — actions (getBatchStats, listBatches)
expectedInvoicesRouter.post('/', async (c) => {
  console.info('\n📊 [API] POST /api/expected-invoices (action)');

  try {
    const body = await c.req.json<{ action?: string; batchId?: number }>();
    const { action, batchId } = body;

    if (action === 'getBatchStats' && batchId) {
      const service = await createExcelImportService();
      const stats = await service.getBatchStats(batchId);
      return c.json({ success: true, ...stats });
    }

    if (action === 'listBatches') {
      const service = await createExcelImportService();
      const batches = await service.listBatches();
      return c.json({ success: true, batches });
    }

    return c.json({ success: false, error: 'Acción no soportada' }, 400);
  } catch (error) {
    console.error('   ❌ Error en acción:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      500
    );
  }
});

// POST /api/expected-invoices/import — Excel/CSV upload
expectedInvoicesRouter.post('/import', async (c) => {
  console.info('\n📥 [API] POST /api/expected-invoices/import');

  try {
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
      console.info(`   📁 Directorio creado: ${UPLOAD_DIR}`);
    }

    const formData = await c.req.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      console.warn('   ❌ No se proporcionó archivo');
      return c.json({ success: false, error: 'No se proporcionó archivo' }, 400);
    }

    console.info(`   📄 Archivo recibido: ${file.name} (${file.size} bytes)`);

    const ext = path.extname(file.name).toLowerCase();
    if (!['.xlsx', '.xls', '.csv'].includes(ext)) {
      console.warn(`   ❌ Formato no soportado: ${ext}`);
      return c.json(
        {
          success: false,
          error: `Formato de archivo no soportado: ${ext}. Use .xlsx, .xls o .csv`,
        },
        400
      );
    }

    const timestamp = Date.now();
    const safeFilename = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = path.join(UPLOAD_DIR, safeFilename);

    const arrayBuffer = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(arrayBuffer));

    console.info(`   💾 Archivo guardado: ${filePath}`);

    const importService = await createExcelImportService();
    const result = await importService.importFromFile(filePath);

    console.info(`   ✅ Importación completada:`);
    console.info(`      Lote ID: ${result.batchId}`);
    console.info(`      Importadas: ${result.imported}`);
    console.info(`      Actualizadas: ${result.updated}`);
    console.info(`      Sin cambios: ${result.unchanged}`);
    if (result.emittersCreated > 0 || result.emittersExisting > 0) {
      console.info(`      Emisores creados: ${result.emittersCreated}`);
      console.info(`      Emisores existentes: ${result.emittersExisting}`);
    }
    console.info(`      Errores: ${result.errors.length}`);

    return c.json({
      success: true,
      batchId: result.batchId,
      filename: result.filename,
      totalRows: result.totalRows,
      imported: result.imported,
      updated: result.updated,
      unchanged: result.unchanged,
      emittersCreated: result.emittersCreated,
      emittersExisting: result.emittersExisting,
      errors: result.errors,
    });
  } catch (error) {
    console.error('   ❌ Error en importación:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido al importar',
      },
      500
    );
  }
});

// GET /api/expected-invoices/search
expectedInvoicesRouter.get('/search', async (c) => {
  console.info('🔍 [EXPECTED] Buscando candidatos con scoring...');

  try {
    const cuit = c.req.query('cuit') || undefined;
    const invoiceType = c.req.query('type');
    const pointOfSale = c.req.query('pointOfSale');
    const invoiceNumber = c.req.query('invoiceNumber');
    const issueDate = c.req.query('date') || undefined;
    const total = c.req.query('total');
    const limit = c.req.query('limit');

    const repo = new ExpectedInvoiceRepository();
    const candidates = await repo.findPartialMatches({
      cuit,
      invoiceType: invoiceType ? parseInt(invoiceType, 10) : undefined,
      pointOfSale: pointOfSale ? parseInt(pointOfSale, 10) : undefined,
      invoiceNumber: invoiceNumber ? parseInt(invoiceNumber, 10) : undefined,
      issueDate,
      total: total ? parseFloat(total) : undefined,
      limit: limit ? parseInt(limit, 10) : 10,
    });

    console.info(`✅ [EXPECTED] Encontrados ${candidates.length} candidatos`);

    return c.json({
      success: true,
      candidates: candidates.map((cand) => ({
        id: cand.id,
        cuit: cand.cuit,
        emitterName: cand.emitterName,
        issueDate: cand.issueDate,
        invoiceType: cand.invoiceType,
        pointOfSale: cand.pointOfSale,
        invoiceNumber: cand.invoiceNumber,
        total: cand.total,
        categoryId: cand.categoryId,
        matchScore: cand.matchScore,
        matchedFields: cand.matchedFields,
      })),
    });
  } catch (error) {
    console.error('❌ [EXPECTED] Error en búsqueda:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      500
    );
  }
});

// GET /api/expected-invoices/template
expectedInvoicesRouter.get('/template', async (c) => {
  console.info('\n📥 [API] GET /api/expected-invoices/template');

  try {
    const { TemplateGeneratorService } = await import('../../services/template-generator.service');
    const format = c.req.query('format') || 'xlsx';
    const service = new TemplateGeneratorService();

    if (format === 'csv') {
      console.info('   📄 Generando template CSV...');
      const csv = service.generateCSVTemplate();

      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="template-facturas-afip.csv"',
        },
      });
    } else {
      console.info('   📊 Generando template Excel...');
      const buffer = await service.generateExcelTemplate();

      return new Response(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="template-facturas-afip.xlsx"',
        },
      });
    }
  } catch (error) {
    console.error('   ❌ Error generando template:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      500
    );
  }
});

// GET /api/expected-invoices/:id/balance
expectedInvoicesRouter.get('/:id/balance', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    return c.json({ error: 'ID inválido' }, 400);
  }

  try {
    const invoice = await balanceRepo.findById(id);
    if (!invoice) {
      return c.json({ error: 'Expected invoice no encontrado' }, 404);
    }

    const principalId = invoice.balancedWithId ?? id;

    const hasGroup = await balanceRepo.hasBalanceGroup(principalId);
    if (!hasGroup) {
      return c.json({ group: null });
    }

    const format = c.req.query('format');
    if (format === 'comprobantes') {
      const service = createComprobanteService();
      const result = await service.listAll({ balanceGroupOf: principalId });
      return c.json({
        members: result.comprobantes,
        total: result.groupTotal,
        isBalanced: result.groupIsBalanced,
      });
    }

    const response = await buildBalanceGroupResponse(principalId);
    return c.json({ group: response });
  } catch (error) {
    console.error('Error fetching balance group:', error);
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Error al obtener grupo de balance',
      },
      500
    );
  }
});

// POST /api/expected-invoices/:id/balance — add member
expectedInvoicesRouter.post('/:id/balance', async (c) => {
  const principalId = parseInt(c.req.param('id'), 10);
  if (isNaN(principalId)) {
    return c.json({ error: 'ID inválido' }, 400);
  }

  try {
    const body: unknown = await c.req.json();
    const validation = BalanceGroupAddSchema.safeParse(body);

    if (!validation.success) {
      return c.json(formatZodError(validation.error), 400);
    }

    const { expectedId } = validation.data;

    const principal = await balanceRepo.findById(principalId);
    if (!principal) {
      return c.json({ error: 'Expected invoice principal no encontrado' }, 404);
    }

    if (principal.balancedWithId !== null) {
      return c.json(
        {
          error:
            `Este invoice ya pertenece a otro grupo (principal: ${principal.balancedWithId}). ` +
            `Para agregar, use el principal del grupo.`,
        },
        400
      );
    }

    const toAdd = await balanceRepo.findById(expectedId);
    if (!toAdd) {
      return c.json({ error: `Expected invoice ${expectedId} no encontrado` }, 404);
    }

    const warnings: string[] = [];
    if (toAdd.cuit !== principal.cuit) {
      warnings.push(
        `Advertencia: Los CUITs no coinciden (${principal.cuit} vs ${toAdd.cuit}). ` +
          `Esto es inusual para comprobantes relacionados.`
      );
    }

    await balanceRepo.addToBalanceGroup(expectedId, principalId);

    const response = await buildBalanceGroupResponse(principalId);

    if (response && !response.isBalanced) {
      warnings.push(
        `Advertencia: El grupo no está balanceado (total: $${response.total.toFixed(2)}). ` +
          `Se esperaría que la suma sea cercana a $0.`
      );
    }

    return c.json({
      success: true,
      group: response,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error) {
    console.error('Error adding to balance group:', error);
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Error al agregar al grupo de balance',
      },
      400
    );
  }
});

// PATCH /api/expected-invoices/:id/balance — change principal
expectedInvoicesRouter.patch('/:id/balance', async (c) => {
  const currentPrincipalId = parseInt(c.req.param('id'), 10);
  if (isNaN(currentPrincipalId)) {
    return c.json({ error: 'ID inválido' }, 400);
  }

  try {
    const body: unknown = await c.req.json();
    const validation = BalanceGroupSetPrincipalSchema.safeParse(body);

    if (!validation.success) {
      return c.json(formatZodError(validation.error), 400);
    }

    const { newPrincipalId } = validation.data;

    const currentPrincipal = await balanceRepo.findById(currentPrincipalId);
    if (!currentPrincipal) {
      return c.json({ error: 'Expected invoice no encontrado' }, 404);
    }

    if (currentPrincipal.balancedWithId !== null) {
      return c.json({ error: 'Este invoice no es el principal del grupo' }, 400);
    }

    const newPrincipal = await balanceRepo.findById(newPrincipalId);
    if (!newPrincipal) {
      return c.json({ error: `Expected invoice ${newPrincipalId} no encontrado` }, 404);
    }

    if (newPrincipal.balancedWithId !== currentPrincipalId) {
      return c.json({ error: `El invoice ${newPrincipalId} no es miembro de este grupo` }, 400);
    }

    await balanceRepo.setGroupPrincipal(newPrincipalId);

    const response = await buildBalanceGroupResponse(newPrincipalId);

    return c.json({ success: true, group: response });
  } catch (error) {
    console.error('Error changing group principal:', error);
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Error al cambiar el principal',
      },
      400
    );
  }
});

// DELETE /api/expected-invoices/:id/balance — dissolve
expectedInvoicesRouter.delete('/:id/balance', async (c) => {
  const principalId = parseInt(c.req.param('id'), 10);
  if (isNaN(principalId)) {
    return c.json({ error: 'ID inválido' }, 400);
  }

  try {
    const principal = await balanceRepo.findById(principalId);
    if (!principal) {
      return c.json({ error: 'Expected invoice no encontrado' }, 404);
    }

    if (principal.balancedWithId !== null) {
      return c.json(
        {
          error:
            'Solo el principal del grupo puede disolverlo. ' +
            `Este invoice pertenece al grupo del principal ${principal.balancedWithId}.`,
        },
        400
      );
    }

    const dissolved = await balanceRepo.dissolveBalanceGroup(principalId);

    if (dissolved === 0) {
      return c.json({ error: 'Este invoice no tiene un grupo de balance' }, 400);
    }

    return c.json({
      success: true,
      message: `Grupo disuelto. ${dissolved} invoice(s) liberados.`,
    });
  } catch (error) {
    console.error('Error dissolving balance group:', error);
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Error al disolver el grupo',
      },
      500
    );
  }
});

// DELETE /api/expected-invoices/:id/balance/:memberId — remove member
expectedInvoicesRouter.delete('/:id/balance/:memberId', async (c) => {
  const principalId = parseInt(c.req.param('id'), 10);
  const memberId = parseInt(c.req.param('memberId'), 10);

  if (isNaN(principalId) || isNaN(memberId)) {
    return c.json({ error: 'IDs inválidos' }, 400);
  }

  try {
    const principal = await balanceRepo.findById(principalId);
    if (!principal) {
      return c.json({ error: 'Expected invoice principal no encontrado' }, 404);
    }

    if (principal.balancedWithId !== null) {
      return c.json(
        {
          error:
            `Este invoice no es el principal del grupo. ` +
            `El principal es ${principal.balancedWithId}.`,
        },
        400
      );
    }

    const member = await balanceRepo.findById(memberId);
    if (!member) {
      return c.json({ error: `Expected invoice ${memberId} no encontrado` }, 404);
    }

    if (member.balancedWithId !== principalId) {
      return c.json({ error: `El invoice ${memberId} no pertenece a este grupo de balance` }, 400);
    }

    if (memberId === principalId) {
      return c.json(
        {
          error:
            'No se puede quitar el principal del grupo. Use DELETE en el grupo para disolverlo.',
        },
        400
      );
    }

    await balanceRepo.removeFromBalanceGroup(memberId);

    return c.json({
      success: true,
      message: `Invoice ${memberId} removido del grupo de balance.`,
    });
  } catch (error) {
    console.error('Error removing from balance group:', error);
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Error al quitar del grupo',
      },
      400
    );
  }
});

// POST /api/expected-invoices/:id/match
expectedInvoicesRouter.post('/:id/match', async (c) => {
  const id = c.req.param('id');
  console.info(`\n🔗 [API] POST /api/expected-invoices/${id}/match`);

  try {
    const body = await c.req.json<{ fileId?: number; confirmed?: boolean }>();
    const { fileId, confirmed } = body;

    if (!fileId || confirmed === undefined) {
      return c.json(
        {
          success: false,
          error: 'Faltan parámetros: fileId y confirmed son requeridos',
        },
        400
      );
    }

    console.info(`   📋 Expected Invoice ID: ${id}`);
    console.info(`   📄 File ID: ${fileId}`);
    console.info(`   ✅ Confirmado: ${confirmed}`);

    if (!confirmed) {
      console.info(`   ⏭️  Match rechazado por usuario`);
      return c.json({
        success: true,
        message: 'Match rechazado',
      });
    }

    const expectedRepo = new ExpectedInvoiceRepository();
    const expected = await expectedRepo.findById(parseInt(id, 10));

    if (!expected) {
      return c.json({ success: false, error: 'Factura esperada no encontrada' }, 404);
    }

    const fileRepo = new FileRepository();
    const file = fileRepo.findById(fileId);

    if (!file) {
      return c.json({ success: false, error: 'Archivo no encontrado' }, 404);
    }

    console.info(`   💾 Creando factura desde datos del Excel AFIP...`);

    const emitterRepo = new EmitterRepository();
    let emitter = emitterRepo.findByCUIT(expected.cuit);

    if (!emitter) {
      console.info(`   ➕ Creando nuevo emisor: ${expected.cuit}`);
      const personType = getPersonType(expected.cuit);

      emitter = emitterRepo.create({
        cuit: expected.cuit,
        name: expected.emitterName || `Emisor ${expected.cuit}`,
        aliases: [],
        personType: personType || undefined,
      });
    }

    const invoiceRepo = new InvoiceRepository();

    const existing = await invoiceRepo.findByEmitterAndNumber(
      expected.cuit,
      expected.invoiceType as InvoiceType,
      expected.pointOfSale,
      expected.invoiceNumber
    );

    if (existing) {
      console.warn(`   ⚠️  La factura ya existe en BD`);
      return c.json({ success: false, error: 'Esta factura ya fue procesada anteriormente' }, 409);
    }

    const invoice = await invoiceRepo.create({
      emitterCuit: expected.cuit,
      issueDate: expected.issueDate,
      invoiceType: expected.invoiceType as InvoiceType,
      pointOfSale: expected.pointOfSale,
      invoiceNumber: expected.invoiceNumber,
      total: expected.total || undefined,
      fileId: fileId,
    });

    console.info(`   ✅ Factura creada - ID: ${invoice.id}`);

    fileRepo.updateStatus(fileId, 'processed');
    console.info(`   🔗 Archivo marcado como procesado`);

    await expectedRepo.refreshStatus(parseInt(id, 10));
    console.info(`   ✅ Factura esperada marcada como matched`);

    return c.json({
      success: true,
      invoice,
      message: 'Factura creada exitosamente desde Excel AFIP',
    });
  } catch (error) {
    console.error('   ❌ Error al confirmar match:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      500
    );
  }
});

// GET /api/expected-invoices/:id
expectedInvoicesRouter.get('/:id', async (c) => {
  const idParam = c.req.param('id');
  console.info(`📋 [EXPECTED] Obteniendo expected invoice ID ${idParam}...`);

  try {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    const repo = new ExpectedInvoiceRepository();
    const invoice = await repo.findById(id);

    if (!invoice) {
      return c.json({ success: false, error: 'Expected invoice no encontrada' }, 404);
    }

    console.info(
      `✅ [EXPECTED] Encontrada: ${invoice.cuit} ${invoice.pointOfSale}-${invoice.invoiceNumber}`
    );

    return c.json({ success: true, invoice });
  } catch (error) {
    console.error('❌ [EXPECTED] Error:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      500
    );
  }
});

// PATCH /api/expected-invoices/:id
expectedInvoicesRouter.patch('/:id', async (c) => {
  const idParam = c.req.param('id');
  console.info(`📝 [EXPECTED] Actualizando expected invoice ID ${idParam}...`);

  try {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    const repo = new ExpectedInvoiceRepository();
    const existing = await repo.findById(id);

    if (!existing) {
      return c.json({ success: false, error: 'Expected invoice no encontrada' }, 404);
    }

    const body: unknown = await c.req.json();

    const parseResult = ExpectedInvoicePatchSchema.safeParse(body);
    if (!parseResult.success) {
      return c.json(formatZodError(parseResult.error), 400);
    }

    const updates = parseResult.data;

    if (updates.categoryId !== undefined) {
      await repo.updateCategory(id, updates.categoryId);
      console.info(`✅ [EXPECTED] Categoría actualizada para expected invoice ${id}`);
    }

    const otherUpdates: Record<string, string | number | null> = {};
    if (updates.notes !== undefined) otherUpdates.notes = updates.notes;
    if (updates.emitterName !== undefined) otherUpdates.emitterName = updates.emitterName;
    if (updates.total !== undefined) otherUpdates.total = updates.total;

    if (Object.keys(otherUpdates).length > 0) {
      await repo.updateInvoice(id, otherUpdates);
    }

    const updated = await repo.findById(id);

    return c.json({ success: true, invoice: updated });
  } catch (error) {
    console.error('❌ [EXPECTED] Error:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      500
    );
  }
});
