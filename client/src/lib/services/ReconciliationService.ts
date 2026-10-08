/**
 * Client service for the tax breakdown reconciliation (invoice vs ARCA).
 * Wraps /api/reconciliation/tax-breakdown.
 */

import type { ApiResult } from './ComprobanteService';
import type {
  CompleteResponse,
  ReconciliationListResponse,
  TaxReconciliationItem,
} from './ReconciliationService.types';

const BASE = '/api/reconciliation/tax-breakdown';

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
    console.error('Reconciliation request failed:', err);
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

class ReconciliationService {
  list(period: string): Promise<ApiResult<ReconciliationListResponse>> {
    return request(
      `${BASE}?period=${encodeURIComponent(period)}`,
      undefined,
      'No se pudo cargar la conciliación.',
      (b) => b as unknown as ReconciliationListResponse
    );
  }

  complete(invoiceIds: number[]): Promise<ApiResult<CompleteResponse>> {
    return request(
      `${BASE}/complete`,
      jsonInit('POST', { invoiceIds }),
      'No se pudo completar el desglose.',
      (b) => b as unknown as CompleteResponse
    );
  }

  get(invoiceId: number): Promise<ApiResult<TaxReconciliationItem>> {
    return request(
      `${BASE}/${invoiceId}`,
      undefined,
      'No se pudo cargar la comparación.',
      (b) => b.item as TaxReconciliationItem
    );
  }

  normalize(invoiceId: number, arcaFingerprint: string): Promise<ApiResult<TaxReconciliationItem>> {
    return request(
      `${BASE}/${invoiceId}/normalize`,
      jsonInit('POST', { arcaFingerprint }),
      'No se pudo normalizar el desglose.',
      (b) => b.item as TaxReconciliationItem
    );
  }

  acceptDifference(
    invoiceId: number,
    arcaFingerprint: string,
    note?: string | null
  ): Promise<ApiResult<TaxReconciliationItem>> {
    return request(
      `${BASE}/${invoiceId}/ack`,
      jsonInit('PUT', { arcaFingerprint, note: note ?? null }),
      'No se pudo aceptar la diferencia.',
      (b) => b.item as TaxReconciliationItem
    );
  }

  removeAcceptance(invoiceId: number): Promise<ApiResult<TaxReconciliationItem>> {
    return request(
      `${BASE}/${invoiceId}/ack`,
      jsonInit('DELETE'),
      'No se pudo quitar la aceptación.',
      (b) => b.item as TaxReconciliationItem
    );
  }
}

export const reconciliationService = new ReconciliationService();
