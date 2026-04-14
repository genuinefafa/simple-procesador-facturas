/**
 * Service for comprobante detail page API operations.
 * Centralizes all API calls for invoice viewing/editing.
 */

import type { Comprobante } from '$lib/types/comprobante';

export type ExtractionMethod = 'ocr' | 'pdf_text' | 'qr';

export interface ExpectedInvoiceSummary {
  id: number;
  cuit: string;
  emitterName?: string | null;
  issueDate: string;
  invoiceType: number | null;
  pointOfSale: number;
  invoiceNumber: number;
  total?: number | null;
  status?: string;
  categoryId?: number | null;
}

export interface ExpectedCandidate extends ExpectedInvoiceSummary {
  matchScore: number;
  matchedFields: string[];
}

export interface InvoiceUpdateData {
  cuit: string;
  invoiceType: number | null;
  pointOfSale: number | null;
  invoiceNumber: number | null;
  issueDate: string;
  total: number | null;
  categoryId: number | null;
  emitterId?: number;
}

export interface ProcessResult {
  success: boolean;
  error?: string;
  extraction?: {
    confidence: number;
  };
}

export interface ApiResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  warnings?: string[];
}

// =============================================================================
// Balance Group Types
// =============================================================================

export interface BalanceGroupMember {
  id: number;
  cuit: string;
  emitterName: string | null;
  invoiceType: number | null;
  pointOfSale: number;
  invoiceNumber: number;
  total: number | null;
  issueDate: string;
  isPrincipal: boolean;
}

export interface BalanceGroup {
  principalId: number;
  members: BalanceGroupMember[];
  total: number;
  isBalanced: boolean;
}

class ComprobanteService {
  /**
   * Fetch pending expected invoices for linking
   */
  async fetchPendingExpected(cuit: string): Promise<ApiResult<ExpectedInvoiceSummary[]>> {
    try {
      // Incluimos también 'balanced': un expected que integra un balance group
      // sigue siendo candidato válido para vincular contra un file/factura nuevos
      // (es "no-matched"). Excluimos solo 'matched', que ya está ligado a otra factura.
      const response = await fetch(
        `/api/expected-invoices?status=pending,balanced&cuit=${encodeURIComponent(cuit)}`
      );
      if (response.ok) {
        const data = await response.json();
        return { success: true, data: data.invoices || [] };
      }
      return { success: false, error: 'Error al cargar facturas esperadas' };
    } catch (err) {
      console.error('Error fetching expected invoices:', err);
      return { success: false, error: 'Error al cargar facturas esperadas' };
    }
  }

  /**
   * Fetch expected invoices de un emisor para armar balance groups.
   * A diferencia de `fetchPendingExpected` (que busca candidatos para vincular
   * a una factura nueva), acá incluimos también `matched` y `balanced`: un
   * grupo de balance compensa dos comprobantes existentes (p.ej. FAC vs NCR
   * que ya tienen factura final cargada), no vincula comprobante a expected.
   */
  async fetchExpectedForBalance(cuit: string): Promise<ApiResult<ExpectedInvoiceSummary[]>> {
    try {
      const response = await fetch(
        `/api/expected-invoices?status=pending,matched,balanced&cuit=${encodeURIComponent(cuit)}`
      );
      if (response.ok) {
        const data = await response.json();
        return { success: true, data: data.invoices || [] };
      }
      return { success: false, error: 'Error al cargar facturas esperadas' };
    } catch (err) {
      console.error('Error fetching expected invoices for balance:', err);
      return { success: false, error: 'Error al cargar facturas esperadas' };
    }
  }

