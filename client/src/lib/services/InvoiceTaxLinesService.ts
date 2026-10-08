/**
 * Client service for the invoice tax breakdown (#190).
 * Wraps GET/PUT /api/invoices/:id/tax-lines.
 */

import type { ApiResult } from './ComprobanteService';
import type { TaxLineInput, TaxLinesResponse } from '$lib/components/InvoiceTaxBreakdown.types';

interface ValidationErrorBody {
  error?: string;
  details?: Record<string, string[]>;
}

class InvoiceTaxLinesService {
  async get(invoiceId: number): Promise<ApiResult<TaxLinesResponse>> {
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/tax-lines`);
      if (response.ok) {
        return { success: true, data: (await response.json()) as TaxLinesResponse };
      }
      return { success: false, error: 'No se pudo cargar el desglose impositivo.' };
    } catch (err) {
      console.error('Error fetching tax lines:', err);
      return { success: false, error: 'No se pudo cargar el desglose impositivo.' };
    }
  }

  /** Replaces the whole breakdown. An empty array removes it. */
  async save(invoiceId: number, lines: TaxLineInput[]): Promise<ApiResult<TaxLinesResponse>> {
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/tax-lines`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines }),
      });
      if (response.ok) {
        return { success: true, data: (await response.json()) as TaxLinesResponse };
      }
      const body = (await response.json().catch(() => ({}))) as ValidationErrorBody;
      const messages = Object.values(body.details ?? {}).flat();
      return {
        success: false,
        error: messages.length > 0 ? messages.join('. ') : (body.error ?? 'No se pudo guardar.'),
      };
    } catch (err) {
      console.error('Error saving tax lines:', err);
      return { success: false, error: 'No se pudo guardar el desglose impositivo.' };
    }
  }
}

export const invoiceTaxLinesService = new InvoiceTaxLinesService();
