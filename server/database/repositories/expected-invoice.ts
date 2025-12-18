/**
 * Repository para la gestión de facturas esperadas (Drizzle ORM)
 */

import { eq, inArray, and, desc, gte, lte, isNull, like, SQL } from 'drizzle-orm';
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
  invoiceType: number | null; // Código ARCA numérico (1, 6, 11, etc.)
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
    const updates: Record<string, number | string> = {};
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
      invoiceType: number; // Código ARCA numérico
      pointOfSale: number;
      invoiceNumber: number;
      total?: number;
      cae?: string;
      caeExpiration?: string;
      currency?: string;
    }>,
    batchId: number
  ): Promise<{
    created: ExpectedInvoice[];
    updated: ExpectedInvoice[];
    unchanged: ExpectedInvoice[];
  }> {
    const created: ExpectedInvoice[] = [];
    const updated: ExpectedInvoice[] = [];
    const unchanged: ExpectedInvoice[] = [];

    for (const invoice of invoices) {
      try {
        // Buscar duplicado según reglas de AFIP
        const duplicate = await this.findDuplicate({
          cuit: invoice.cuit,
          cae: invoice.cae,
          invoiceType: invoice.invoiceType,
          pointOfSale: invoice.pointOfSale,
          invoiceNumber: invoice.invoiceNumber,
        });

        if (duplicate) {
          // Ya existe - verificar si hay datos nuevos para actualizar
          const hasChanges =
            (invoice.emitterName && invoice.emitterName !== duplicate.emitterName) ||
            (invoice.total !== undefined &&
              invoice.total !== null &&
              invoice.total !== duplicate.total) ||
            (invoice.cae && invoice.cae !== duplicate.cae) ||
            (invoice.caeExpiration && invoice.caeExpiration !== duplicate.caeExpiration) ||
            (invoice.currency && invoice.currency !== duplicate.currency);

          if (hasChanges) {
            // Actualizar solo los campos que son diferentes
            const updatedInvoice = await this.updateInvoice(duplicate.id, {
              emitterName: invoice.emitterName || duplicate.emitterName || undefined,
              total: invoice.total !== undefined ? invoice.total : duplicate.total || undefined,
              cae: invoice.cae || duplicate.cae || undefined,
              caeExpiration: invoice.caeExpiration || duplicate.caeExpiration || undefined,
              currency: invoice.currency || duplicate.currency || undefined,
            });
            updated.push(updatedInvoice);
          } else {
            // No hay cambios, es idéntico
            unchanged.push(duplicate);
          }
        } else {
          // No existe - crear nuevo
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
              status: 'pending',
            })
            .returning();

          if (result.length > 0) {
            created.push(this.mapDrizzleToExpectedInvoice(result[0]));
          }
        }
      } catch (error) {
        console.error(
          `Error procesando factura: ${invoice.invoiceType}-${invoice.pointOfSale}-${invoice.invoiceNumber}`,
          error
        );
      }
    }

    return { created, updated, unchanged };
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      conditions.push(eq(expectedInvoices.status, 'pending'));
    } else {
      conditions.push(inArray(expectedInvoices.status, criteria.status));
    }

    const result = await db
      .select()
      .from(expectedInvoices)
      .where(and(...(conditions as Parameters<typeof and>)))
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
    // eslint-disable-next-line @typescript-eslint/no-duplicate-type-constituents
    const conditions: (ReturnType<typeof eq> | ReturnType<typeof inArray>)[] = [];

    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(inArray(expectedInvoices.status, filters.status));
      } else {
        conditions.push(eq(expectedInvoices.status, filters.status));
      }
    }

    if (filters?.batchId) {
      conditions.push(eq(expectedInvoices.importBatchId, filters.batchId));
    }

    if (filters?.cuit) {
      conditions.push(eq(expectedInvoices.cuit, filters.cuit));
    }

    // Build query step by step to avoid type issues with leftJoin
    const whereClause =
      conditions.length > 0 ? and(...(conditions as Parameters<typeof and>)) : undefined;

    let query = db
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
        .where(whereClause) as typeof query;
    }

    // Execute the query and apply post-query operations
    const result = await query;
    let filtered = result;

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
    type: number | null,
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
          eq(expectedInvoices.status, 'pending')
        )
      );

    return result.length > 0 ? this.mapDrizzleToExpectedInvoice(result[0]) : null;
  }

  /**
   * Busca duplicados según las reglas de AFIP:
   * - Si existe CAE: busca por emisor (CUIT) + CAE
   * - Si NO existe CAE: busca por emisor + tipo + sucursal + numero
   */
  async findDuplicate(invoice: {
    cuit: string;
    cae?: string;
    invoiceType: number; // Código ARCA numérico
    pointOfSale: number;
    invoiceNumber: number;
  }): Promise<ExpectedInvoice | null> {
    let result;

    if (invoice.cae) {
      // Búsqueda por CUIT + CAE (clave única)
      result = await db
        .select()
        .from(expectedInvoices)
        .where(and(eq(expectedInvoices.cuit, invoice.cuit), eq(expectedInvoices.cae, invoice.cae)));
    } else {
      // Búsqueda por CUIT + tipo + sucursal + numero
      result = await db
        .select()
        .from(expectedInvoices)
        .where(
          and(
            eq(expectedInvoices.cuit, invoice.cuit),
            eq(expectedInvoices.invoiceType, invoice.invoiceType),
            eq(expectedInvoices.pointOfSale, invoice.pointOfSale),
            eq(expectedInvoices.invoiceNumber, invoice.invoiceNumber)
          )
        );
    }

    return result.length > 0 ? this.mapDrizzleToExpectedInvoice(result[0]) : null;
  }

  /**
   * Actualiza un registro existente con nuevos datos (solo campos no-clave)
   */
  async updateInvoice(
    id: number,
    data: {
      emitterName?: string;
      total?: number;
      cae?: string;
      caeExpiration?: string;
      currency?: string;
      notes?: string;
    }
  ): Promise<ExpectedInvoice> {
    const updates: Record<string, string | number | null> = {};

    if (data.emitterName !== undefined) updates.emitterName = data.emitterName;
    if (data.total !== undefined) updates.total = data.total;
    if (data.cae !== undefined) updates.cae = data.cae;
    if (data.caeExpiration !== undefined) updates.caeExpiration = data.caeExpiration;
    if (data.currency !== undefined) updates.currency = data.currency;
    if (data.notes !== undefined) updates.notes = data.notes;

    if (Object.keys(updates).length === 0) {
      const found = await this.findById(id);
      if (!found) throw new Error('Expected invoice not found');
      return found;
    }

    const result = await db
      .update(expectedInvoices)
      .set(updates)
      .where(eq(expectedInvoices.id, id))
      .returning();

    if (result.length === 0) {
      throw new Error('Expected invoice not found after update');
    }

    return this.mapDrizzleToExpectedInvoice(result[0]);
  }

  async findPartialMatches(criteria: {
    cuit?: string;
    cuitPartial?: string; // middle-8 digits or any stable core segment
    invoiceType?: number | null; // Código ARCA numérico
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
    // Prefiltrar inteligentemente para no perder candidatos por el límite
    const conditions: (SQL | undefined)[] = [
      eq(expectedInvoices.status, 'pending'),
      isNull(expectedInvoices.matchedPendingFileId),
    ];

    // Aplicar SOLO prefilter de CUIT si disponible (más laxo)
    if (criteria.cuit) {
      conditions.push(eq(expectedInvoices.cuit, criteria.cuit));
    } else if (criteria.cuitPartial) {
      conditions.push(like(expectedInvoices.cuit, `%${criteria.cuitPartial}%`));
    }

    // NO filtrar por tipo, punto de venta, ni número en SQL
    // Así incluimos TODAS las facturas sin asignar de ese CUIT (o todas si no hay CUIT)

    const result = await db
      .select()
      .from(expectedInvoices)
      .where(and(...conditions.filter((c): c is SQL => c !== undefined)))
      .orderBy(desc(expectedInvoices.issueDate))
      .limit(Math.max(criteria.limit || 10, 100)); // aumentar límite para incluir más fallbacks

    return result
      .map((row) => {
        const invoice = this.mapDrizzleToExpectedInvoice(row);
        const matchedFields: string[] = [];
        let fieldsCompared = 0;
        let totalScore = 0; // Para scoring ponderado

        // Helpers de normalización de CUIT
        const onlyDigits = (v?: string | null): string => (v ? v.replace(/\D/g, '') : '');
        const middle8 = (digits: string): string =>
          digits.length >= 11 ? digits.slice(2, 10) : '';

        if (criteria.cuit !== undefined || criteria.cuitPartial !== undefined) {
          fieldsCompared++;
          const invDigits = onlyDigits(invoice.cuit);
          const critDigits = onlyDigits(criteria.cuit);
          const critMiddle = criteria.cuitPartial || middle8(critDigits);

          if (invDigits && critDigits && invDigits === critDigits) {
            matchedFields.push('cuit');
            totalScore += 100; // CUIT exacto
          } else if (invDigits && critMiddle && middle8(invDigits) === critMiddle) {
            matchedFields.push('cuit~8');
            totalScore += 70; // match parcial por 8 del medio
          }
        }

        if (criteria.invoiceType !== undefined) {
          fieldsCompared++;
          if (invoice.invoiceType === criteria.invoiceType) {
            matchedFields.push('invoiceType');
            totalScore += 100;
          }
        }

        if (criteria.pointOfSale !== undefined) {
          fieldsCompared++;
          if (invoice.pointOfSale === criteria.pointOfSale) {
            matchedFields.push('pointOfSale');
            totalScore += 100;
          }
        }

        if (criteria.invoiceNumber !== undefined) {
          fieldsCompared++;
          if (invoice.invoiceNumber === criteria.invoiceNumber) {
            matchedFields.push('invoiceNumber');
            totalScore += 100;
          } else {
            // Números cercanos también suman (rango ±10)
            const diff = Math.abs(invoice.invoiceNumber - criteria.invoiceNumber);
            if (diff <= 10) {
              const proximityScore = Math.max(0, 100 - diff * 10); // -10% por cada número de diferencia
              matchedFields.push('invoiceNumber~');
              totalScore += proximityScore;
            }
          }
        }

        if (criteria.issueDate !== undefined) {
          fieldsCompared++;
          if (invoice.issueDate === criteria.issueDate) {
            matchedFields.push('issueDate');
            totalScore += 100;
          }
        }

        if (criteria.total !== undefined && invoice.total !== null) {
          fieldsCompared++;
          const tolerance = Math.max(criteria.total * 0.05, 10); // 5% o $10 mínimo
          const diff = Math.abs(invoice.total - criteria.total);
          if (diff <= tolerance) {
            matchedFields.push('total');
            totalScore += 100;
          } else if (diff <= tolerance * 3) {
            // Total cercano suma parcial
            const proximityScore = Math.max(0, 100 - (diff / tolerance) * 20);
            matchedFields.push('total~');
            totalScore += proximityScore;
          }
        }

        const matchScore = fieldsCompared > 0 ? Math.round(totalScore / fieldsCompared) : 0;

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
    const conditions: ReturnType<typeof eq | typeof inArray>[] = [];

    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(inArray(expectedInvoices.status, filters.status));
      } else {
        conditions.push(eq(expectedInvoices.status, filters.status));
      }
    }

    if (filters?.batchId) {
      conditions.push(eq(expectedInvoices.importBatchId, filters.batchId));
    }

    if (filters?.cuit) {
      conditions.push(eq(expectedInvoices.cuit, filters.cuit));
    }

    let query;

    if (conditions.length > 0) {
      query = await db
        .select()
        .from(expectedInvoices)
        .where(and(...conditions));
    } else {
      query = await db.select().from(expectedInvoices);
    }

    // Sort
    let result = query.sort(
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
        status: 'matched',
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
      .set({ status: 'manual', notes: notes || null })
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
      .set({ status: 'ignored', notes: notes || null })
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
