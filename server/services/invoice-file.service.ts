/**
 * Servicio centralizado para operaciones de archivos de facturas.
 *
 * Responsabilidades:
 * - Copiar archivos de input/ a finalized/
 * - Renombrar/mover archivos dentro de finalized/
 * - Buscar archivos por datos de factura (fallback)
 * - Determinar si se necesita renombrar un archivo
 *
 * Este servicio centraliza la lógica duplicada en:
 * - /api/invoices/[id]/+server.ts (PATCH)
 * - /api/invoices/[id]/category/+server.ts
 * - InvoiceCreationService
 */

import { constants, existsSync, readdirSync, statSync } from 'fs';
import { copyFile, mkdir, rename, unlink } from 'fs/promises';
import { basename, extname, join, resolve } from 'path';
import { FileRepository, type IFileRepository } from '../database/repositories/file.js';
import { CategoryRepository, type ICategoryRepository } from '../database/repositories/category.js';
import { calculateFileHash } from '../utils/file-hash.js';
import { generateProcessedFilename, generateSubdirectory } from '../utils/file-naming.js';
import type { Emitter, InvoiceType } from '@shared/types';

const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const DATA_DIR = join(PROJECT_ROOT, 'data');
const FINALIZED_DIR = join(DATA_DIR, 'finalized');
const INPUT_DIR = join(DATA_DIR, 'input');

/**
 * Datos de factura necesarios para operaciones de archivo
 */
export interface InvoiceFileData {
  emitterCuit: string;
  invoiceType: InvoiceType;
  pointOfSale: number;
  invoiceNumber: number;
  issueDate: string; // YYYY-MM-DD
  fileId: number | null;
}

/**
 * Resultado de una operación de archivo
 */
export interface FileOperationResult {
  success: boolean;
  newPath?: string;
  oldPath?: string;
  relativePath?: string;
  error?: string;
}

/**
 * Campos que pueden cambiar y afectar el nombre del archivo
 */
export interface InvoiceUpdateFields {
  emitterCuit?: string;
  invoiceType?: string | number;
  pointOfSale?: number;
  invoiceNumber?: number;
  issueDate?: string;
  categoryId?: number | null;
}

export class InvoiceFileService {
  private fileRepo: IFileRepository;
  private categoryRepo: ICategoryRepository;

  constructor(fileRepo?: IFileRepository, categoryRepo?: ICategoryRepository) {
    this.fileRepo = fileRepo ?? new FileRepository();
    this.categoryRepo = categoryRepo ?? new CategoryRepository();
  }

  /**
   * Determina si un update requiere renombrar el archivo
   */
  shouldRenameFile(updates: InvoiceUpdateFields): boolean {
    return !!(
      updates.emitterCuit ||
      updates.invoiceType ||
      updates.pointOfSale !== undefined ||
      updates.invoiceNumber !== undefined ||
      updates.issueDate ||
      updates.categoryId !== undefined
    );
  }

  /**
   * Busca un archivo en finalized/ por datos de factura.
   * Útil cuando storagePath en DB no coincide con el archivo real
   * (por ejemplo, después de un cambio de fecha o categoría).
   *
   * TODO: See issue #218 — matches by name only, so it may pick an orphan file;
   * it should be restricted by file hash once orphans can be detected.
   */
  findFileByInvoiceData(cuit: string, _tipo: number, pv: number, num: number): string | null {
    try {
      const cuitNumeric = cuit.replace(/\D/g, '');
      const pvFormatted = String(pv).padStart(5, '0');
      const numFormatted = String(num).padStart(8, '0');

      // Verificar que el directorio existe
      if (!existsSync(FINALIZED_DIR)) {
        return null;
      }

      // Buscar en subdirectorios de finalized/
      const subdirs = readdirSync(FINALIZED_DIR).filter((item) => {
        const itemPath = join(FINALIZED_DIR, item);
        return statSync(itemPath).isDirectory();
      });

      for (const subdir of subdirs) {
        const subdirPath = join(FINALIZED_DIR, subdir);
        const files = readdirSync(subdirPath);

        for (const file of files) {
          // Buscar archivo que contenga CUIT y número de factura
          // Ignoramos la categoría en la búsqueda para encontrar archivos con categoría diferente
          if (file.includes(cuitNumeric) && file.includes(`${pvFormatted}-${numFormatted}`)) {
            const candidatePath = join(subdirPath, file);
            console.log(`[InvoiceFileService] Encontrado por CUIT/número en ${subdir}: ${file}`);
            return candidatePath;
          }
        }
      }
    } catch (err) {
      console.error('[InvoiceFileService] Error buscando archivo:', err);
    }

    return null;
  }

