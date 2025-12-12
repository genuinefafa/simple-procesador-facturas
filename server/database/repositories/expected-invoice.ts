/**
 * Repository para la gestión de facturas esperadas (Drizzle ORM)
 */

import { eq, inArray, and, desc, gte, lte } from 'drizzle-orm';
import { db } from '../db';
import {
  expectedInvoices,
  importBatches,
  pendingFiles,
  type ExpectedInvoice as DrizzelExpectedInvoice,
  type ImportBatch as DrizzelImportBatch,
} from '../schema';

export type ExpectedInvoiceStatus = 'pending' | 'matched' | 'discrepancy' | 'manual' | 'ignored';

export interface ExpectedInvoice {
  id: number;
  importBatchId: number | null;
  cuit: string;
  emitterName: string | null;
  issueDate: string;
  invoiceType: string;
  pointOfSale: number;
  invoiceNumber: number;
  total: number | null;
  cae: string | null;
  caeExpiration: string | null;
  currency: string | null;
  status: ExpectedInvoiceStatus;
  matchedPendingFileId: number | null;
  matchConfidence: number | null;
  importDate: string | null;
  notes: string | null;
}

export interface ExpectedInvoiceWithFile extends ExpectedInvoice {
  filePath: string | null;
}

export interface ImportBatch {
  id: number;
  filename: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number | null;
  errorRows: number | null;
  importDate: string | null;
  notes: string | null;
}

export class ExpectedInvoiceRepository {
  private mapDrizzleToExpectedInvoice(row: DrizzelExpectedInvoice | undefined): ExpectedInvoice {
    if (!row) {
      throw new Error('Cannot map undefined row to ExpectedInvoice');
    }
    return {
      id: row.id,
      importBatchId: row.importBatchId || null,
      cuit: row.cuit,
      emitterName: row.emitterName || null,
      issueDate: row.issueDate,
      invoiceType: row.invoiceType,
      pointOfSale: row.pointOfSale,
      invoiceNumber: row.invoiceNumber,
      total: row.total || null,
      cae: row.cae || null,
      caeExpiration: row.caeExpiration || null,
      currency: row.currency || 'ARS',
      status: (row.status as ExpectedInvoiceStatus) || 'pending',
      matchedPendingFileId: row.matchedPendingFileId || null,
      matchConfidence: row.matchConfidence || null,
      importDate: row.importDate || null,
      notes: row.notes || null,
    };
  }

  private mapDrizzleToImportBatch(row: DrizzelImportBatch | undefined): ImportBatch {
    if (!row) {
      throw new Error('Cannot map undefined row to ImportBatch');
    }
    return {
      id: row.id,
      filename: row.filename,
      totalRows: row.totalRows,
      importedRows: row.importedRows,
      skippedRows: row.skippedRows || null,
      errorRows: row.errorRows || null,
      importDate: row.importDate || null,
      notes: row.notes || null,
    };
  }

  // =============================================================================
  // GESTIÓN DE LOTES DE IMPORTACIÓN
  // =============================================================================

  async createBatch(data: {
    filename: string;
    totalRows: number;
    importedRows?: number;
    skippedRows?: number;
    errorRows?: number;
    notes?: string;
  }): Promise<ImportBatch> {
    const result = await db
      .insert(importBatches)
      .values({
        filename: data.filename,
        totalRows: data.totalRows,
        importedRows: data.importedRows || 0,
        skippedRows: data.skippedRows || 0,
        errorRows: data.errorRows || 0,
        notes: data.notes || null,
      })
      .returning();

    if (result.length === 0) {
      throw new Error('Failed to create import batch');
    }

    return this.mapDrizzleToImportBatch(result[0]);
  }

  async findBatchById(id: number): Promise<ImportBatch | null> {
    const result = await db.select().from(importBatches).where(eq(importBatches.id, id));

    return result.length > 0 ? this.mapDrizzleToImportBatch(result[0]) : null;
  }