  /**
   * Search expected invoices with scoring based on extracted data
   */
  async searchExpectedCandidates(criteria: {
    cuit?: string;
    invoiceType?: number | null;
    pointOfSale?: number;
    invoiceNumber?: number;
    issueDate?: string;
    total?: number;
    limit?: number;
  }): Promise<ApiResult<ExpectedCandidate[]>> {
    try {
      const params = new URLSearchParams();
      if (criteria.cuit) params.set('cuit', criteria.cuit);
      if (criteria.invoiceType != null) params.set('type', String(criteria.invoiceType));
      if (criteria.pointOfSale != null) params.set('pointOfSale', String(criteria.pointOfSale));
      if (criteria.invoiceNumber != null)
        params.set('invoiceNumber', String(criteria.invoiceNumber));
      if (criteria.issueDate) params.set('date', criteria.issueDate);
      if (criteria.total != null) params.set('total', String(criteria.total));
      if (criteria.limit != null) params.set('limit', String(criteria.limit));

      const response = await fetch(`/api/expected-invoices/search?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        return { success: true, data: data.candidates || [] };
      }
      return { success: false, error: 'Error al buscar candidatos' };
    } catch (err) {
      console.error('Error searching expected candidates:', err);
      return { success: false, error: 'Error al buscar candidatos' };
    }
  }

  /**
   * Link an invoice to an expected invoice
   */
  async linkExpected(invoiceId: number, expectedId: number): Promise<ApiResult> {
    try {
      const response = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedInvoiceId: expectedId }),
      });

      if (response.ok) {
        return { success: true };
      }
      const err = await response.json();
      return { success: false, error: err.error || 'Error al vincular' };
    } catch {
      return { success: false, error: 'Error al vincular' };
    }
  }

  /**
   * Process a file with specified extraction method
   */
  async processFile(fileId: number, method: ExtractionMethod = 'ocr'): Promise<ProcessResult> {
    try {
      const response = await fetch('/api/invoices/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileIds: [fileId],
          method,
        }),
      });

      const data = await response.json();

      if (data.success) {
        return {
          success: true,
          extraction: { confidence: data.extraction?.confidence || 0 },
        };
      }
      return { success: false, error: data.error || 'Error al procesar' };
    } catch (err) {
      console.error('Error processing file:', err);
      return { success: false, error: 'Error al procesar archivo' };
    }
  }

  /**
   * Update an existing invoice
   */
  async updateInvoice(invoiceId: number, data: InvoiceUpdateData): Promise<ApiResult> {
    try {
      const response = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emitterCuit: data.cuit,
          invoiceType: data.invoiceType,
          pointOfSale: data.pointOfSale,
          invoiceNumber: data.invoiceNumber,
          issueDate: data.issueDate,
          total: data.total,
          categoryId: data.categoryId,
        }),
      });

      if (response.ok) {
        return { success: true };
      }
      const err = await response.json();
      return { success: false, error: err.error || 'Error al guardar' };
    } catch {
      return { success: false, error: 'Error al guardar' };
    }
  }

  /**
   * Update only the category of an invoice (Single Responsibility - lightweight update)
   */
  async updateInvoiceCategory(invoiceId: number, categoryId: number | null): Promise<ApiResult> {
    try {
      const response = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId }),
      });

      if (response.ok) {
        return { success: true };
      }
      const err = await response.json();
      return { success: false, error: err.error || 'Error al actualizar categoría' };
    } catch {
      return { success: false, error: 'Error al actualizar categoría' };
    }
  }

  /**
   * Update category of an expected invoice
   */
  async updateExpectedInvoiceCategory(
    expectedId: number,
    categoryId: number | null
  ): Promise<ApiResult> {
    try {
      const response = await fetch(`/api/expected-invoices/${expectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId }),
      });

