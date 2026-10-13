/**
 * Client service for expected invoices (ARCA) operations.
 * Wraps GET /api/expected-invoices/:id/arca-breakdown and POST /api/expected-invoices/:id/match.
 */

import type { ApiResult } from './ComprobanteService';
import type {
  ArcaBreakdownResponse,
  CreateFromExpectedBody,
  CreateFromExpectedResponse,
} from '$lib/components/CreateFromArcaPanel.types';

interface ErrorBody {
  error?: string;
  details?: Record<string, string[]>;
}

class ExpectedInvoicesService {
  async getArcaBreakdown(expectedId: number): Promise<ApiResult<ArcaBreakdownResponse>> {
    const fallback = 'No se pudo cargar el desglose informado por ARCA.';
    try {
      const response = await fetch(`/api/expected-invoices/${expectedId}/arca-breakdown`);
      if (response.ok) {
        return { success: true, data: (await response.json()) as ArcaBreakdownResponse };
      }
      return { success: false, error: await this.readError(response, fallback) };
    } catch (err) {
      console.error('Error fetching ARCA breakdown:', err);
      return { success: false, error: fallback };
    }
  }

  /** Creates the invoice by linking the expected with a file. Surfaces validation messages. */
  async createInvoiceFromExpected(
    expectedId: number,
    body: CreateFromExpectedBody
  ): Promise<ApiResult<CreateFromExpectedResponse>> {
    const fallback = 'No se pudo crear la factura.';
    try {
      const response = await fetch(`/api/expected-invoices/${expectedId}/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        return { success: true, data: (await response.json()) as CreateFromExpectedResponse };
      }
      return { success: false, error: await this.readError(response, fallback) };
    } catch (err) {
      console.error('Error creating invoice from expected:', err);
      return { success: false, error: fallback };
    }
  }

  private async readError(response: Response, fallback: string): Promise<string> {
    const body = (await response.json().catch(() => ({}))) as ErrorBody;
    const messages = Object.values(body.details ?? {}).flat();
    if (messages.length > 0) return messages.join('. ');
    return body.error ?? fallback;
  }
}

export const expectedInvoicesService = new ExpectedInvoicesService();
