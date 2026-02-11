/**
 * Repository para la tabla file_extraction_results
 * Gestiona resultados de extracción OCR/PDF de archivos
 */

import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../db.js';
import {
  fileExtractionResults,
  type FileExtractionResult,
  type NewFileExtractionResult,
} from '../schema.js';

export interface IFileExtractionRepository {
  create(data: Omit<NewFileExtractionResult, 'id' | 'extractedAt'>): FileExtractionResult;
  findByFileId(fileId: number): FileExtractionResult | null;
  findAllByFileId(fileId: number): FileExtractionResult[];
  findByFileIdAndMethod(fileId: number, method: string): FileExtractionResult | null;
  upsertByMethod(
    fileId: number,
    method: string,
    data: Omit<NewFileExtractionResult, 'id' | 'fileId' | 'method' | 'extractedAt'>
  ): FileExtractionResult;
  update(
    id: number,
    data: Partial<Omit<NewFileExtractionResult, 'id' | 'fileId' | 'extractedAt'>>
  ): void;
  delete(id: number): void;
}

export class FileExtractionRepository implements IFileExtractionRepository {
  /**
   * Crea un nuevo resultado de extracción
   */
  create(data: Omit<NewFileExtractionResult, 'id' | 'extractedAt'>): FileExtractionResult {
    const result = getDb()
      .insert(fileExtractionResults)
      .values({
        ...data,
        extractedAt: new Date().toISOString(),
      })
      .returning()
      .get();

    return result;
  }

  /**
   * Busca resultado de extracción por ID de archivo
   * Returns the most recent extraction for backward compatibility
   */
  findByFileId(fileId: number): FileExtractionResult | null {
    const result = getDb()
      .select()
      .from(fileExtractionResults)
      .where(eq(fileExtractionResults.fileId, fileId))
      .orderBy(desc(fileExtractionResults.extractedAt))
      .get();

    return result ?? null;
  }

  /**
   * Returns all extractions for a file, ordered by extractedAt DESC
   */
  findAllByFileId(fileId: number): FileExtractionResult[] {
    return getDb()
      .select()
      .from(fileExtractionResults)
      .where(eq(fileExtractionResults.fileId, fileId))
      .orderBy(desc(fileExtractionResults.extractedAt))
      .all();
  }

  /**
   * Finds extraction by file ID and method
   */
  findByFileIdAndMethod(fileId: number, method: string): FileExtractionResult | null {
    const result = getDb()
      .select()
      .from(fileExtractionResults)
      .where(
        and(eq(fileExtractionResults.fileId, fileId), eq(fileExtractionResults.method, method))
      )
      .get();

    return result ?? null;
  }

  /**
   * Creates or updates extraction by (fileId, method)
   * - If extraction for this method exists: updates it
   * - If not: creates new extraction
   */
  upsertByMethod(
    fileId: number,
    method: string,
    data: Omit<NewFileExtractionResult, 'id' | 'fileId' | 'method' | 'extractedAt'>
  ): FileExtractionResult {
    const existing = this.findByFileIdAndMethod(fileId, method);

    if (existing) {
      getDb()
        .update(fileExtractionResults)
        .set({
          ...data,
          extractedAt: new Date().toISOString(),
        })
        .where(eq(fileExtractionResults.id, existing.id))
        .run();

      return this.findByFileIdAndMethod(fileId, method)!;
    }

    return this.create({
      fileId,
      method,
      ...data,
    });
  }

  /**
   * Actualiza un resultado de extracción existente
   */
  update(
    id: number,
    data: Partial<Omit<NewFileExtractionResult, 'id' | 'fileId' | 'extractedAt'>>
  ): void {
    getDb().update(fileExtractionResults).set(data).where(eq(fileExtractionResults.id, id)).run();
  }

  /**
   * Elimina un resultado de extracción
   */
  delete(id: number): void {
    getDb().delete(fileExtractionResults).where(eq(fileExtractionResults.id, id)).run();
  }
}
