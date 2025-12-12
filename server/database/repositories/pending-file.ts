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
  uploadDate: string;
  extractedCuit: string | null;
  extractedDate: string | null;
  extractedTotal: number | null;
  extractedType: string | null;
  extractedPointOfSale: number | null;
  extractedInvoiceNumber: number | null;
  extractionConfidence: number | null;
  extractionMethod: string | null;
  extractionErrors: string | null;
  status: PendingFileStatus;
  invoiceId: number | null;
  createdAt: string;
  updatedAt: string;
}

export class PendingFileRepository {
  private mapDrizzleToPendingFile(row: DrizzelPendingFile): PendingFile {
    return {
      id: row.id,
      originalFilename: row.nombreArchivoOriginal,
      filePath: row.rutaArchivo,
      fileSize: row.tamanoArchivo,
      uploadDate: row.fechaCarga,
      extractedCuit: row.cuitExtraido,
      extractedDate: row.fechaExtraida,
      extractedTotal: row.totalExtraido,
      extractedType: row.tipoExtraido,
      extractedPointOfSale: row.puntoVentaExtraido,
      extractedInvoiceNumber: row.numeroComprobanteExtraido,
      extractionConfidence: row.confianzaExtraccion,
      extractionMethod: row.metodoExtraccion,
      extractionErrors: row.erroresExtraccion,
      status: (row.estado as PendingFileStatus) || 'pending',
      invoiceId: row.facturaId,
      createdAt: row.creadoEn,
      updatedAt: row.actualizadoEn,
    };
  }

  async create(data: {
    originalFilename: string;
    filePath: string;
    fileSize?: number;
    extractedCuit?: string;
    extractedDate?: string;
    extractedTotal?: number;
    extractedType?: string;
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
        nombreArchivoOriginal: data.originalFilename,
        rutaArchivo: data.filePath,
        tamanoArchivo: data.fileSize || null,
        cuitExtraido: data.extractedCuit || null,
        fechaExtraida: data.extractedDate || null,
        totalExtraido: data.extractedTotal || null,
        tipoExtraido: data.extractedType || null,
        puntoVentaExtraido: data.extractedPointOfSale || null,
        numeroComprobanteExtraido: data.extractedInvoiceNumber || null,
        confianzaExtraccion: data.extractionConfidence || null,
        metodoExtraccion: data.extractionMethod || null,
        erroresExtraccion: errorsJson,
        estado: (data.status || 'pending') as any,
      })
      .returning();

    if (!result || result.length === 0) {
      throw new Error('Failed to create pending file');
    }

    return this.mapDrizzleToPendingFile(result[0]);
  }

  async findById(id: number): Promise<PendingFile | null> {
    const result = await db.select().from(pendingFiles).where(eq(pendingFiles.id, id)).limit(1);
    return result.length > 0 ? this.mapDrizzleToPendingFile(result[0]) : null;
  }

  async list(filters?: {
    status?: PendingFileStatus | PendingFileStatus[];
    limit?: number;
    offset?: number;
  }): Promise<PendingFile[]> {
    let query = db.select().from(pendingFiles);

    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        query = query.where(inArray(pendingFiles.estado, filters.status as any));
      } else {
        query = query.where(eq(pendingFiles.estado, filters.status as any));
      }
    }

    query = query.orderBy(desc(pendingFiles.fechaCarga));

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    if (filters?.offset) {
      query = query.offset(filters.offset);
    }

    const result = await query;
    return result.map((row) => this.mapDrizzleToPendingFile(row));
  }

  async updateExtractedData(
    id: number,
    data: {
      extractedCuit?: string;
      extractedDate?: string;
      extractedTotal?: number;
      extractedType?: string;
      extractedPointOfSale?: number;
      extractedInvoiceNumber?: number;
      extractionConfidence?: number;
      extractionMethod?: string;
      extractionErrors?: string | string[];
    }
  ): Promise<PendingFile> {
    const updates: any = {};

    if (data.extractedCuit !== undefined) updates.cuitExtraido = data.extractedCuit;
    if (data.extractedDate !== undefined) updates.fechaExtraida = data.extractedDate;
    if (data.extractedTotal !== undefined) updates.totalExtraido = data.extractedTotal;
    if (data.extractedType !== undefined) updates.tipoExtraido = data.extractedType;
    if (data.extractedPointOfSale !== undefined)
      updates.puntoVentaExtraido = data.extractedPointOfSale;
    if (data.extractedInvoiceNumber !== undefined)
      updates.numeroComprobanteExtraido = data.extractedInvoiceNumber;
    if (data.extractionConfidence !== undefined)
      updates.confianzaExtraccion = data.extractionConfidence;
    if (data.extractionMethod !== undefined) updates.metodoExtraccion = data.extractionMethod;

    if (data.extractionErrors !== undefined) {
      const errorsJson = Array.isArray(data.extractionErrors)
        ? JSON.stringify(data.extractionErrors)
        : data.extractionErrors;
      updates.erroresExtraccion = errorsJson;
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
      .set({ estado: status as any })
      .where(eq(pendingFiles.id, id))
      .returning();

    if (result.length === 0) {
      throw new Error('Pending file not found after status update');
    }

    return this.mapDrizzleToPendingFile(result[0]);
  }

  async linkToInvoice(id: number, invoiceId: number): Promise<PendingFile> {
    const result = await db
      .update(pendingFiles)
      .set({ facturaId: invoiceId, estado: 'processed' as any })
      .where(eq(pendingFiles.id, id))
      .returning();

    if (result.length === 0) {
      throw new Error('Pending file not found after linking');
    }

    return this.mapDrizzleToPendingFile(result[0]);
  }

  async delete(id: number): Promise<boolean> {
    const result = await db.delete(pendingFiles).where(eq(pendingFiles.id, id));

    return !!result;
  }

  async countByStatus(): Promise<Record<PendingFileStatus, number>> {
    const result = await db.select({ status: pendingFiles.estado }).from(pendingFiles);

    const counts: Record<PendingFileStatus, number> = {
      pending: 0,
      reviewing: 0,
      processed: 0,
      failed: 0,
    };

    for (const row of result) {
      const status = row.status as PendingFileStatus;
      counts[status]++;
    }

    return counts;
  }
}