  /**
   * Obtiene la ruta actual de un archivo, intentando primero storagePath
   * y luego búsqueda por datos de factura como fallback.
   */
  resolveCurrentFilePath(invoice: InvoiceFileData): string | null {
    // Intentar via storagePath
    if (invoice.fileId) {
      const file = this.fileRepo.findById(invoice.fileId);
      if (file) {
        const absoluteStoragePath = join(DATA_DIR, file.storagePath);
        if (existsSync(absoluteStoragePath)) {
          return absoluteStoragePath;
        }
      }
    }

    // Fallback: buscar por datos de factura
    if (invoice.invoiceType !== null) {
      return this.findFileByInvoiceData(
        invoice.emitterCuit,
        invoice.invoiceType,
        invoice.pointOfSale,
        invoice.invoiceNumber
      );
    }

    return null;
  }

  /**
   * Genera la ruta canónica para un archivo de factura.
   */
  generateCanonicalPath(
    invoice: InvoiceFileData,
    emitter: Emitter,
    originalFilename: string,
    categoryKey?: string | null
  ): { filename: string; relativePath: string; absolutePath: string; subdir: string } {
    const issueDate = new Date(invoice.issueDate);
    const subdir = generateSubdirectory(issueDate);
    const filename = generateProcessedFilename(
      issueDate,
      emitter,
      invoice.invoiceType,
      invoice.pointOfSale,
      invoice.invoiceNumber,
      originalFilename,
      categoryKey
    );

    const relativePath = `finalized/${subdir}/${filename}`;
    const absolutePath = join(FINALIZED_DIR, subdir, filename);

    return { filename, relativePath, absolutePath, subdir };
  }

