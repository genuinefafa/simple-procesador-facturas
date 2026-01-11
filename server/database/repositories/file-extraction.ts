/**
 * Repository para la tabla file_extraction_results
 * Gestiona resultados de extracción OCR/PDF de archivos
 */

import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import {
  fileExtractionResults,
  type FileExtractionResult,
  type NewFileExtractionResult,
} from '../schema.js';

export interface FileExtractionRepository {
  create(data: Omit<NewFileExtractionResult, 'id' | 'extractedAt'>): FileExtractionResult;
  findByFileId(fileId: number): FileExtractionResult | null;
  update(
    id: number,
    data: Partial<Omit<NewFileExtractionResult, 'id' | 'fileId' | 'extractedAt'>>
  ): void;
  delete(id: number): void;
}

export class FileExtractionRepository implements FileExtractionRepository {
  /**
   * Crea un nuevo resultado de extracción
   */
  create(data: Omit<NewFileExtractionResult, 'id' | 'extractedAt'>): FileExtractionResult {
    const result = db
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
   */
  findByFileId(fileId: number): FileExtractionResult | null {
    const result = db
      .select()
      .from(fileExtractionResults)
      .where(eq(fileExtractionResults.fileId, fileId))
      .get();

    return result ?? null;
  }

  /**
   * Actualiza un resultado de extracción existente
   */
  update(
    id: number,
    data: Partial<Omit<NewFileExtractionResult, 'id' | 'fileId' | 'extractedAt'>>
  ): void {
    db.update(fileExtractionResults).set(data).where(eq(fileExtractionResults.id, id)).run();
  }

  /**
   * Elimina un resultado de extracción
   */
  delete(id: number): void {
    db.delete(fileExtractionResults).where(eq(fileExtractionResults.id, id)).run();
  }
}
