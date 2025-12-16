/**
 * Repository para la gestión de facturas (Drizzle ORM)
 */

import { eq, and, count, or, like } from 'drizzle-orm';
import { db } from '../db';
import { facturas, type Factura } from '../schema';
import type { InvoiceType, Currency, ExtractionMethod } from '../../utils/types';

// For backward compatibility
export interface Invoice {
  id: number;
  emitterCuit: string;
  templateUsedId?: number;
  issueDate: Date;
  invoiceType: InvoiceType;
  pointOfSale: number;
  invoiceNumber: number;
  fullInvoiceNumber: string;
  total: number;
  currency: Currency;
  originalFile: string;
  processedFile: string;
  fileHash?: string;
  fileType: 'PDF_DIGITAL' | 'PDF_IMAGEN' | 'IMAGEN';
  extractionMethod: ExtractionMethod;
  extractionConfidence?: number;
  manuallyValidated: boolean;
  requiresReview: boolean;
  processedAt: Date;
  expectedInvoiceId?: number;
  pendingFileId?: number;
  categoryId?: number;
}

export class InvoiceRepository {
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
      originalFile: row.archivoOriginal,
      processedFile: row.archivoProcesado,
      fileHash: row.fileHash || undefined,
      fileType: row.tipoArchivo,
      extractionMethod: row.metodoExtraccion as ExtractionMethod,
      extractionConfidence: row.confianzaExtraccion || undefined,
      manuallyValidated: row.validadoManualmente ?? false,
      requiresReview: row.requiereRevision ?? false,
      processedAt: row.procesadoEn ? new Date(row.procesadoEn) : new Date(),
      expectedInvoiceId: row.expectedInvoiceId || undefined,
      pendingFileId: row.pendingFileId || undefined,
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
    originalFile: string;
    processedFile: string;
    fileType: 'PDF_DIGITAL' | 'PDF_IMAGEN' | 'IMAGEN';
    extractionMethod: ExtractionMethod;
    extractionConfidence?: number;
    requiresReview?: boolean;
    expectedInvoiceId?: number;
    pendingFileId?: number;
    categoryId?: number;
  }): Promise<Invoice> {
    const issueDateStr =
      typeof data.issueDate === 'string'
        ? data.issueDate
        : data.issueDate.toISOString().split('T')[0];

    const fullInvoiceNumber = `${data.invoiceType}-${String(data.pointOfSale).padStart(4, '0')}-${String(data.invoiceNumber).padStart(8, '0')}`;

    const result = await db
      .insert(facturas)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      .values({
        emisorCuit: data.emitterCuit,
        templateUsadoId: data.templateUsedId ?? null,
        fechaEmision: issueDateStr,
        tipoComprobante: data.invoiceType,
        puntoVenta: data.pointOfSale,
        numeroComprobante: data.invoiceNumber,
        comprobanteCompleto: fullInvoiceNumber,
        total: data.total ?? null,
        moneda: data.currency || 'ARS',
        archivoOriginal: data.originalFile,
        archivoProcesado: data.processedFile,
        tipoArchivo: data.fileType,
        metodoExtraccion: data.extractionMethod,
        confianzaExtraccion: data.extractionConfidence ?? null,
        validadoManualmente: false,
        requiereRevision: data.requiresReview ?? false,
        expectedInvoiceId: data.expectedInvoiceId ?? null,
        pendingFileId: data.pendingFileId ?? null,
        categoryId: data.categoryId ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .returning();

    if (!result || result.length === 0) {
      throw new Error('Failed to create invoice');
    }

    return this.mapDrizzleToInvoice(result[0]!);
  }

  async findById(id: number): Promise<Invoice | null> {
    const result = await db.select().from(facturas).where(eq(facturas.id, id)).limit(1);
    return result.length > 0 ? this.mapDrizzleToInvoice(result[0]!) : null;
  }

  async findByInvoiceNumber(
    emitterCuit: string,
    type: InvoiceType,
    pointOfSale: number,
    number: number
  ): Promise<Invoice | null> {
    const result = await db
      .select()
      .from(facturas)
      .where(
        and(
          eq(facturas.emisorCuit, emitterCuit),
          eq(facturas.tipoComprobante, type),
          eq(facturas.puntoVenta, pointOfSale),
          eq(facturas.numeroComprobante, number)
        )
      )
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

    let query = db.select().from(facturas);

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
    await db
      .update(facturas)
      .set({ validadoManualmente: true, requiereRevision: false })
      .where(eq(facturas.id, id));
  }

  async updateProcessedFile(id: number, processedFile: string): Promise<void> {
    await db.update(facturas).set({ archivoProcesado: processedFile }).where(eq(facturas.id, id));
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

    let query = db.select({ count: count() }).from(facturas);
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const result = await query;
    return result[0]?.count || 0;
  }

  async search(term: string, limit = 20): Promise<Invoice[]> {
    const trimmed = term.trim();
    if (!trimmed) {
      const rows = await db.select().from(facturas).limit(limit);
      return rows.map((row) => this.mapDrizzleToInvoice(row));
    }

    const pattern = `%${trimmed}%`;

    const rows = await db
      .select()
      .from(facturas)
      .where(
        or(
          like(facturas.comprobanteCompleto, pattern),
          like(facturas.emisorCuit, pattern),
          like(facturas.archivoOriginal, pattern)
        )
      )
      .limit(limit);

    return rows
      .map((row) => this.mapDrizzleToInvoice(row))
      .sort((a, b) => b.issueDate.getTime() - a.issueDate.getTime());
  }

  async updateLinking(
    id: number,
    data: {
      expectedInvoiceId?: number | null;
      pendingFileId?: number | null;
      categoryId?: number | null;
    }
  ): Promise<Invoice | null> {
    const updates: Record<string, number | null> = {};
    if (data.expectedInvoiceId !== undefined) updates.expectedInvoiceId = data.expectedInvoiceId;
    if (data.pendingFileId !== undefined) updates.pendingFileId = data.pendingFileId;
    if (data.categoryId !== undefined) updates.categoryId = data.categoryId;

    if (Object.keys(updates).length === 0) {
      return this.findById(id);
    }

    const result = await db.update(facturas).set(updates).where(eq(facturas.id, id)).returning();

    return result.length > 0 ? this.mapDrizzleToInvoice(result[0]!) : null;
  }
}