  async updateBatch(
    id: number,
    data: {
      importedRows?: number;
      skippedRows?: number;
      errorRows?: number;
      notes?: string;
    }
  ): Promise<ImportBatch> {
    const updates: any = {};
    if (data.importedRows !== undefined) updates.importedRows = data.importedRows;
    if (data.skippedRows !== undefined) updates.skippedRows = data.skippedRows;
    if (data.errorRows !== undefined) updates.errorRows = data.errorRows;
    if (data.notes !== undefined) updates.notes = data.notes;

    if (Object.keys(updates).length === 0) {
      const found = await this.findBatchById(id);
      if (!found) throw new Error('Import batch not found');
      return found;
    }

    const result = await db
      .update(importBatches)
      .set(updates)
      .where(eq(importBatches.id, id))
      .returning();

    if (result.length === 0) {
      throw new Error('Import batch not found after update');
    }

    return this.mapDrizzleToImportBatch(result[0]);
  }

  async listBatches(limit?: number): Promise<ImportBatch[]> {
    const result = limit
      ? await db.select().from(importBatches).orderBy(desc(importBatches.importDate)).limit(limit)
      : await db.select().from(importBatches).orderBy(desc(importBatches.importDate));

    return result.map((row) => this.mapDrizzleToImportBatch(row));
  }

  // =============================================================================
  // GESTIÓN DE FACTURAS ESPERADAS
  // =============================================================================

  async createManyInvoices(
    invoices: Array<{
      cuit: string;
      emitterName?: string;
      issueDate: string;
      invoiceType: string;
      pointOfSale: number;
      invoiceNumber: number;
      total?: number;
      cae?: string;
      caeExpiration?: string;
      currency?: string;
    }>,
    batchId: number
  ): Promise<ExpectedInvoice[]> {
    const created: ExpectedInvoice[] = [];

    for (const invoice of invoices) {
      try {
        const result = await db
          .insert(expectedInvoices)
          .values({
            importBatchId: batchId,
            cuit: invoice.cuit,
            emitterName: invoice.emitterName || null,
            issueDate: invoice.issueDate,
            invoiceType: invoice.invoiceType,
            pointOfSale: invoice.pointOfSale,
            invoiceNumber: invoice.invoiceNumber,
            total: invoice.total || null,
            cae: invoice.cae || null,
            caeExpiration: invoice.caeExpiration || null,
            currency: invoice.currency || 'ARS',
            status: 'pending' as any,
          })
          .returning();

        if (result.length > 0) {
          created.push(this.mapDrizzleToExpectedInvoice(result[0]));
        }
      } catch (error) {
        console.warn(
          `Factura duplicada: ${invoice.invoiceType}-${invoice.pointOfSale}-${invoice.invoiceNumber}`,
          error
        );
      }
    }

    return created;
  }

  async findById(id: number): Promise<ExpectedInvoice | null> {
    const result = await db.select().from(expectedInvoices).where(eq(expectedInvoices.id, id));

    return result.length > 0 ? this.mapDrizzleToExpectedInvoice(result[0]) : null;
  }

  async findCandidates(criteria: {
    cuit: string;
    dateRange?: [string, string];
    totalRange?: [number, number];
    status?: ExpectedInvoiceStatus[];
  }): Promise<ExpectedInvoice[]> {
    const conditions: any[] = [eq(expectedInvoices.cuit, criteria.cuit)];

    if (criteria.dateRange) {
      conditions.push(
        and(
          gte(expectedInvoices.issueDate, criteria.dateRange[0]),
          lte(expectedInvoices.issueDate, criteria.dateRange[1])
        )
      );
    }

    if (criteria.totalRange) {
      conditions.push(
        and(
          gte(expectedInvoices.total, criteria.totalRange[0]),
          lte(expectedInvoices.total, criteria.totalRange[1])
        )
      );
    }

    if (!criteria.status || criteria.status.length === 0) {
      conditions.push(eq(expectedInvoices.status, 'pending' as any));
    } else {
      conditions.push(inArray(expectedInvoices.status, criteria.status as any));
    }

    const result = await db
      .select()
      .from(expectedInvoices)
      .where(and(...conditions))
      .orderBy(desc(expectedInvoices.issueDate));

    return result.map((row) => this.mapDrizzleToExpectedInvoice(row));
  }

