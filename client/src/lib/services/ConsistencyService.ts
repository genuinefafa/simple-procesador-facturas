/**
 * Client service for the layer consistency check (invoice vs expected/file).
 * Wraps /api/reconciliation/consistency. Correcting the invoice itself goes
 * through the existing PATCH /api/invoices/:id.
 */

import type { ApiResult } from './ComprobanteService';
import type {
  ConsistencyField,
  ConsistencySource,
  Divergence,
  InvoiceCorrection,
} from './ConsistencyService.types';

const BASE = '/api/reconciliation/consistency';

interface ErrorBody {
  error?: string;
}

async function request<T>(
  url: string,
  init: RequestInit | undefined,
  fallbackError: string,
  pick: (body: Record<string, unknown>) => T
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, init);
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown> & ErrorBody;
    if (response.ok && body.success !== false) {
      return { success: true, data: pick(body) };
    }
    return { success: false, error: body.error ?? fallbackError };
  } catch (err) {
    console.error('Consistency request failed:', err);
    return { success: false, error: fallbackError };
  }
}

function jsonInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

const pickDivergences = (b: Record<string, unknown>) => b.divergences as Divergence[];

class ConsistencyService {
  list(invoiceId: number): Promise<ApiResult<Divergence[]>> {
    return request(
      `${BASE}/${invoiceId}`,
      undefined,
      'No se pudieron cargar las diferencias.',
      pickDivergences
    );
  }

  /** Copies the invoice category to the linked expected invoice or file */
  copyCategory(invoiceId: number, source: ConsistencySource): Promise<ApiResult<Divergence[]>> {
    return request(
      `${BASE}/${invoiceId}/category`,
      jsonInit('POST', { source }),
      'No se pudo completar la categoría.',
      pickDivergences
    );
  }

  accept(
    invoiceId: number,
    field: ConsistencyField,
    source: ConsistencySource,
    note?: string | null
  ): Promise<ApiResult<Divergence[]>> {
    return request(
      `${BASE}/${invoiceId}/ack`,
      jsonInit('PUT', { field, source, note: note ?? null }),
      'No se pudo aceptar la diferencia.',
      pickDivergences
    );
  }

  removeAcceptance(
    invoiceId: number,
    field: ConsistencyField,
    source: ConsistencySource
  ): Promise<ApiResult<Divergence[]>> {
    return request(
      `${BASE}/${invoiceId}/ack`,
      jsonInit('DELETE', { field, source }),
      'No se pudo quitar la aceptación.',
      pickDivergences
    );
  }

  /** Aligns the invoice with an input value (existing PATCH). May rename the file. */
  correctInvoice(invoiceId: number, correction: InvoiceCorrection): Promise<ApiResult<void>> {
    return request(
      `/api/invoices/${invoiceId}`,
      jsonInit('PATCH', correction),
      'No se pudo corregir la factura.',
      () => undefined
    );
  }
}

export const consistencyService = new ConsistencyService();
