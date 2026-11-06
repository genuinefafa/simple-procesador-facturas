/**
 * Layer consistency (#191): divergences between an invoice (source of truth)
 * and its linked expected invoice / file.
 *
 * Nothing is normalized automatically. The only write to an input is the
 * category, whose value is read from the invoice on the server. Total, date
 * and type of an expected invoice are never written: ARCA is not overwritten.
 */

import { Hono } from 'hono';
import {
  ConsistencyAckBodySchema,
  ConsistencyAckKeySchema,
  CopyCategoryBodySchema,
  formatZodError,
} from '../../contracts/index.js';
import { ConsistencyRepository } from '../../database/repositories/consistency.js';
import { ReconciliationRepository } from '../../database/repositories/reconciliation.js';
import {
  computeDivergences,
  consistencyAckKind,
  consistencyFingerprint,
  type Divergence,
} from '../../services/consistency.js';

export const consistencyRouter = new Hono();

function parseId(raw: string): number | null {
  const id = parseInt(raw, 10);
  return Number.isNaN(id) ? null : id;
}

const INVALID_ID = { success: false, error: 'ID de factura inválido' } as const;
const NOT_FOUND = { success: false, error: 'Factura no encontrada' } as const;

function view(invoiceId: number) {
  const ctx = new ConsistencyRepository().findContext(invoiceId);
  if (!ctx) return null;
  const divergences: Array<Divergence & { note: string | null }> = computeDivergences(
    ctx.input
  ).map((d) => ({
    ...d,
    note: d.acked ? (ctx.notes[consistencyAckKind(d.field, d.source)] ?? null) : null,
  }));
  return { ctx, divergences };
}

// GET /api/reconciliation/consistency/:invoiceId
consistencyRouter.get('/:invoiceId', (c) => {
  const invoiceId = parseId(c.req.param('invoiceId'));
  if (invoiceId === null) return c.json(INVALID_ID, 400);
  try {
    const v = view(invoiceId);
    if (!v) return c.json(NOT_FOUND, 404);
    return c.json({ success: true, divergences: v.divergences });
  } catch (error) {
    console.error('Error fetching consistency:', error);
    return c.json({ success: false, error: 'Error al obtener las divergencias' }, 500);
  }
});

// POST /api/reconciliation/consistency/:invoiceId/category — copies the invoice category to the input
consistencyRouter.post('/:invoiceId/category', async (c) => {
  const invoiceId = parseId(c.req.param('invoiceId'));
  if (invoiceId === null) return c.json(INVALID_ID, 400);
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = CopyCategoryBodySchema.safeParse(body);
  if (!parsed.success) return c.json(formatZodError(parsed.error), 400);
  try {
    const repo = new ConsistencyRepository();
    const ctx = repo.findContext(invoiceId);
    if (!ctx) return c.json(NOT_FOUND, 404);

    const { source } = parsed.data;
    const inputId = source === 'expected' ? ctx.expectedId : ctx.fileId;
    if (inputId === null) {
      return c.json(
        {
          success: false,
          error:
            source === 'expected'
              ? 'La factura no está vinculada a una esperada'
              : 'La factura no tiene archivo vinculado',
        },
        404
      );
    }
    if (ctx.invoiceCategoryId === null) {
      return c.json({ success: false, error: 'La factura no tiene categoría' }, 400);
    }

    repo.setInputCategory(source, inputId, ctx.invoiceCategoryId);
    const v = view(invoiceId);
    return c.json({ success: true, divergences: v?.divergences ?? [] });
  } catch (error) {
    console.error('Error copying category:', error);
    return c.json({ success: false, error: 'Error al copiar la categoría' }, 500);
  }
});

// PUT /api/reconciliation/consistency/:invoiceId/ack — accept the current difference
consistencyRouter.put('/:invoiceId/ack', async (c) => {
  const invoiceId = parseId(c.req.param('invoiceId'));
  if (invoiceId === null) return c.json(INVALID_ID, 400);
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = ConsistencyAckBodySchema.safeParse(body);
  if (!parsed.success) return c.json(formatZodError(parsed.error), 400);
  try {
    const v = view(invoiceId);
    if (!v) return c.json(NOT_FOUND, 404);
    const { field, source, note } = parsed.data;

    const divergence = v.divergences.find((d) => d.field === field && d.source === source);
    if (!divergence) {
      return c.json({ success: false, error: 'No hay una diferencia para aceptar' }, 409);
    }
    if (divergence.kind === 'missing') {
      return c.json(
        { success: false, error: 'Un dato faltante no se puede aceptar; complételo' },
        409
      );
    }

    new ReconciliationRepository().upsertAck(
      invoiceId,
      consistencyAckKind(field, source),
      consistencyFingerprint(field, divergence.sourceValue),
      note?.trim() || null
    );
    return c.json({ success: true, divergences: view(invoiceId)?.divergences ?? [] });
  } catch (error) {
    console.error('Error saving consistency ack:', error);
    return c.json({ success: false, error: 'Error al aceptar la diferencia' }, 500);
  }
});

// DELETE /api/reconciliation/consistency/:invoiceId/ack — idempotent
consistencyRouter.delete('/:invoiceId/ack', async (c) => {
  const invoiceId = parseId(c.req.param('invoiceId'));
  if (invoiceId === null) return c.json(INVALID_ID, 400);
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = ConsistencyAckKeySchema.safeParse(body);
  if (!parsed.success) return c.json(formatZodError(parsed.error), 400);
  try {
    if (!view(invoiceId)) return c.json(NOT_FOUND, 404);
    new ReconciliationRepository().deleteAck(
      invoiceId,
      consistencyAckKind(parsed.data.field, parsed.data.source)
    );
    return c.json({ success: true, divergences: view(invoiceId)?.divergences ?? [] });
  } catch (error) {
    console.error('Error deleting consistency ack:', error);
    return c.json({ success: false, error: 'Error al quitar la aceptación' }, 500);
  }
});
