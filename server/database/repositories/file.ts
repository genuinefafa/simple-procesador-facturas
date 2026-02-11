/**
 * Repository para la tabla files
 * Gestiona archivos físicos subidos al sistema
 */

import { eq, desc } from 'drizzle-orm';
import { getDb } from '../db.js';
import { files, type File, type NewFile } from '../schema.js';

export interface IFileRepository {
  create(data: Omit<NewFile, 'id' | 'createdAt' | 'updatedAt'>): File;
  findById(id: number): File | null;
  findByHash(hash: string): File | null;
  updateStatus(id: number, status: 'uploaded' | 'processed'): void;
  updatePath(id: number, newPath: string): void;
  updateHash(id: number, hash: string): void;
  updateCategory(id: number, categoryId: number | null): void;
  getUploadedFiles(): File[];
  delete(id: number): void;
  list(params?: { limit?: number; status?: 'uploaded' | 'processed' }): File[];
}

export class FileRepository implements IFileRepository {
  /**
   * Crea un nuevo archivo
   */
  create(data: Omit<NewFile, 'id' | 'createdAt' | 'updatedAt'>): File {
    const result = getDb()
      .insert(files)
      .values({
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .returning()
      .get();

    return result;
  }

  /**
   * Busca un archivo por ID
   */
  findById(id: number): File | null {
    const result = getDb().select().from(files).where(eq(files.id, id)).get();

    return result ?? null;
  }

  /**
   * Busca un archivo por hash (para deduplicación)
   */
  findByHash(hash: string): File | null {
    const result = getDb().select().from(files).where(eq(files.fileHash, hash)).get();

    return result ?? null;
  }

  /**
   * Actualiza el estado de un archivo
   */
  updateStatus(id: number, status: 'uploaded' | 'processed'): void {
    getDb()
      .update(files)
      .set({
        status,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(files.id, id))
      .run();
  }

  /**
   * Actualiza la ruta de almacenamiento de un archivo
   */
  updatePath(id: number, newPath: string): void {
    getDb()
      .update(files)
      .set({
        storagePath: newPath,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(files.id, id))
      .run();
  }

  /**
   * Actualiza el hash de un archivo
   */
  updateHash(id: number, hash: string): void {
    getDb()
      .update(files)
      .set({
        fileHash: hash,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(files.id, id))
      .run();
  }

  /**
   * Actualiza la categoría de un archivo
   */
  updateCategory(id: number, categoryId: number | null): void {
    getDb()
      .update(files)
      .set({
        categoryId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(files.id, id))
      .run();
  }

  /**
   * Obtiene archivos en estado 'uploaded' (listos para procesar)
   */
  getUploadedFiles(): File[] {
    return getDb()
      .select()
      .from(files)
      .where(eq(files.status, 'uploaded'))
      .orderBy(desc(files.createdAt))
      .all();
  }

  /**
   * Lista archivos con filtros opcionales
   */
  list(params?: { limit?: number; status?: 'uploaded' | 'processed' }): File[] {
    let query = getDb().select().from(files);

    if (params?.status) {
      query = query.where(eq(files.status, params.status)) as typeof query;
    }

    query = query.orderBy(desc(files.createdAt)) as typeof query;

    if (params?.limit) {
      query = query.limit(params.limit) as typeof query;
    }

    return query.all();
  }

  /**
   * Elimina un archivo (solo usar en casos excepcionales)
   */
  delete(id: number): void {
    getDb().delete(files).where(eq(files.id, id)).run();
  }
}