      if (response.ok) {
        return { success: true };
      }
      const err = await response.json();
      return { success: false, error: err.error || 'Error al actualizar categoría' };
    } catch {
      return { success: false, error: 'Error al actualizar categoría' };
    }
  }

  /**
   * Update category of a file
   */
  async updateFileCategory(fileId: number, categoryId: number | null): Promise<ApiResult> {
    try {
      const response = await fetch(`/api/files/${fileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId }),
      });

      if (response.ok) {
        return { success: true };
      }
      const err = await response.json();
      return { success: false, error: err.error || 'Error al actualizar categoría' };
    } catch {
      return { success: false, error: 'Error al actualizar categoría' };
    }
  }

  // =============================================================================
  // Balance Group Operations
  // =============================================================================

  /**
   * Get balance group members as full Comprobante objects.
   * Used for rendering sub-rows with editable category, status, navigation.
   */
  async getBalanceGroupAsComprobantes(
    expectedId: number
  ): Promise<ApiResult<{ members: Comprobante[]; total: number; isBalanced: boolean }>> {
    try {
      const response = await fetch(
        `/api/expected-invoices/${expectedId}/balance?format=comprobantes`
      );
      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          data: { members: data.members, total: data.total, isBalanced: data.isBalanced },
        };
      }
      const err = await response.json();
      return { success: false, error: err.error || 'Error al obtener grupo de balance' };
    } catch {
      return { success: false, error: 'Error al obtener grupo de balance' };
    }
  }

  /**
   * Get the balance group for an expected invoice
   */
  async getBalanceGroup(expectedId: number): Promise<ApiResult<BalanceGroup | null>> {
    try {
      const response = await fetch(`/api/expected-invoices/${expectedId}/balance`);
      if (response.ok) {
        const data = await response.json();
        return { success: true, data: data.group };
      }
      const err = await response.json();
      return { success: false, error: err.error || 'Error al obtener grupo de balance' };
    } catch {
      return { success: false, error: 'Error al obtener grupo de balance' };
    }
  }

  /**
   * Add an expected invoice to a balance group
   * @param principalId - The principal (or future principal) of the group
   * @param expectedId - The invoice to add to the group
   */
  async addToBalanceGroup(
    principalId: number,
    expectedId: number
  ): Promise<ApiResult<BalanceGroup>> {
    try {
      const response = await fetch(`/api/expected-invoices/${principalId}/balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedId }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        return {
          success: true,
          data: data.group,
          warnings: data.warnings,
        };
      }
      return { success: false, error: data.error || 'Error al agregar al grupo' };
    } catch {
      return { success: false, error: 'Error al agregar al grupo de balance' };
    }
  }

  /**
   * Remove a member from a balance group
   * @param principalId - The principal of the group
   * @param memberId - The member to remove
   */
  async removeFromBalanceGroup(principalId: number, memberId: number): Promise<ApiResult> {
    try {
      const response = await fetch(`/api/expected-invoices/${principalId}/balance/${memberId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        return { success: true };
      }
      const err = await response.json();
      return { success: false, error: err.error || 'Error al quitar del grupo' };
    } catch {
      return { success: false, error: 'Error al quitar del grupo de balance' };
    }
  }

  /**
   * Dissolve an entire balance group
   * @param principalId - The principal of the group to dissolve
   */
  async dissolveBalanceGroup(principalId: number): Promise<ApiResult> {
    try {
      const response = await fetch(`/api/expected-invoices/${principalId}/balance`, {
        method: 'DELETE',
      });

      if (response.ok) {
        return { success: true };
      }
      const err = await response.json();
      return { success: false, error: err.error || 'Error al disolver el grupo' };
    } catch {
      return { success: false, error: 'Error al disolver el grupo de balance' };
    }
  }

  /**
   * Change the principal of a balance group
   * @param currentPrincipalId - Current principal of the group
   * @param newPrincipalId - New principal (must be a current member)
   */
  async setBalanceGroupPrincipal(
    currentPrincipalId: number,
    newPrincipalId: number
  ): Promise<ApiResult<BalanceGroup>> {
    try {
      const response = await fetch(`/api/expected-invoices/${currentPrincipalId}/balance`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPrincipalId }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        return { success: true, data: data.group };
      }
      return { success: false, error: data.error || 'Error al cambiar el principal' };
    } catch {
      return { success: false, error: 'Error al cambiar el principal del grupo' };
    }
  }
}

export const comprobanteService = new ComprobanteService();
