/**
 * Invoice vs ARCA tax breakdown reconciliation (#191).
 *
 * "Paper beats data": nothing is copied without a human action; invoice -> ARCA never.
 * Every mutation recomputes the state on the server before acting.
 */

import { Hono } from 'hono';
import {
  AcceptDifferenceBodySchema,
  ArcaFingerprintBodySchema,
  CompleteFromArcaBodySchema,
  ReconciliationListQuerySchema,
  formatZodError,
  periodToRange,
} from '../../contracts/index.js';
import { checkTaxLinesSum } from '../../contracts/invoice-tax-lines.js';
import {
  ReconciliationRepository,
  TAX_BREAKDOWN_KIND,
  type TaxBreakdownCandidate,
} from '../../database/repositories/reconciliation.js';
import {
  reconcileTaxBreakdown,
  type BucketDiff,
  type ReconciliationReason,
  type ReconciliationResult,
  type ReconciliationStatus,
} from '../../services/tax-breakdown-reconciliation.js';

export const reconciliationRouter = new Hono();

interface TaxReconciliationItem {
  invoiceId: number;
  issueDate: string;
  emitterCuit: string;
  emitterName: string | null;
  invoiceType: number | null;
  pointOfSale: number;
  invoiceNumber: number;
  total: number | null;
  currency: string;
  expectedInvoiceId: number | null;
  status: ReconciliationStatus;
  reason: ReconciliationReason;
  invoiceLines: Array<{
    concept: string;
    rate: number | null;
    amount: number;
    label: string | null;
  }>;
  arcaLines: Array<{ concept: string; rate: number | null; amount: number }> | null;
  arcaFingerprint: string | null;
  buckets: BucketDiff[];
  ack: { arcaFingerprint: string; note: string | null; createdAt: string } | null;
  ackStale: boolean;
}

function evaluate(c: TaxBreakdownCandidate, ignoreAck = false): ReconciliationResult {
  return reconcileTaxBreakdown({
    invoice: { total: c.total, lines: c.lines },
    expected: c.expected,
    ack: ignoreAck ? null : c.ack,
  });
}

function toItem(c: TaxBreakdownCandidate): TaxReconciliationItem {
  const r = evaluate(c);
  return {
    invoiceId: c.invoiceId,
    issueDate: c.issueDate,
    emitterCuit: c.emitterCuit,
    emitterName: c.emitterName,
    invoiceType: c.invoiceType,
    pointOfSale: c.pointOfSale,
    invoiceNumber: c.invoiceNumber,
    total: c.total,
    currency: c.currency,
    expectedInvoiceId: c.expectedInvoiceId,
    status: r.status,
    reason: r.reason,
    invoiceLines: c.lines,
    arcaLines: r.arcaLines,
    arcaFingerprint: r.arcaFingerprint,
    buckets: r.buckets,
    ack: c.ack,
    ackStale: r.ackStale,
  };
}

function parseId(raw: string): number | null {
  const id = parseInt(raw, 10);
  return Number.isNaN(id) ? null : id;
}

const INVALID_ID = { success: false, error: 'ID de factura inválido' } as const;
const NOT_FOUND = { success: false, error: 'Factura no encontrada' } as const;
const STALE_FINGERPRINT = {
  success: false,
  error: 'Los datos de ARCA cambiaron; recargue la comparación',
} as const;

// GET /api/reconciliation/tax-breakdown?period=
reconciliationRouter.get('/tax-breakdown', async (c) => {
  const parsed = ReconciliationListQuerySchema.safeParse({ period: c.req.query('period') });
  if (!parsed.success) {
    return c.json(formatZodError(parsed.error), 400);
  }
  try {
    const repo = new ReconciliationRepository();
    const candidates = await repo.listTaxBreakdownCandidates(periodToRange(parsed.data.period));
    const items = candidates.map(toItem);
    const counts = { completable: 0, manual: 0, ok: 0, divergent: 0 };
    for (const item of items) counts[item.status]++;
    return c.json({ success: true, period: parsed.data.period, counts, items });
  } catch (error) {
    console.error('Error listing tax reconciliation:', error);
    return c.json({ success: false, error: 'Error al obtener la conciliación' }, 500);
  }
});

// POST /api/reconciliation/tax-breakdown/complete
reconciliationRouter.post('/tax-breakdown/complete', async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = CompleteFromArcaBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(formatZodError(parsed.error), 400);
  }
  try {
    const repo = new ReconciliationRepository();
    const applied: number[] = [];
    const skipped: Array<{
      invoiceId: number;
      status: ReconciliationStatus | null;
      reason: string;
    }> = [];
    const entries: Array<{
      invoiceId: number;
      lines: Array<{ concept: string; rate: number | null; amount: number }>;
    }> = [];

    for (const invoiceId of parsed.data.invoiceIds) {
      const candidate = await repo.findTaxBreakdownCandidate(invoiceId);
      if (!candidate) {
        skipped.push({ invoiceId, status: null, reason: 'not_found' });
        continue;
      }
      const r = evaluate(candidate);
      if (r.status !== 'completable' || !r.arcaLines) {
        skipped.push({ invoiceId, status: r.status, reason: r.reason });
        continue;
      }
      entries.push({ invoiceId, lines: r.arcaLines });
      applied.push(invoiceId);
    }

    await repo.replaceBreakdowns(entries);
    return c.json({ success: true, applied, skipped });
  } catch (error) {
    console.error('Error completing tax breakdowns from ARCA:', error);
    return c.json({ success: false, error: 'Error al completar los desgloses' }, 500);
  }
});

