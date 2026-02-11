/**
 * Repository para la gestión de facturas (Drizzle ORM)
 */

import { eq, and, count, or, like } from 'drizzle-orm';
import { getDb } from '../db';
import { facturas, type Factura } from '../schema';
import type { InvoiceType, Currency, ExtractionMethod } from '@shared/types';

/**
 * Interface for InvoiceRepository - enables dependency injection and testing
 */
export interface IInvoiceRepository {
  create(data: {
    emitterCuit: string;
    templateUsedId?: number;
    issueDate: Date | string;
    invoiceType: InvoiceType;
    pointOfSale: number;
    invoiceNumber: number;
    total?: number;
    currency?: Currency;
    fileId: number;
    fileType: 'PDF_DIGITAL' | 'PDF_IMAGEN' | 'IMAGEN';
    extractionMethod: ExtractionMethod;
    extractionConfidence?: number;
    requiresReview?: boolean;
    expectedInvoiceId?: number;
    categoryId?: number;
  }): Promise<Invoice>;
  findById(id: number): Promise<Invoice | null>;
  findByFileId(fileId: number): Promise<Invoice[]>;
  findByInvoiceNumber(
    emitterCuit: string,
    type: InvoiceType,
    pointOfSale: number,
    number: number
  ): Promise<Invoice | null>;
  list(filters?: {
    emitterCuit?: string;
    dateFrom?: Date;
    dateTo?: Date;
    minAmount?: number;
    maxAmount?: number;
    invoiceType?: InvoiceType;
    requiresReview?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<Invoice[]>;
  update(
    id: number,
    data: Partial<{
      emisorCuit: string;
      tipoComprobante: InvoiceType;
      puntoVenta: number;
      numeroComprobante: number;
      comprobanteCompleto: string;
      total: number;
      fechaEmision: string;
      categoryId: number | null;
      expectedInvoiceId: number | null;
    }>
  ): Promise<Invoice | null>;
  deleteWithUnlink(
    id: number
  ): Promise<
    | { success: true; unlinkedExpected?: number; unlinkedFile?: number }
    | { success: false; error: string }
  >;
  /** @deprecated Use FileRepository.updatePath() instead */
  updateProcessedFile(id: number, processedFile: string, finalizedFile?: string): void;
}

/**
 * Invoice interface - rutas de archivo se obtienen via fileId -> files table
 * Las columnas archivo_procesado y finalized_file fueron eliminadas en migración 0014
 *
 * NOTA: Varios campos están marcados @deprecated y serán eliminados en issue #92
 */
export interface Invoice {
  id: number;
  emitterCuit: string;
  /** @deprecated Nunca se usó. Eliminar en issue #92 */
  templateUsedId?: number;
  issueDate: Date;
  invoiceType: InvoiceType;
  pointOfSale: number;
  invoiceNumber: number;
  /** @deprecated Redundante, se puede reconstruir. Eliminar en issue #92 */
  fullInvoiceNumber: string;
  total: number;
  currency: Currency;
  fileId?: number; // FK a files - fuente de verdad para rutas
  /** @deprecated Duplicado en files.file_type. Eliminar en issue #92 */
  fileType: 'PDF_DIGITAL' | 'PDF_IMAGEN' | 'IMAGEN';
  /** @deprecated Duplicado en file_extraction_results.method. Eliminar en issue #92 */
  extractionMethod: ExtractionMethod;
  /** @deprecated Duplicado en file_extraction_results.confidence. Eliminar en issue #92 */
  extractionConfidence?: number;
  /** @deprecated Sin uso real. Eliminar en issue #92 */
  manuallyValidated: boolean;
  /** @deprecated Sin uso en nueva UI. Eliminar en issue #92 */
  requiresReview: boolean;
  /** @deprecated Renombrar a createdAt. Es fecha de creación del registro. issue #92 */
  processedAt: Date;
  expectedInvoiceId?: number;
  categoryId?: number;
}

export class InvoiceRepository implements IInvoiceRepository {
  private mapDrizzleToInvoice(row: Factura): Invoice {
    return {
      id: row.id,
      emitterCuit: row.emisorCuit,
      templateUsedId: row.templateUsadoId || undefined,
      issueDate: new Date(row.fechaEmision),
      invoiceType: row.tipoComprobante,
      pointOfSale: row.puntoVenta,
      invoiceNumber: row.numeroComprobante,
      fullInvoiceNumber: row.comprobanteCompleto,
      total: row.total || 0,
      currency: row.moneda || 'ARS',
      fileId: row.fileId || undefined,
      fileType: row.tipoArchivo,
      extractionMethod: row.metodoExtraccion as ExtractionMethod,
      extractionConfidence: row.confianzaExtraccion || undefined,
      manuallyValidated: row.validadoManualmente ?? false,
      requiresReview: row.requiereRevision ?? false,
      processedAt: row.procesadoEn ? new Date(row.procesadoEn) : new Date(),
      expectedInvoiceId: row.expectedInvoiceId || undefined,
      categoryId: row.categoryId || undefined,
    };
  }

  async create(data: {
    emitterCuit: string;
    templateUsedId?: number;
    issueDate: Date | string;
    invoiceType: InvoiceType;
    pointOfSale: number;
    invoiceNumber: number;
    total?: number;
    currency?: Currency;
    fileId: number; // Requerido - FK a files
    fileType: 'PDF_DIGITAL' | 'PDF_IMAGEN' | 'IMAGEN';
    extractionMethod: ExtractionMethod;
    extractionConfidence?: number;
    requiresReview?: boolean;
    expectedInvoiceId?: number;
    categoryId?: number;
  }): Promise<Invoice> {
    const issueDateStr: string =
      typeof data.issueDate === 'string'
        ? data.issueDate
        : data.issueDate.toISOString().slice(0, 10);

    const fullInvoiceNumber = `${data.invoiceType}-${String(data.pointOfSale).padStart(4, '0')}-${String(data.invoiceNumber).padStart(8, '0')}`;

    const insertData = {
      emisorCuit: data.emitterCuit,
      templateUsadoId: data.templateUsedId ?? null,
      fechaEmision: issueDateStr,
      tipoComprobante: data.invoiceType,
      puntoVenta: data.pointOfSale,
      numeroComprobante: data.invoiceNumber,
      comprobanteCompleto: fullInvoiceNumber,
      total: data.total ?? null,
      moneda: data.currency || 'ARS',
      fileId: data.fileId,
      tipoArchivo: data.fileType,
      metodoExtraccion: data.extractionMethod as 'TEMPLATE' | 'GENERICO' | 'MANUAL',
      confianzaExtraccion: data.extractionConfidence ?? null,
      validadoManualmente: false,
      requiereRevision: data.requiresReview ?? false,
      expectedInvoiceId: data.expectedInvoiceId ?? null,
      categoryId: data.categoryId ?? null,
    };
    const result = await getDb().insert(facturas).values(insertData).returning();

    if (!result || result.length === 0) {
      throw new Error('Failed to create invoice');
    }

    return this.mapDrizzleToInvoice(result[0]!);
  }

  async findById(id: number): Promise<Invoice | null> {
    const result = await getDb().select().from(facturas).where(eq(facturas.id, id)).limit(1);
    return result.length > 0 ? this.mapDrizzleToInvoice(result[0]!) : null;
  }

  async findByFileId(fileId: number): Promise<Invoice[]> {
    const result = await getDb().select().from(facturas).where(eq(facturas.fileId, fileId));
    return result.map((row) => this.mapDrizzleToInvoice(row));
  }

  async findByInvoiceNumber(
    emitterCuit: string,
    type: InvoiceType,
    pointOfSale: number,
    number: number
  ): Promise<Invoice | null> {
    const conditions = [
      eq(facturas.emisorCuit, emitterCuit),
      eq(facturas.puntoVenta, pointOfSale),
      eq(facturas.numeroComprobante, number),
    ];

    // Solo agregar condición de tipo si no es null
    if (type !== null) {
      conditions.push(eq(facturas.tipoComprobante, type));
    }

    const result = await getDb()
      .select()
      .from(facturas)
      .where(and(...conditions))
      .limit(1);

    return result.length > 0 ? this.mapDrizzleToInvoice(result[0]!) : null;
  }

  async list(filters?: {
    emitterCuit?: string;
    dateFrom?: Date;
    dateTo?: Date;
    minAmount?: number;
    maxAmount?: number;
    invoiceType?: InvoiceType;
    requiresReview?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<Invoice[]> {
    const conditions = [];

    if (filters?.emitterCuit) {
      conditions.push(eq(facturas.emisorCuit, filters.emitterCuit));
    }
    if (filters?.invoiceType) {
      conditions.push(eq(facturas.tipoComprobante, filters.invoiceType));
    }
    if (filters?.requiresReview !== undefined) {
      conditions.push(eq(facturas.requiereRevision, filters.requiresReview));
    }

    let query = getDb().select().from(facturas);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    // Execute query first, then apply limit/offset in JS
    const allResults = await query;
    let result = allResults.sort(
      (a, b) => new Date(b.fechaEmision).getTime() - new Date(a.fechaEmision).getTime()
    );

    if (filters?.offset) {
      result = result.slice(filters.offset);
    }
    if (filters?.limit) {
      result = result.slice(0, filters.limit);
    }
    return result.map((row) => this.mapDrizzleToInvoice(row));
  }

  async markAsValidated(id: number): Promise<void> {
    await getDb()
      .update(facturas)
      .set({ validadoManualmente: true, requiereRevision: false })
      .where(eq(facturas.id, id));
  }

  /**
   * @deprecated Columnas archivo_procesado y finalized_file eliminadas.
   * Usar FileRepository.updatePath() para actualizar files.storage_path
   */
  updateProcessedFile(_id: number, _processedFile: string, _finalizedFile?: string): void {
    console.warn(
      '[DEPRECATED] InvoiceRepository.updateProcessedFile() - usar FileRepository.updatePath()'
    );
    // No-op: columnas eliminadas
  }

  async findByEmitterAndNumber(
    emitterCuit: string,
    type: InvoiceType,
    pointOfSale: number,
    number: number
  ): Promise<Invoice | null> {
    return this.findByInvoiceNumber(emitterCuit, type, pointOfSale, number);
  }

  async count(filters?: { emitterCuit?: string; requiresReview?: boolean }): Promise<number> {
    const conditions = [];
    if (filters?.emitterCuit) {
      conditions.push(eq(facturas.emisorCuit, filters.emitterCuit));
    }
    if (filters?.requiresReview !== undefined) {
      conditions.push(eq(facturas.requiereRevision, filters.requiresReview));
    }

    let query = getDb().select({ count: count() }).from(facturas);
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const result = await query;
    return result[0]?.count || 0;
  }

  async search(term: string, limit = 20): Promise<Invoice[]> {
    const trimmed = term.trim();
    if (!trimmed) {
      const rows = await getDb().select().from(facturas).limit(limit);
      return rows.map((row) => this.mapDrizzleToInvoice(row));
    }

    const pattern = `%${trimmed}%`;

    const rows = await getDb()
      .select()
      .from(facturas)
      .where(or(like(facturas.comprobanteCompleto, pattern), like(facturas.emisorCuit, pattern)))
      .limit(limit);

    return rows
      .map((row) => this.mapDrizzleToInvoice(row))
      .sort((a, b) => b.issueDate.getTime() - a.issueDate.getTime());
  }

  async updateLinking(
    id: number,
    data: {
      expectedInvoiceId?: number | null;
      fileId?: number | null;
      categoryId?: number | null;
    }
  ): Promise<Invoice | null> {
    const updates: Record<string, number | null> = {};
    if (data.expectedInvoiceId !== undefined) updates.expectedInvoiceId = data.expectedInvoiceId;
    if (data.fileId !== undefined) updates.fileId = data.fileId;
    if (data.categoryId !== undefined) updates.categoryId = data.categoryId;

    if (Object.keys(updates).length === 0) {
      return this.findById(id);
    }

    const result = await getDb()
      .update(facturas)
      .set(updates)
      .where(eq(facturas.id, id))
      .returning();

    return result.length > 0 ? this.mapDrizzleToInvoice(result[0]!) : null;
  }

  /**
   * Update invoice fields
   */
  async update(
    id: number,
    data: Partial<{
      emisorCuit: string;
      tipoComprobante: InvoiceType;
      puntoVenta: number;
      numeroComprobante: number;
      comprobanteCompleto: string;
      total: number;
      fechaEmision: string;
      categoryId: number | null;
      expectedInvoiceId: number | null;
    }>
  ): Promise<Invoice | null> {
    const updates: Record<string, string | number | null> = {};

    if (data.emisorCuit !== undefined) updates.emisorCuit = data.emisorCuit;
    if (data.tipoComprobante !== undefined) updates.tipoComprobante = data.tipoComprobante;
    if (data.puntoVenta !== undefined) updates.puntoVenta = data.puntoVenta;
    if (data.numeroComprobante !== undefined) updates.numeroComprobante = data.numeroComprobante;
    if (data.comprobanteCompleto !== undefined)
      updates.comprobanteCompleto = data.comprobanteCompleto;
    if (data.total !== undefined) updates.total = data.total;
    if (data.fechaEmision !== undefined) updates.fechaEmision = data.fechaEmision;
    if (data.categoryId !== undefined) updates.categoryId = data.categoryId;
    if (data.expectedInvoiceId !== undefined) updates.expectedInvoiceId = data.expectedInvoiceId;

    if (Object.keys(updates).length === 0) {
      return this.findById(id);
    }

    const result = await getDb()
      .update(facturas)
      .set(updates)
      .where(eq(facturas.id, id))
      .returning();

    return result.length > 0 ? this.mapDrizzleToInvoice(result[0]!) : null;
  }

  /**
   * Elimina una factura con desvinculación segura:
   * - Si tiene expected_invoice_id, vuelve el expected a "pending"
   * - Si tiene file_id, vuelve el file a "uploaded"
   * - Mantiene archivos físicos intactos
   */
  async deleteWithUnlink(
    id: number
  ): Promise<
    | { success: true; unlinkedExpected?: number; unlinkedFile?: number }
    | { success: false; error: string }
  > {
    try {
      // Primero obtener la factura para saber qué desvincular
      const invoice = await this.findById(id);
      if (!invoice) {
        return { success: false, error: 'Factura no encontrada' };
      }

      const result: { success: true; unlinkedExpected?: number; unlinkedFile?: number } = {
        success: true,
      };

      // Si tiene expected vinculado, revertir status a "pending"
      if (invoice.expectedInvoiceId) {
        const { expectedInvoices } = await import('../schema.js');
        await getDb()
          .update(expectedInvoices)
          .set({ status: 'pending' })
          .where(eq(expectedInvoices.id, invoice.expectedInvoiceId));
        result.unlinkedExpected = invoice.expectedInvoiceId;
      }

      // Si tiene file vinculado, revertir status a "uploaded"
      if (invoice.fileId) {
        const { files } = await import('../schema.js');
        await getDb().update(files).set({ status: 'uploaded' }).where(eq(files.id, invoice.fileId));
        result.unlinkedFile = invoice.fileId;
      }

      // Finalmente, eliminar la factura
      await getDb().delete(facturas).where(eq(facturas.id, id));

      return result;
    } catch (error) {
      console.error('Error deleting invoice:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido al eliminar factura',
      };
    }
  }

  async listAllProcessed(): Promise<Invoice[]> {
    const result = await getDb().select().from(facturas);

    return result.map((row) => this.mapDrizzleToInvoice(row));
  }
}
