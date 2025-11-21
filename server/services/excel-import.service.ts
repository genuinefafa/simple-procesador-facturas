/**
 * Servicio para importar facturas esperadas desde archivos Excel/CSV de AFIP
 */

import ExcelJS from 'exceljs';
import { normalizeCUIT, validateCUIT } from '../validators/cuit.js';
import { ExpectedInvoiceRepository } from '../database/repositories/expected-invoice.js';
import path from 'path';

export interface ImportResult {
  success: boolean;
  batchId: number;
  filename: string;
  totalRows: number;
  imported: number;
  skipped: number;
  errors: Array<{ row: number; error: string }>;
}

export interface ParsedInvoice {
  cuit: string;
  emitterName?: string;
  issueDate: string;
  invoiceType: string;
  pointOfSale: number;
  invoiceNumber: number;
  total?: number;
  cae?: string;
  caeExpiration?: string;
  currency?: string;
}

export interface ColumnMapping {
  cuit: string;
  emitterName?: string;
  issueDate: string;
  invoiceType: string;
  pointOfSale: string;
  invoiceNumber: string;
  total?: string;
  cae?: string;
  caeExpiration?: string;
}

/**
 * Servicio de importación de Excel/CSV de AFIP
 */
export class ExcelImportService {
  private repo: ExpectedInvoiceRepository;

  constructor() {
    this.repo = new ExpectedInvoiceRepository();
  }

