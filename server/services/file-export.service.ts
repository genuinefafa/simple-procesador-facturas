/**
 * Servicio para exportar y renombrar archivos procesados
 *
 * Estructura de salida:
 * - Directorio: finalized/yyyy-mm/
 * - Nombre: yyyy-mm-dd Nombre_Emisor CUIT TIPO PV-NUM [CATEGORIA].ext
 */

import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { Invoice } from '../utils/types.js';
import { InvoiceRepository } from '../database/repositories/invoice.js';
import { EmitterRepository } from '../database/repositories/emitter.js';
import { generateSubdirectory, generateProcessedFilename } from '../utils/file-naming.js';

export interface ExportOptions {
  outputDir?: string;
  /** Key de la categoría (ej: "3f", "sw", "Fa") - aparece en el nombre como [key] */
  categoryKey?: string | null;
}

export interface ExportResult {
  success: boolean;
  newPath?: string;
  relativePath?: string; // Ruta relativa para guardar en BD
  error?: string;
}

export class FileExportService {
  private invoiceRepo: InvoiceRepository;
  private emitterRepo: EmitterRepository;
  private defaultOutputDir: string;

  constructor(outputDir?: string) {
    this.invoiceRepo = new InvoiceRepository();
    this.emitterRepo = new EmitterRepository();
    this.defaultOutputDir = outputDir || './data/finalized';
  }

  /**
   * Exporta y renombra un archivo procesado
   * Crea subdirectorios por fecha (yyyy-mm)
   *
   * @param invoice - Factura procesada
   * @param originalPath - Ruta al archivo original
   * @param options - Opciones de exportación
   * @returns Resultado de la exportación
   */
  exportInvoice(
    invoice: Invoice,
    originalPath: string,
    options: ExportOptions = {}
  ): ExportResult {
    try {
      const outputDir = options.outputDir || this.defaultOutputDir;
      const categoryKey = options.categoryKey ?? null;

      // Obtener el emisor para el nombre
      const emitter = this.emitterRepo.findByCUIT(invoice.emitterCuit);
      if (!emitter) {
        return {
          success: false,
          error: `Emisor no encontrado: ${invoice.emitterCuit}`,
        };
      }

      // Generar subdirectorio basado en fecha (yyyy-mm)
      const issueDate = new Date(invoice.issueDate);
      const subdir = generateSubdirectory(issueDate);
      const fullOutputDir = join(outputDir, subdir);

      // Crear directorio si no existe
      if (!existsSync(fullOutputDir)) {
        mkdirSync(fullOutputDir, { recursive: true });
        console.info(`   📁 Directorio creado: ${fullOutputDir}`);
      }

      // Generar nombre del archivo usando categoryKey
      const newFileName = generateProcessedFilename(
        issueDate,
        emitter,
        invoice.invoiceType,
        invoice.pointOfSale,
        invoice.invoiceNumber,
        originalPath,
        categoryKey
      );

      const newPath = join(fullOutputDir, newFileName);
      const relativePath = join(subdir, newFileName); // Para guardar en BD

      // Verificar si ya existe
      if (existsSync(newPath)) {
        return {
          success: false,
          error: `El archivo ya existe: ${relativePath}`,
        };
      }

      // Copiar archivo
      copyFileSync(originalPath, newPath);
      console.info(`   ✅ Archivo exportado: ${relativePath}`);

      // Actualizar BD con la nueva ruta (relativa)
      this.invoiceRepo.updateProcessedFile(invoice.id, relativePath);

      return {
        success: true,
        newPath,
        relativePath,
      };
    } catch (error) {
      console.error(`   ❌ Error exportando:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  /**
   * Exporta y renombra usando datos manuales (sin Invoice completo)
   * Útil cuando se tiene la información pero no se ha creado el Invoice en BD
   */
  exportWithData(
    originalPath: string,
    data: {
      issueDate: Date;
      emitterCuit: string;
      invoiceType: Invoice['invoiceType'];
      pointOfSale: number;
      invoiceNumber: number;
      categoryKey?: string | null;
    },
    options: ExportOptions = {}
  ): ExportResult {
    try {
      const outputDir = options.outputDir || this.defaultOutputDir;
      const categoryKey = data.categoryKey ?? options.categoryKey ?? null;

      // Obtener el emisor para el nombre
      const emitter = this.emitterRepo.findByCUIT(data.emitterCuit);
      if (!emitter) {
        return {
          success: false,
          error: `Emisor no encontrado: ${data.emitterCuit}`,
        };
      }

      // Generar subdirectorio basado en fecha (yyyy-mm)
      const subdir = generateSubdirectory(data.issueDate);
      const fullOutputDir = join(outputDir, subdir);

      // Crear directorio si no existe
      if (!existsSync(fullOutputDir)) {
        mkdirSync(fullOutputDir, { recursive: true });
        console.info(`   📁 Directorio creado: ${fullOutputDir}`);
      }

      // Generar nombre del archivo usando categoryKey
      const newFileName = generateProcessedFilename(
        data.issueDate,
        emitter,
        data.invoiceType,
        data.pointOfSale,
        data.invoiceNumber,
        originalPath,
        categoryKey
      );

      const newPath = join(fullOutputDir, newFileName);
      const relativePath = join(subdir, newFileName);

      // Verificar si ya existe
      if (existsSync(newPath)) {
        return {
          success: false,
          error: `El archivo ya existe: ${relativePath}`,
        };
      }

      // Copiar archivo
      copyFileSync(originalPath, newPath);
      console.info(`   ✅ Archivo exportado: ${relativePath}`);

      return {
        success: true,
        newPath,
        relativePath,
      };
    } catch (error) {
      console.error(`   ❌ Error exportando:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  /**
   * Exporta múltiples facturas
   * @param invoices - Array de facturas con sus rutas originales
   * @param options - Opciones de exportación
   * @returns Array de resultados
   */
  exportBatch(
    invoices: Array<{ invoice: Invoice; originalPath: string }>,
    options: ExportOptions = {}
  ): ExportResult[] {
    console.info(`\n📦 [EXPORT] Exportando ${invoices.length} archivo(s)...`);

    const results = invoices.map(({ invoice, originalPath }) =>
      this.exportInvoice(invoice, originalPath, options)
    );

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    console.info(`📊 [EXPORT] Resumen: ${successful} exitosos, ${failed} fallidos`);

    return results;
  }

  /**
   * Genera la ruta de salida prevista para un archivo (sin exportar)
   * Útil para preview o validación
   */
  previewExportPath(
    invoice: Invoice,
    originalPath: string,
    options: ExportOptions = {}
  ): { subdir: string; filename: string; fullPath: string } | null {
    const outputDir = options.outputDir || this.defaultOutputDir;
    const categoryKey = options.categoryKey ?? null;

    const emitter = this.emitterRepo.findByCUIT(invoice.emitterCuit);
    if (!emitter) {
      return null;
    }

    const issueDate = new Date(invoice.issueDate);
    const subdir = generateSubdirectory(issueDate);

    const filename = generateProcessedFilename(
      issueDate,
      emitter,
      invoice.invoiceType,
      invoice.pointOfSale,
      invoice.invoiceNumber,
      originalPath,
      categoryKey
    );

    return {
      subdir,
      filename,
      fullPath: join(outputDir, subdir, filename),
    };
  }
}
