/**
 * Repository para la gestión de archivos pendientes (Drizzle ORM)
 */

import { eq, inArray, desc } from 'drizzle-orm';
import { db } from '../db';
import { pendingFiles, type PendingFile as DrizzelPendingFile } from '../schema';

export type PendingFileStatus = 'pending' | 'reviewing' | 'processed' | 'failed';

export interface PendingFile {
  id: number;
  originalFilename: string;
  filePath: string;
  fileSize: number | null;
  uploadDate: string | null;
  extractedCuit: string | null;
  extractedDate: string | null;
  extractedTotal: number | null;
  extractedType: number | null; // Código ARCA numérico (1, 6, 11, etc.)
  extractedPointOfSale: number | null;
  extractedInvoiceNumber: number | null;
  extractionConfidence: number | null;
  extractionMethod: string | null;
  extractionErrors: string | null;
  status: PendingFileStatus;
  createdAt: string | null;
  updatedAt: string | null;
}

export class PendingFileRepository {
  private mapDrizzleToPendingFile(row: DrizzelPendingFile | undefined): PendingFile {
    if (!row) {
      throw new Error('Cannot map undefined row to PendingFile');
    }
    return {
      id: row.id,
      originalFilename: row.originalFilename,
      filePath: row.filePath,
      fileSize: row.fileSize || null,
      uploadDate: row.uploadDate || null,
      extractedCuit: row.extractedCuit || null,
      extractedDate: row.extractedDate || null,
      extractedTotal: row.extractedTotal || null,
      extractedType: row.extractedType || null,
      extractedPointOfSale: row.extractedPointOfSale || null,
      extractedInvoiceNumber: row.extractedInvoiceNumber || null,
      extractionConfidence: row.extractionConfidence || null,
      extractionMethod: row.extractionMethod || null,
      extractionErrors: row.extractionErrors || null,
      status: (row.status as PendingFileStatus) || 'pending',
      createdAt: row.createdAt || null,
      updatedAt: row.updatedAt || null,
    };
  }

  async create(data: {
    originalFilename: string;
    filePath: string;
    fileSize?: number;
    extractedCuit?: string;
    extractedDate?: string;
    extractedTotal?: number;
    extractedType?: number | null; // Código ARCA numérico
    extractedPointOfSale?: number;
    extractedInvoiceNumber?: number;
    extractionConfidence?: number;
    extractionMethod?: string;
    extractionErrors?: string | string[];
    status?: PendingFileStatus;
  }): Promise<PendingFile> {
    const errorsJson =
      data.extractionErrors && Array.isArray(data.extractionErrors)
        ? JSON.stringify(data.extractionErrors)
        : data.extractionErrors || null;

    const result = await db
      .insert(pendingFiles)
      .values({
        originalFilename: data.originalFilename,
        filePath: data.filePath,
        fileSize: data.fileSize || null,
        extractedCuit: data.extractedCuit || null,
        extractedDate: data.extractedDate || null,
        extractedTotal: data.extractedTotal || null,
        extractedType: data.extractedType || null,
        extractedPointOfSale: data.extractedPointOfSale || null,
        extractedInvoiceNumber: data.extractedInvoiceNumber || null,
        extractionConfidence: data.extractionConfidence || null,
        extractionMethod: data.extractionMethod || null,
        extractionErrors: errorsJson,
        status: data.status || 'pending',
      })
      .returning();

    if (!result || result.length === 0) {
      throw new Error('Failed to create pending file');
    }

    return this.mapDrizzleToPendingFile(result[0]);
  }

  async findById(id: number): Promise<PendingFile | null> {
    const result = await db.select().from(pendingFiles).where(eq(pendingFiles.id, id));

    return result.length > 0 ? this.mapDrizzleToPendingFile(result[0]) : null;
  }

  async list(filters?: {
    status?: PendingFileStatus | PendingFileStatus[];
    limit?: number;
    offset?: number;
  }): Promise<PendingFile[]> {
    const queryAux = db.select().from(pendingFiles);

    function createQuery(): typeof queryAux {
      if (filters?.status) {
        if (Array.isArray(filters.status)) {
          return queryAux.where(inArray(pendingFiles.status, filters.status)) as typeof queryAux;
        } else {
          return queryAux.where(eq(pendingFiles.status, filters.status)) as typeof queryAux;
        }
      }
      return queryAux;
    }

    const allResults = await createQuery().orderBy(desc(pendingFiles.uploadDate));

    let result = allResults;

    if (filters?.offset) {
      result = result.slice(filters.offset);
    }

    if (filters?.limit) {
      result = result.slice(0, filters.limit);
    }

    return result.map((row) => this.mapDrizzleToPendingFile(row));
  }

  async updateExtractedData(
    id: number,
    data: {
      extractedCuit?: string;
      extractedDate?: string;
      extractedTotal?: number;
      extractedType?: number | null; // Código ARCA numérico
      extractedPointOfSale?: number;
      extractedInvoiceNumber?: number;
      extractionConfidence?: number;
      extractionMethod?: string;
      extractionErrors?: string | string[];
    }
  ): Promise<PendingFile> {
    const updates: Record<string, string | number | null> = {};

    if (data.extractedCuit !== undefined) updates.extractedCuit = data.extractedCuit;
    if (data.extractedDate !== undefined) updates.extractedDate = data.extractedDate;
    if (data.extractedTotal !== undefined) updates.extractedTotal = data.extractedTotal;
    if (data.extractedType !== undefined) updates.extractedType = data.extractedType;
    if (data.extractedPointOfSale !== undefined)
      updates.extractedPointOfSale = data.extractedPointOfSale;
    if (data.extractedInvoiceNumber !== undefined)
      updates.extractedInvoiceNumber = data.extractedInvoiceNumber;
    if (data.extractionConfidence !== undefined)
      updates.extractionConfidence = data.extractionConfidence;
    if (data.extractionMethod !== undefined) updates.extractionMethod = data.extractionMethod;

    if (data.extractionErrors !== undefined) {
      const errorsJson = Array.isArray(data.extractionErrors)
        ? JSON.stringify(data.extractionErrors)
        : data.extractionErrors;
      updates.extractionErrors = errorsJson;
    }

    if (Object.keys(updates).length === 0) {
      const found = await this.findById(id);
      if (!found) throw new Error('Pending file not found');
      return found;
    }

    const result = await db
      .update(pendingFiles)
      .set(updates)
      .where(eq(pendingFiles.id, id))
      .returning();

    if (result.length === 0) {
      throw new Error('Pending file not found after update');
    }

    return this.mapDrizzleToPendingFile(result[0]);
  }

  async updateStatus(id: number, status: PendingFileStatus): Promise<PendingFile> {
    const result = await db
      .update(pendingFiles)
      .set({ status: status })
      .where(eq(pendingFiles.id, id))
      .returning();

    if (result.length === 0) {
      throw new Error('Pending file not found after status update');
    }

    return this.mapDrizzleToPendingFile(result[0]);
  }

  async delete(id: number): Promise<boolean> {
    const result = await db.delete(pendingFiles).where(eq(pendingFiles.id, id));

    return !!result;
  }

  async countByStatus(): Promise<Record<PendingFileStatus, number>> {
    const result = await db.select({ status: pendingFiles.status }).from(pendingFiles);

    const counts: Record<PendingFileStatus, number> = {
      pending: 0,
      reviewing: 0,
      processed: 0,
      failed: 0,
    };

    for (const row of result) {
      const status = row.status as PendingFileStatus;
      if (status) counts[status]++;
    }

    return counts;
  }
}
