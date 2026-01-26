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

import { existsSync, readdirSync, statSync } from 'fs';
import { copyFile, mkdir, rename } from 'fs/promises';
import { join } from 'path';
import { FileRepository, type IFileRepository } from '../database/repositories/file.js';
import { CategoryRepository } from '../database/repositories/category.js';
import { generateProcessedFilename, generateSubdirectory } from '../utils/file-naming.js';
import type { Emitter, InvoiceType } from '../utils/types.js';

const PROJECT_ROOT = join(process.cwd(), '..');
const DATA_DIR = join(PROJECT_ROOT, 'data');
const FINALIZED_DIR = join(DATA_DIR, 'finalized');

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
  private categoryRepo: CategoryRepository;

  constructor(fileRepo?: IFileRepository, categoryRepo?: CategoryRepository) {
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

    try {
      // Crear directorio destino si no existe
      await mkdir(join(FINALIZED_DIR, subdir), { recursive: true });

      // Copiar archivo
      await copyFile(sourcePath, absolutePath);
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
    if (currentPath === newPath) {
      console.log(`[InvoiceFileService] ℹ️ Archivo ya está en la ubicación correcta`);
      return { success: true, newPath, relativePath };
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
        await copyFile(currentPath, newPath);
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