  /**
   * Copia un archivo de input/ (o cualquier ubicación) a finalized/.
   * Usado durante la creación de facturas.
   */
  async copyToFinalized(
    fileId: number,
    invoice: InvoiceFileData,
    emitter: Emitter,
    categoryKey?: string | null
  ): Promise<FileOperationResult> {
    // Obtener archivo
    const file = this.fileRepo.findById(fileId);
    if (!file) {
      return { success: false, error: 'Archivo no encontrado en base de datos' };
    }

    // Verificar que el archivo fuente existe
    const sourcePath = file.storagePath.startsWith('/')
      ? file.storagePath
      : join(DATA_DIR, file.storagePath);

    if (!existsSync(sourcePath)) {
      return { success: false, error: `Archivo físico no encontrado: ${sourcePath}` };
    }

    // Generar ruta destino
    const { absolutePath, relativePath, subdir } = this.generateCanonicalPath(
      invoice,
      emitter,
      file.originalFilename,
      categoryKey
    );

    // Already at its canonical path (e.g. invoice deleted and recreated with the
    // same data): copying a file onto itself deletes or truncates it. See #212
    if (resolve(sourcePath) === resolve(absolutePath)) {
      console.log(`[InvoiceFileService] ℹ️ Archivo ya está en la ubicación correcta`);
      this.fileRepo.updatePath(fileId, relativePath);
      this.fileRepo.updateStatus(fileId, 'processed');
      return { success: true, newPath: absolutePath, oldPath: sourcePath, relativePath };
    }

    if (existsSync(absolutePath)) {
      return {
        success: false,
        error: `Ya existe otro archivo en la ruta destino: ${relativePath}`,
      };
    }

    try {
      // Crear directorio destino si no existe
      await mkdir(join(FINALIZED_DIR, subdir), { recursive: true });

      // COPYFILE_EXCL: never overwrite an existing file (race or case-only match)
      await copyFile(sourcePath, absolutePath, constants.COPYFILE_EXCL);
      console.log(`[InvoiceFileService] ✅ Archivo copiado: ${sourcePath} -> ${absolutePath}`);

      // Actualizar storagePath en DB
      this.fileRepo.updatePath(fileId, relativePath);
      this.fileRepo.updateStatus(fileId, 'processed');

      return {
        success: true,
        newPath: absolutePath,
        oldPath: sourcePath,
        relativePath,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[InvoiceFileService] ❌ Error copiando archivo: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Releases the finalized copy of a file whose invoice was deleted/unlinked.
   *
   * The upload flow keeps the original in input/<originalFilename> (copyToFinalized
   * copies, it does not move), so we first look for that copy and verify it by
   * SHA-256. If it is gone we copy the finalized file back into input/ under a
   * non-colliding name. Only after the DB points at an existing input file is the
   * finalized copy removed: a failure never leaves the DB pointing at a missing
   * file and the only copy is never deleted.
   */
  async releaseFinalizedFile(fileId: number): Promise<FileOperationResult> {
    const file = this.fileRepo.findById(fileId);
    if (!file) {
      return { success: false, error: 'Archivo no encontrado en base de datos' };
    }
    if (!file.storagePath.startsWith('finalized/')) {
      return { success: true, relativePath: file.storagePath };
    }

    const finalizedAbs = join(DATA_DIR, file.storagePath);
    const finalizedExists = existsSync(finalizedAbs);

    try {
      const expectedHash =
        file.fileHash || (finalizedExists ? (await calculateFileHash(finalizedAbs)).hash : null);

      // 1. Original upload copy, verified by hash
      const safeName = basename(file.originalFilename);
      const candidate = join(INPUT_DIR, safeName);
      let inputAbs: string | null = null;
      if (expectedHash && existsSync(candidate)) {
        if ((await calculateFileHash(candidate)).hash === expectedHash) {
          inputAbs = candidate;
        }
      }

      // 2. No usable input copy: restore from the finalized file
      if (!inputAbs) {
        if (!finalizedExists) {
          return { success: false, error: 'No se encontró ninguna copia del archivo' };
        }
        await mkdir(INPUT_DIR, { recursive: true });
        const ext = extname(safeName);
        const base = safeName.slice(0, safeName.length - ext.length);
        let target = join(INPUT_DIR, safeName);
        for (let n = 1; existsSync(target); n++) {
          target = join(INPUT_DIR, `${base}.restored-${n}${ext}`);
        }
        await copyFile(finalizedAbs, target, constants.COPYFILE_EXCL);
        inputAbs = target;
      }

      // 3. Point the DB at the input file, then drop the finalized copy
      this.fileRepo.updatePath(fileId, `input/${basename(inputAbs)}`);
      this.fileRepo.updateStatus(fileId, 'uploaded');
      if (finalizedExists) {
        await unlink(finalizedAbs);
      }
      return { success: true, newPath: inputAbs, oldPath: finalizedAbs };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[InvoiceFileService] ❌ Error liberando archivo finalizado: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Renombra/mueve un archivo dentro de finalized/.
   * Usado cuando se actualiza una factura y cambia algún campo que afecta el nombre.
   */
  async renameInFinalized(
    fileId: number,
    invoice: InvoiceFileData,
    emitter: Emitter,
    categoryKey?: string | null
  ): Promise<FileOperationResult> {
    // Obtener archivo
    const file = this.fileRepo.findById(fileId);
    if (!file) {
      return { success: false, error: 'Archivo no encontrado en base de datos' };
    }

    // Buscar archivo actual
    const currentPath = this.resolveCurrentFilePath(invoice);
    if (!currentPath) {
      console.warn(
        `[InvoiceFileService] ⚠️ No se encontró archivo físico para factura, no se puede renombrar`
      );
      return { success: false, error: 'Archivo físico no encontrado' };
    }

    // Generar nueva ruta
    const {
      absolutePath: newPath,
      relativePath,
      subdir,
    } = this.generateCanonicalPath(invoice, emitter, file.originalFilename, categoryKey);

    // Si la ruta es la misma, no hacer nada
    if (resolve(currentPath) === resolve(newPath)) {
      console.log(`[InvoiceFileService] ℹ️ Archivo ya está en la ubicación correcta`);
      return { success: true, newPath, relativePath };
    }

    // rename() silently replaces an existing destination: refuse instead. See #212
    if (existsSync(newPath)) {
      return {
        success: false,
        error: `Ya existe otro archivo en la ruta destino: ${relativePath}`,
      };
    }

    try {
      // Crear directorio destino si no existe
      await mkdir(join(FINALIZED_DIR, subdir), { recursive: true });

      // Determinar si mover (rename) o copiar
      const isInFinalized = currentPath.includes('/finalized/');

      if (isInFinalized) {
        // Mover archivo (rename)
        await rename(currentPath, newPath);
        console.log(`[InvoiceFileService] ✅ Archivo movido: ${currentPath} -> ${newPath}`);
      } else {
        // Copiar desde uploaded/input (preservar original)
        await copyFile(currentPath, newPath, constants.COPYFILE_EXCL);
        console.log(
          `[InvoiceFileService] ✅ Archivo copiado desde uploaded: ${currentPath} -> ${newPath}`
        );
      }

      // Actualizar storagePath en DB
      this.fileRepo.updatePath(fileId, relativePath);

      return {
        success: true,
        newPath,
        oldPath: currentPath,
        relativePath,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[InvoiceFileService] ❌ Error renombrando archivo: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Método de conveniencia para renombrar con resolución automática de categoría.
   * Obtiene categoryKey de la base de datos si se proporciona categoryId.
   */
  async renameWithCategoryResolution(
    fileId: number,
    invoice: InvoiceFileData,
    emitter: Emitter,
    categoryId: number | null | undefined
  ): Promise<FileOperationResult> {
    let categoryKey: string | null = null;

    if (categoryId) {
      const category = await this.categoryRepo.findById(categoryId);
      categoryKey = category?.key || null;
    }

    return this.renameInFinalized(fileId, invoice, emitter, categoryKey);
  }
}