  /**
   * Importa facturas desde un archivo Excel o CSV
   */
  async importFromFile(
    filePath: string,
    columnMapping?: ColumnMapping
  ): Promise<ImportResult> {
    console.info(`\n📥 [EXCEL-IMPORT] Iniciando importación desde: ${path.basename(filePath)}`);

    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.csv') {
      return this.importFromCSV(filePath, columnMapping);
    } else if (ext === '.xlsx' || ext === '.xls') {
      return this.importFromExcel(filePath, columnMapping);
    } else {
      throw new Error(`Formato de archivo no soportado: ${ext}. Use .xlsx, .xls o .csv`);
    }
  }

  /**
   * Importa desde archivo CSV
   */
  private async importFromCSV(
    filePath: string,
    columnMapping?: ColumnMapping
  ): Promise<ImportResult> {
    console.info(`   📄 Procesando archivo CSV...`);

    // Usar ExcelJS para leer CSV (soporta CSV nativamente)
    const workbook = new ExcelJS.Workbook();
    await workbook.csv.readFile(filePath);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('El archivo CSV está vacío o no se pudo leer');
    }

    return this.processWorksheet(worksheet, path.basename(filePath), columnMapping);
  }

  /**
   * Importa desde archivo Excel
   */
  private async importFromExcel(
    filePath: string,
    columnMapping?: ColumnMapping
  ): Promise<ImportResult> {
    console.info(`   📊 Procesando archivo Excel...`);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    // Tomar la primera hoja
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('El archivo Excel no contiene hojas o está vacío');
    }

    console.info(`   📋 Hoja seleccionada: "${worksheet.name}"`);

    return this.processWorksheet(worksheet, path.basename(filePath), columnMapping);
  }

  /**
   * Procesa una hoja de Excel/CSV
   */
  private async processWorksheet(
    worksheet: ExcelJS.Worksheet,
    filename: string,
    columnMapping?: ColumnMapping
  ): Promise<ImportResult> {
    const rows: any[] = [];
    const errors: Array<{ row: number; error: string }> = [];

    // Obtener headers (primera fila)
    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber - 1] = String(cell.value).trim();
    });

    console.info(`   📌 Headers encontrados: ${headers.join(', ')}`);

    // Auto-detectar columnas si no se proporciona mapeo
    const mapping = columnMapping || this.autoDetectColumns(headers);
    console.info(`   🔍 Mapeo de columnas:`);
    console.info(`      CUIT: "${mapping.cuit}"`);
    console.info(`      Fecha: "${mapping.issueDate}"`);
    console.info(`      Tipo: "${mapping.invoiceType}"`);
    console.info(`      Punto Venta: "${mapping.pointOfSale}"`);
    console.info(`      Número: "${mapping.invoiceNumber}"`);

    // Validar que las columnas requeridas existan
    const requiredColumns = [
      mapping.cuit,
      mapping.issueDate,
      mapping.invoiceType,
      mapping.pointOfSale,
      mapping.invoiceNumber,
    ];

    for (const colName of requiredColumns) {
      if (!headers.includes(colName)) {
        throw new Error(`Columna requerida no encontrada: "${colName}"`);
      }
    }

    // Procesar cada fila (comenzando desde la fila 2, después del header)
    let rowCount = 0;
    worksheet.eachRow((row, rowNumber) => {
      // Saltar header
      if (rowNumber === 1) return;

      try {
        const rowData: any = {};
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber - 1];
          rowData[header] = cell.value;
        });

        const parsed = this.parseRow(rowData, mapping);
        rows.push(parsed);
        rowCount++;
      } catch (error) {
        errors.push({
          row: rowNumber,
          error: error instanceof Error ? error.message : 'Error desconocido',
        });
      }
    });

    console.info(`   📊 Filas procesadas: ${rowCount}`);
    console.info(`   ❌ Errores encontrados: ${errors.length}`);

    // Crear lote de importación
    const batch = this.repo.createBatch({
      filename,
      totalRows: rowCount + errors.length,
      importedRows: 0, // Se actualizará después
      skippedRows: 0,
      errorRows: errors.length,
    });

    console.info(`   📦 Lote creado - ID: ${batch.id}`);

    // Insertar facturas en la base de datos
    const imported = this.repo.createBatch(rows, batch.id);

    console.info(`   ✅ Facturas importadas: ${imported.length}`);

    // Actualizar estadísticas del lote
    this.repo.updateBatch(batch.id, {
      importedRows: imported.length,
      skippedRows: rowCount - imported.length,
    });

    console.info(`\n✨ [EXCEL-IMPORT] Importación completada exitosamente`);

    return {
      success: true,
      batchId: batch.id,
      filename,
      totalRows: rowCount + errors.length,
      imported: imported.length,
      skipped: rowCount - imported.length,
      errors,
    };
  }

  /**
   * Auto-detecta las columnas del Excel basándose en nombres comunes
   */
  private autoDetectColumns(headers: string[]): ColumnMapping {
    const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());

    const findColumn = (patterns: string[]): string => {
      for (const pattern of patterns) {
        const index = normalizedHeaders.findIndex((h) => h.includes(pattern));
        if (index !== -1) {
          return headers[index];
        }
      }
      throw new Error(`No se pudo auto-detectar columna para patrones: ${patterns.join(', ')}`);
    };

    return {
      cuit: findColumn(['cuit', 'nro. cuit', 'numero de cuit']),
      emitterName: headers.find((h) =>
        /nombre|razon social|emisor|proveedor/i.test(h)
      ),
      issueDate: findColumn(['fecha', 'fecha emision', 'fecha de emision']),
      invoiceType: findColumn(['tipo', 'tipo comprobante', 'comprobante']),
      pointOfSale: findColumn([
        'punto de venta',
        'pto venta',
        'punto venta',
        'pto. vta',
      ]),
      invoiceNumber: findColumn(['numero', 'nro comprobante', 'numero comprobante']),
      total: headers.find((h) => /total|importe|monto/i.test(h)),
      cae: headers.find((h) => /cae|codigo autorizacion/i.test(h)),
    };
  }

  /**
   * Parsea una fila del Excel/CSV a un objeto ParsedInvoice
   */
  private parseRow(row: any, mapping: ColumnMapping): ParsedInvoice {
    // Extraer CUIT y validar
    let cuit = String(row[mapping.cuit] || '').trim();

    // Limpiar CUIT (remover espacios, guiones innecesarios, etc.)
    cuit = cuit.replace(/\s+/g, '');

    // Si no tiene formato XX-XXXXXXXX-X, intentar agregarlo
    if (cuit.length === 11 && !cuit.includes('-')) {
      cuit = `${cuit.substring(0, 2)}-${cuit.substring(2, 10)}-${cuit.substring(10)}`;
    }

    if (!validateCUIT(cuit)) {
      throw new Error(`CUIT inválido: ${cuit}`);
    }

    const normalizedCuit = normalizeCUIT(cuit);

    // Extraer fecha
    let issueDate = String(row[mapping.issueDate] || '').trim();

    // Si es un objeto Date de Excel
    if (row[mapping.issueDate] instanceof Date) {
      const date = row[mapping.issueDate] as Date;
      issueDate = date.toISOString().split('T')[0]; // YYYY-MM-DD
    }
    // Si es formato DD/MM/YYYY o DD-MM-YYYY
    else if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(issueDate)) {
      const [day, month, year] = issueDate.split(/[/-]/);
      issueDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    // Si es formato YYYY-MM-DD (ya válido)
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) {
      throw new Error(`Formato de fecha inválido: ${issueDate}`);
    }

    // Extraer tipo de factura
    let invoiceType = String(row[mapping.invoiceType] || '').trim().toUpperCase();

    // Si viene con formato "Factura A" o similar, extraer solo la letra
    const typeMatch = invoiceType.match(/[ABCEMX]/);
    if (typeMatch) {
      invoiceType = typeMatch[0];
    }

    if (!['A', 'B', 'C', 'E', 'M', 'X'].includes(invoiceType)) {
      throw new Error(`Tipo de factura inválido: ${invoiceType}`);
    }

    // Extraer punto de venta
    const pointOfSale = parseInt(String(row[mapping.pointOfSale] || '0'));
    if (isNaN(pointOfSale) || pointOfSale < 0) {
      throw new Error(`Punto de venta inválido: ${row[mapping.pointOfSale]}`);
    }

    // Extraer número de factura
    const invoiceNumber = parseInt(String(row[mapping.invoiceNumber] || '0'));
    if (isNaN(invoiceNumber) || invoiceNumber < 0) {
      throw new Error(`Número de factura inválido: ${row[mapping.invoiceNumber]}`);
    }

    // Campos opcionales
    const emitterName = mapping.emitterName
      ? String(row[mapping.emitterName] || '').trim() || undefined
      : undefined;

    const total = mapping.total ? parseFloat(String(row[mapping.total] || '0')) : undefined;

    const cae = mapping.cae ? String(row[mapping.cae] || '').trim() || undefined : undefined;

    const caeExpiration = mapping.caeExpiration
      ? String(row[mapping.caeExpiration] || '').trim() || undefined
      : undefined;

    return {
      cuit: normalizedCuit,
      emitterName,
      issueDate,
      invoiceType,
      pointOfSale,
      invoiceNumber,
      total,
      cae,
      caeExpiration,
      currency: 'ARS',
    };
  }

  /**
   * Obtiene estadísticas de un lote
   */
  getBatchStats(batchId: number) {
    const batch = this.repo.findBatchById(batchId);
    if (!batch) {
      throw new Error(`Lote de importación no encontrado: ${batchId}`);
    }

    const statusCounts = this.repo.countByStatus(batchId);

    return {
      batch,
      statusCounts,
    };
  }

  /**
   * Lista todos los lotes de importación
   */
  listBatches(limit?: number) {
    return this.repo.listBatches(limit);
  }
}
