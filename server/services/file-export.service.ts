/**
 * Servicio para exportar y renombrar archivos procesados
 */

import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { format } from 'date-fns';
import type { Invoice } from '../utils/types.js';
import { InvoiceRepository } from '../database/repositories/invoice.js';

export interface ExportOptions {
  outputDir?: string;
  namingFormat?: string; // {CUIT}_{DATE}_{TYPE}-{PV}-{NUM}
  createBackup?: boolean;
}

export interface ExportResult {
  success: boolean;
  newPath?: string;
  error?: string;
}

export class FileExportService {
  private invoiceRepo: InvoiceRepository;
  private defaultOutputDir: string;

  constructor(outputDir?: string) {
    this.invoiceRepo = new InvoiceRepository();
    this.defaultOutputDir = outputDir || './data/processed';
  }

  /**
   * Exporta y renombra un archivo procesado
   * @param invoice - Factura procesada
   * @param originalPath - Ruta al archivo original
   * @param options - Opciones de exportación
   * @returns Resultado de la exportación
   */
  exportInvoice(invoice: Invoice, originalPath: string, options: ExportOptions = {}): ExportResult {
    try {
      const outputDir = options.outputDir || this.defaultOutputDir;

      // Crear directorio si no existe
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      // Generar nombre del archivo
      const newFileName = this.generateFileName(invoice, originalPath, options.namingFormat);
      const newPath = join(outputDir, newFileName);

      // Verificar si ya existe
      if (existsSync(newPath)) {
        return {
          success: false,
          error: 'El archivo ya existe en el directorio de salida',
        };
      }

      // Copiar archivo
      copyFileSync(originalPath, newPath);

      // Actualizar BD con la nueva ruta
      this.invoiceRepo.updateProcessedFile(invoice.id, newFileName);

      return {
        success: true,
        newPath,
      };
    } catch (error) {
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
    return invoices.map(({ invoice, originalPath }) =>
      this.exportInvoice(invoice, originalPath, options)
    );
  }

  /**
   * Genera el nombre del archivo según el formato
   * @param invoice - Factura
   * @param originalPath - Ruta original
   * @param format - Formato personalizado (opcional)
   * @returns Nombre del archivo
   */
  private generateFileName(invoice: Invoice, originalPath: string, format?: string): string {
    const ext = extname(originalPath);
    const cuitNumeric = invoice.emitterCuit.replace(/-/g, '');

    // Formato: {CUIT}_{YYYYMMDD}_{TIPO}-{PV}-{NUM}.pdf
    const dateFormatted = format(new Date(invoice.issueDate), 'yyyyMMdd');
    const pvFormatted = String(invoice.pointOfSale).padStart(5, '0');
    const numFormatted = String(invoice.invoiceNumber).padStart(8, '0');

    if (format) {
      // Formato personalizado
      return (
        format
          .replace('{CUIT}', cuitNumeric)
          .replace('{DATE}', dateFormatted)
          .replace('{TYPE}', invoice.invoiceType)
          .replace('{PV}', pvFormatted)
          .replace('{NUM}', numFormatted) + ext
      );
    }

    // Formato default
    return `${cuitNumeric}_${dateFormatted}_${invoice.invoiceType}-${pvFormatted}-${numFormatted}${ext}`;
  }
}
