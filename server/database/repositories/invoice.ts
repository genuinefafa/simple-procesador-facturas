/**
 * Repository para la gestión de facturas (Drizzle ORM)
 */

import { eq, and, count, or, like } from 'drizzle-orm';
import { getDb } from '../db';
import { facturas, type Factura } from '../schema';
import type { InvoiceType, Currency } from '@shared/types';

/**
 * Interface for InvoiceRepository - enables dependency injection and testing
 */
export interface IInvoiceRepository {
  create(data: {
    emitterCuit: string;
    issueDate: Date | string;
    invoiceType: InvoiceType;
    pointOfSale: number;
    invoiceNumber: number;
    total?: number;
    currency?: Currency;
    fileId: number;
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
}

/**
 * Invoice interface - rutas de archivo se obtienen via fileId -> files table
 * Las columnas archivo_procesado y finalized_file fueron eliminadas en migración 0014
 */
export interface Invoice {
  id: number;
  emitterCuit: string;
  issueDate: Date;
  invoiceType: InvoiceType;
  pointOfSale: number;
  invoiceNumber: number;
  fullInvoiceNumber: string; // Computed: "type-pv-num"
  total: number;
  currency: Currency;
  fileId?: number; // FK a files - fuente de verdad para rutas
  createdAt: Date;
  expectedInvoiceId?: number;
  categoryId?: number;
}

export class InvoiceRepository implements IInvoiceRepository {
  private mapDrizzleToInvoice(row: Factura): Invoice {
    const fullInvoiceNumber = `${row.tipoComprobante}-${String(row.puntoVenta).padStart(5, '0')}-${String(row.numeroComprobante).padStart(8, '0')}`;
    return {
      id: row.id,
      emitterCuit: row.emisorCuit,
      issueDate: new Date(row.fechaEmision),
      invoiceType: row.tipoComprobante,
      pointOfSale: row.puntoVenta,
      invoiceNumber: row.numeroComprobante,
      fullInvoiceNumber,
      total: row.total || 0,
      currency: row.moneda || 'ARS',
      fileId: row.fileId || undefined,
      createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      expectedInvoiceId: row.expectedInvoiceId || undefined,
      categoryId: row.categoryId || undefined,
    };
  }

  async create(data: {
    emitterCuit: string;
    issueDate: Date | string;
    invoiceType: InvoiceType;
    pointOfSale: number;
    invoiceNumber: number;
    total?: number;
    currency?: Currency;
    fileId: number;
    expectedInvoiceId?: number;
    categoryId?: number;
  }): Promise<Invoice> {
    const issueDateStr: string =
      typeof data.issueDate === 'string'
        ? data.issueDate
        : data.issueDate.toISOString().slice(0, 10);

    const insertData = {
      emisorCuit: data.emitterCuit,
      fechaEmision: issueDateStr,
      tipoComprobante: data.invoiceType,
      puntoVenta: data.pointOfSale,
      numeroComprobante: data.invoiceNumber,
      total: data.total ?? null,
      moneda: data.currency || 'ARS',
      fileId: data.fileId,
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

  async findByExpectedInvoiceId(expectedInvoiceId: number): Promise<Invoice[]> {
    const result = await getDb()
      .select()
      .from(facturas)
      .where(eq(facturas.expectedInvoiceId, expectedInvoiceId));
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

  async findByEmitterAndNumber(
    emitterCuit: string,
    type: InvoiceType,
    pointOfSale: number,
    number: number
  ): Promise<Invoice | null> {
    return this.findByInvoiceNumber(emitterCuit, type, pointOfSale, number);
  }

  async count(filters?: { emitterCuit?: string }): Promise<number> {
    const conditions = [];
    if (filters?.emitterCuit) {
      conditions.push(eq(facturas.emisorCuit, filters.emitterCuit));
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

    // Search on CUIT, and on individual invoice number components
    const numericTerm = parseInt(trimmed, 10);
    const conditions = [like(facturas.emisorCuit, pattern)];

    if (!isNaN(numericTerm)) {
      conditions.push(eq(facturas.puntoVenta, numericTerm));
      conditions.push(eq(facturas.numeroComprobante, numericTerm));
      if (numericTerm <= 100) {
        conditions.push(eq(facturas.tipoComprobante, numericTerm));
      }
    }

    const rows = await getDb()
      .select()
      .from(facturas)
      .where(or(...conditions))
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

      // Si tiene expected vinculado, refresh its status after unlinking
      if (invoice.expectedInvoiceId) {
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

      // Refresh expected status after factura is deleted (derives 'pending' from no linked factura)
      if (result.unlinkedExpected) {
        const { ExpectedInvoiceRepository } = await import('./expected-invoice.js');
        const expectedRepo = new ExpectedInvoiceRepository();
        await expectedRepo.refreshStatus(result.unlinkedExpected);
      }

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