  async listWithFiles(filters?: {
    status?: ExpectedInvoiceStatus | ExpectedInvoiceStatus[];
    batchId?: number;
    cuit?: string;
    limit?: number;
    offset?: number;
  }): Promise<ExpectedInvoiceWithFile[]> {
    const conditions: any[] = [];

    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(inArray(expectedInvoices.status, filters.status as any));
      } else {
        conditions.push(eq(expectedInvoices.status, filters.status as any));
      }
    }

    if (filters?.batchId) {
      conditions.push(eq(expectedInvoices.importBatchId, filters.batchId));
    }

    if (filters?.cuit) {
      conditions.push(eq(expectedInvoices.cuit, filters.cuit));
    }

    // Build query step by step to avoid type issues with leftJoin
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let query: any = db
      .select({
        expectedInvoice: expectedInvoices,
        filePath: pendingFiles.filePath,
      })
      .from(expectedInvoices)
      .leftJoin(pendingFiles, eq(pendingFiles.id, expectedInvoices.matchedPendingFileId));

    if (whereClause) {
      query = db
        .select({
          expectedInvoice: expectedInvoices,
          filePath: pendingFiles.filePath,
        })
        .from(expectedInvoices)
        .leftJoin(pendingFiles, eq(pendingFiles.id, expectedInvoices.matchedPendingFileId))
        .where(whereClause);
    }

    // Execute the query and apply post-query operations
    const result = await (query as any);
    let filtered = result as any[];

    // Sort
    filtered.sort(
      (a, b) =>
        new Date(b.expectedInvoice.issueDate).getTime() -
        new Date(a.expectedInvoice.issueDate).getTime()
    );

    // Apply limit and offset manually since Drizzle can't chain them with leftJoin
    if (filters?.offset) {
      filtered = filtered.slice(filters.offset);
    }

    if (filters?.limit) {
      filtered = filtered.slice(0, filters.limit);
    }

    return filtered.map((row) => ({
      ...this.mapDrizzleToExpectedInvoice(row.expectedInvoice),
      filePath: row.filePath || null,
    }));
  }

  async findExactMatch(
    cuit: string,
    type: string,
    pointOfSale: number,
    invoiceNumber: number
  ): Promise<ExpectedInvoice | null> {
    const result = await db
      .select()
      .from(expectedInvoices)
      .where(
        and(
          eq(expectedInvoices.cuit, cuit),
          eq(expectedInvoices.invoiceType, type),
          eq(expectedInvoices.pointOfSale, pointOfSale),
          eq(expectedInvoices.invoiceNumber, invoiceNumber),
          eq(expectedInvoices.status, 'pending' as any)
        )
      );

    return result.length > 0 ? this.mapDrizzleToExpectedInvoice(result[0]) : null;
  }

  async findPartialMatches(criteria: {
    cuit?: string;
    invoiceType?: string;
    pointOfSale?: number;
    invoiceNumber?: number;
    issueDate?: string;
    total?: number;
    limit?: number;
  }): Promise<
    Array<
      ExpectedInvoice & { matchScore: number; matchedFields: string[]; totalFieldsCompared: number }
    >
  > {
    const conditions: any[] = [eq(expectedInvoices.status, 'pending' as any)];

    if (criteria.cuit) {
      conditions.push(eq(expectedInvoices.cuit, criteria.cuit));
    } else if (criteria.invoiceNumber !== undefined || criteria.pointOfSale !== undefined) {
      if (criteria.invoiceNumber !== undefined) {
        conditions.push(eq(expectedInvoices.invoiceNumber, criteria.invoiceNumber));
      }
      if (criteria.pointOfSale !== undefined) {
        conditions.push(eq(expectedInvoices.pointOfSale, criteria.pointOfSale));
      }
    }

    const result = await db
      .select()
      .from(expectedInvoices)
      .where(and(...conditions))
      .orderBy(desc(expectedInvoices.issueDate))
      .limit(criteria.limit || 20);

    return result
      .map((row) => {
        const invoice = this.mapDrizzleToExpectedInvoice(row);
        const matchedFields: string[] = [];
        let fieldsCompared = 0;

        if (criteria.cuit !== undefined) {
          fieldsCompared++;
          if (invoice.cuit === criteria.cuit) {
            matchedFields.push('cuit');
          }
        }

        if (criteria.invoiceType !== undefined) {
          fieldsCompared++;
          if (invoice.invoiceType === criteria.invoiceType) {
            matchedFields.push('invoiceType');
          }
        }

        if (criteria.pointOfSale !== undefined) {
          fieldsCompared++;
          if (invoice.pointOfSale === criteria.pointOfSale) {
            matchedFields.push('pointOfSale');
          }
        }

        if (criteria.invoiceNumber !== undefined) {
          fieldsCompared++;
          if (invoice.invoiceNumber === criteria.invoiceNumber) {
            matchedFields.push('invoiceNumber');
          }
        }

        if (criteria.issueDate !== undefined) {
          fieldsCompared++;
          if (invoice.issueDate === criteria.issueDate) {
            matchedFields.push('issueDate');
          }
        }

        if (criteria.total !== undefined && invoice.total !== null) {
          fieldsCompared++;
          const tolerance = criteria.total * 0.01;
          if (Math.abs(invoice.total - criteria.total) <= tolerance) {
            matchedFields.push('total');
          }
        }

        const matchScore =
          fieldsCompared > 0 ? Math.round((matchedFields.length / fieldsCompared) * 100) : 0;

        return {
          ...invoice,
          matchScore,
          matchedFields,
          totalFieldsCompared: fieldsCompared,
        };
      })
      .sort((a, b) => b.matchScore - a.matchScore);
  }

  async list(filters?: {
    status?: ExpectedInvoiceStatus | ExpectedInvoiceStatus[];
    batchId?: number;
    cuit?: string;
    limit?: number;
    offset?: number;
  }): Promise<ExpectedInvoice[]> {
    const conditions: any[] = [];

    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(inArray(expectedInvoices.status, filters.status as any));
      } else {
        conditions.push(eq(expectedInvoices.status, filters.status as any));
      }
    }

    if (filters?.batchId) {
      conditions.push(eq(expectedInvoices.importBatchId, filters.batchId));
    }

    if (filters?.cuit) {
      conditions.push(eq(expectedInvoices.cuit, filters.cuit));
    }

    let query: any;

    if (conditions.length > 0) {
      query = await db
        .select()
        .from(expectedInvoices)
        .where(and(...conditions));
    } else {
      query = await db.select().from(expectedInvoices);
    }

    // Sort
    let result = (query as any[]).sort(
      (a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime()
    );

    // Apply offset
    if (filters?.offset) {
      result = result.slice(filters.offset);
    }

    // Apply limit
    if (filters?.limit) {
      result = result.slice(0, filters.limit);
    }

    return result.map((row) => this.mapDrizzleToExpectedInvoice(row));
  }

  async markAsMatched(
    id: number,
    pendingFileId: number,
    confidence: number
  ): Promise<ExpectedInvoice> {
    const result = await db
      .update(expectedInvoices)
      .set({
        status: 'matched' as any,
        matchedPendingFileId: pendingFileId,
        matchConfidence: confidence,
      })
      .where(eq(expectedInvoices.id, id))
      .returning();

    if (result.length === 0) {
      throw new Error('Expected invoice not found after marking as matched');
    }

    return this.mapDrizzleToExpectedInvoice(result[0]);
  }

  async markAsManual(id: number, notes?: string): Promise<ExpectedInvoice> {
    const result = await db
      .update(expectedInvoices)
      .set({ status: 'manual' as any, notes: notes || null })
      .where(eq(expectedInvoices.id, id))
      .returning();

    if (result.length === 0) {
      throw new Error('Expected invoice not found after marking as manual');
    }

    return this.mapDrizzleToExpectedInvoice(result[0]);
  }

  async markAsIgnored(id: number, notes?: string): Promise<ExpectedInvoice> {
    const result = await db
      .update(expectedInvoices)
      .set({ status: 'ignored' as any, notes: notes || null })
      .where(eq(expectedInvoices.id, id))
      .returning();

    if (result.length === 0) {
      throw new Error('Expected invoice not found after marking as ignored');
    }

    return this.mapDrizzleToExpectedInvoice(result[0]);
  }

  async countByStatus(batchId?: number): Promise<Record<ExpectedInvoiceStatus, number>> {
    const result = await db
      .select({ status: expectedInvoices.status })
      .from(expectedInvoices)
      .where(batchId ? eq(expectedInvoices.importBatchId, batchId) : undefined);

    const counts: Record<ExpectedInvoiceStatus, number> = {
      pending: 0,
      matched: 0,
      discrepancy: 0,
      manual: 0,
      ignored: 0,
    };

    for (const row of result) {
      const status = row.status as ExpectedInvoiceStatus;
      counts[status]++;
    }

    return counts;
  }

  async listPending(limit?: number): Promise<ExpectedInvoice[]> {
    return this.list({ status: 'pending', limit });
  }
}