// GET /api/reconciliation/tax-breakdown/:invoiceId
reconciliationRouter.get('/tax-breakdown/:invoiceId', async (c) => {
  const invoiceId = parseId(c.req.param('invoiceId'));
  if (invoiceId === null) return c.json(INVALID_ID, 400);
  try {
    const candidate = await new ReconciliationRepository().findTaxBreakdownCandidate(invoiceId);
    if (!candidate) return c.json(NOT_FOUND, 404);
    return c.json({ success: true, item: toItem(candidate) });
  } catch (error) {
    console.error('Error fetching tax reconciliation:', error);
    return c.json({ success: false, error: 'Error al obtener la conciliación' }, 500);
  }
});

// POST /api/reconciliation/tax-breakdown/:invoiceId/normalize — replaces own lines with ARCA's
reconciliationRouter.post('/tax-breakdown/:invoiceId/normalize', async (c) => {
  const invoiceId = parseId(c.req.param('invoiceId'));
  if (invoiceId === null) return c.json(INVALID_ID, 400);
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = ArcaFingerprintBodySchema.safeParse(body);
  if (!parsed.success) return c.json(formatZodError(parsed.error), 400);
  try {
    const repo = new ReconciliationRepository();
    const candidate = await repo.findTaxBreakdownCandidate(invoiceId);
    if (!candidate) return c.json(NOT_FOUND, 404);

    const r = evaluate(candidate, true);
    if (!r.arcaLines || r.arcaLines.length === 0 || r.arcaFingerprint === null) {
      return c.json(
        { success: false, error: 'El comprobante no tiene un desglose de ARCA para aplicar' },
        409
      );
    }
    if (parsed.data.arcaFingerprint !== r.arcaFingerprint) {
      return c.json(STALE_FINGERPRINT, 409);
    }
    if (candidate.total === null) {
      return c.json({ success: false, error: 'El comprobante no tiene total cargado' }, 409);
    }
    const sum = checkTaxLinesSum(r.arcaLines, Math.abs(candidate.total));
    if (!sum.ok) {
      return c.json(
        {
          success: false,
          error: `La suma del desglose de ARCA (${sum.sum.toFixed(2)}) no coincide con el total del comprobante (${Math.abs(candidate.total).toFixed(2)}); diferencia ${sum.diff.toFixed(2)}`,
        },
        409
      );
    }

    await repo.replaceBreakdowns([{ invoiceId, lines: r.arcaLines }], true);
    const fresh = await repo.findTaxBreakdownCandidate(invoiceId);
    return c.json({ success: true, item: toItem(fresh as TaxBreakdownCandidate) });
  } catch (error) {
    console.error('Error normalizing tax breakdown:', error);
    return c.json({ success: false, error: 'Error al normalizar el desglose' }, 500);
  }
});

// PUT /api/reconciliation/tax-breakdown/:invoiceId/ack — accept the current difference
reconciliationRouter.put('/tax-breakdown/:invoiceId/ack', async (c) => {
  const invoiceId = parseId(c.req.param('invoiceId'));
  if (invoiceId === null) return c.json(INVALID_ID, 400);
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = AcceptDifferenceBodySchema.safeParse(body);
  if (!parsed.success) return c.json(formatZodError(parsed.error), 400);
  try {
    const repo = new ReconciliationRepository();
    const candidate = await repo.findTaxBreakdownCandidate(invoiceId);
    if (!candidate) return c.json(NOT_FOUND, 404);

    const r = evaluate(candidate, true);
    if (r.status !== 'divergent') {
      return c.json(
        { success: false, error: 'El comprobante no tiene diferencias con ARCA para aceptar' },
        409
      );
    }
    if (parsed.data.arcaFingerprint !== r.arcaFingerprint) {
      return c.json(STALE_FINGERPRINT, 409);
    }

    await repo.upsertAck(
      invoiceId,
      TAX_BREAKDOWN_KIND,
      parsed.data.arcaFingerprint,
      parsed.data.note?.trim() || null
    );
    const fresh = await repo.findTaxBreakdownCandidate(invoiceId);
    return c.json({ success: true, item: toItem(fresh as TaxBreakdownCandidate) });
  } catch (error) {
    console.error('Error saving reconciliation ack:', error);
    return c.json({ success: false, error: 'Error al aceptar la diferencia' }, 500);
  }
});

// DELETE /api/reconciliation/tax-breakdown/:invoiceId/ack — idempotent
reconciliationRouter.delete('/tax-breakdown/:invoiceId/ack', async (c) => {
  const invoiceId = parseId(c.req.param('invoiceId'));
  if (invoiceId === null) return c.json(INVALID_ID, 400);
  try {
    const repo = new ReconciliationRepository();
    const candidate = await repo.findTaxBreakdownCandidate(invoiceId);
    if (!candidate) return c.json(NOT_FOUND, 404);
    await repo.deleteAck(invoiceId, TAX_BREAKDOWN_KIND);
    const fresh = await repo.findTaxBreakdownCandidate(invoiceId);
    return c.json({ success: true, item: toItem(fresh as TaxBreakdownCandidate) });
  } catch (error) {
    console.error('Error deleting reconciliation ack:', error);
    return c.json({ success: false, error: 'Error al quitar la aceptación' }, 500);
  }
});
