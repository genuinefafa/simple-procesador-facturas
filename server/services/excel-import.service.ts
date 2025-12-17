/**
 * Servicio para importar facturas esperadas desde archivos Excel/CSV de AFIP
 */

import ExcelJS from 'exceljs';
import { normalizeCUIT, validateCUIT } from '../validators/cuit.js';
import { ExpectedInvoiceRepository } from '../database/repositories/expected-invoice.js';
import path from 'path';

/**
 * Extrae el valor primitivo de una celda de ExcelJS
 */
function getCellStringValue(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  // Handle rich text
  if (typeof value === 'object' && 'richText' in value) {
    return value.richText.map((rt) => rt.text).join('');
  }
  // Handle formula results
  if (typeof value === 'object' && 'result' in value) {
    return getCellStringValue(value.result as ExcelJS.CellValue);
  }
  // Handle hyperlinks
  if (typeof value === 'object' && 'text' in value) {
    return String(value.text);
  }
  // Handle error values
  if (typeof value === 'object' && 'error' in value) {
    return '';
  }
  // Fallback - should not reach here in normal cases
  return '';
}

export interface ImportResult {
  success: boolean;
  batchId: number;
  filename: string;
  totalRows: number;
  imported: number;
  updated: number;
  unchanged: number;
  errors: Array<{ row: number; error: string }>;
}

export interface ParsedInvoice {
  cuit: string;
  emitterName?: string;
  issueDate: string;
  invoiceType: number; // Código ARCA numérico (1, 6, 11, etc.)
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
  async importFromFile(filePath: string, columnMapping?: ColumnMapping): Promise<ImportResult> {
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

    return await this.processWorksheet(worksheet, path.basename(filePath), columnMapping);
  }

  /**
   * Procesa una hoja de Excel/CSV
   */
  private async processWorksheet(
    worksheet: ExcelJS.Worksheet,
    filename: string,
    columnMapping?: ColumnMapping
  ): Promise<ImportResult> {
    const rows: ParsedInvoice[] = [];
    const errors: Array<{ row: number; error: string }> = [];

    // Obtener headers (primera fila)
    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber - 1] = getCellStringValue(cell.value).trim();
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
        const rowData: Record<string, ExcelJS.CellValue> = {};
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber - 1];
          if (header) {
            rowData[header] = cell.value;
          }
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
    const batch = await this.repo.createBatch({
      filename,
      totalRows: rowCount + errors.length,
      importedRows: 0, // Se actualizará después
      skippedRows: 0,
      errorRows: errors.length,
    });

    console.info(`   📦 Lote creado - ID: ${batch.id}`);

    // Insertar/actualizar facturas en la base de datos
    const result = await this.repo.createManyInvoices(rows, batch.id);

    console.info(`   ✅ Facturas creadas: ${result.created.length}`);
    console.info(`   🔄 Facturas actualizadas: ${result.updated.length}`);
    console.info(`   ⏭️  Facturas sin cambios: ${result.unchanged.length}`);

    // Actualizar estadísticas del lote
    await this.repo.updateBatch(batch.id, {
      importedRows: result.created.length,
      skippedRows: result.updated.length + result.unchanged.length,
    });

    console.info(`\n✨ [EXCEL-IMPORT] Importación completada exitosamente`);

    return {
      success: true,
      batchId: batch.id,
      filename,
      totalRows: rowCount + errors.length,
      imported: result.created.length,
      updated: result.updated.length,
      unchanged: result.unchanged.length,
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
          const header = headers[index];
          if (header) return header;
        }
      }
      throw new Error(`No se pudo auto-detectar columna para patrones: ${patterns.join(', ')}`);
    };

    return {
      cuit: findColumn(['cuit', 'nro. cuit', 'numero de cuit']),
      emitterName: headers.find((h) => /nombre|razon social|emisor|proveedor/i.test(h)),
      issueDate: findColumn(['fecha', 'fecha emision', 'fecha de emision']),
      invoiceType: findColumn(['tipo', 'tipo comprobante', 'comprobante']),
      pointOfSale: findColumn(['punto de venta', 'pto venta', 'punto venta', 'pto. vta']),
      invoiceNumber: findColumn(['numero', 'nro comprobante', 'numero comprobante']),
      total: headers.find((h) => /total|importe|monto/i.test(h)),
      cae: headers.find((h) => /cae|codigo autorizacion/i.test(h)),
    };
  }

  /**
   * Parsea una fila del Excel/CSV a un objeto ParsedInvoice
   */
  private parseRow(row: Record<string, ExcelJS.CellValue>, mapping: ColumnMapping): ParsedInvoice {
    // Extraer CUIT y validar
    let cuit = getCellStringValue(row[mapping.cuit]).trim();

    // Limpiar CUIT (remover espacios, guiones, puntos, comillas, etc.)
    cuit = cuit.replace(/[\s\-.'"]/g, '');

    // Extraer solo los dígitos si hay texto adicional
    const digitsOnly = cuit.replace(/\D/g, '');

    // Si tiene exactamente 11 dígitos, formatear como CUIT
    if (digitsOnly.length === 11) {
      cuit = `${digitsOnly.substring(0, 2)}-${digitsOnly.substring(2, 10)}-${digitsOnly.substring(10)}`;
    } else if (digitsOnly.length > 11) {
      // Si tiene más de 11 dígitos, tomar los primeros 11
      const truncated = digitsOnly.substring(0, 11);
      cuit = `${truncated.substring(0, 2)}-${truncated.substring(2, 10)}-${truncated.substring(10)}`;
      console.warn(`   ⚠️  CUIT con más de 11 dígitos, truncado: ${digitsOnly} → ${cuit}`);
    } else {
      throw new Error(
        `CUIT con cantidad incorrecta de dígitos (esperado: 11, recibido: ${digitsOnly.length}): ${cuit}`
      );
    }

    if (!validateCUIT(cuit)) {
      throw new Error(`CUIT inválido (falló validación de dígito verificador): ${cuit}`);
    }

    const normalizedCuit = normalizeCUIT(cuit);

    // Extraer fecha
    const rawDate = row[mapping.issueDate];
    let issueDate: string;

    // Si es un objeto Date de Excel
    if (rawDate instanceof Date) {
      const datePart = rawDate.toISOString().split('T')[0];
      if (!datePart) {
        throw new Error('Error al convertir fecha de Excel');
      }
      issueDate = datePart; // YYYY-MM-DD
    } else {
      const dateStr = getCellStringValue(rawDate);
      if (!dateStr) {
        throw new Error('Fecha vacía o inválida');
      }
      issueDate = dateStr.trim();
      // Si es formato DD/MM/YYYY o DD-MM-YYYY
      if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(issueDate)) {
        const [day, month, year] = issueDate.split(/[/-]/);
        if (!day || !month || !year) {
          throw new Error(`Formato de fecha inválido: ${issueDate}`);
        }
        issueDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      // Si es formato YYYY-MM-DD (ya válido)
      else if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) {
        throw new Error(`Formato de fecha inválido: ${issueDate}`);
      }
    }

    // Extraer tipo de factura como código ARCA numérico
    const invoiceTypeRaw = getCellStringValue(row[mapping.invoiceType]).trim().toUpperCase();

    // Manejar formatos comunes:
    // - "11 - Factura C" o "1 - Factura A" (formato AFIP/ARCA con código)
    // - "Factura A", "Factura B", etc.
    // - Solo la letra: "A", "B", "C", etc.

    let invoiceTypeCode: number | null = null;

    // Primero intentar extraer código numérico del formato "11 - Factura C"
    const codeMatch = invoiceTypeRaw.match(/^(\d{1,3})\s*[-–]\s*/);
    if (codeMatch && codeMatch[1]) {
      // Tenemos código ARCA explícito
      invoiceTypeCode = parseInt(codeMatch[1], 10);
    } else {
      // Intentar extraer letra y mapear a código ARCA (asumiendo Factura)
      // Estrategia: buscar la letra DESPUÉS de "FACTURA" o "FC" o "NC", o al final del string
      let typeMatch = invoiceTypeRaw.match(/(?:FACTURA|FC|NC)\s+([ABCEMX])/);
      let letter: string | null = null;

      if (typeMatch && typeMatch[1]) {
        letter = typeMatch[1];
      } else {
        // Si no hay "Factura X", buscar letra sola o al final
        typeMatch = invoiceTypeRaw.match(/\b([ABCEMX])\b/);
        if (typeMatch && typeMatch[1]) {
          letter = typeMatch[1];
        }
      }

      // Mapear letra a código ARCA (asumiendo Factura)
      if (letter) {
        const letterToCode: Record<string, number> = {
          A: 1, // Factura A
          B: 6, // Factura B
          C: 11, // Factura C
          E: 19, // Factura E
          M: 51, // Factura M
        };
        invoiceTypeCode = letterToCode[letter] ?? null;
      }
    }

    if (invoiceTypeCode === null) {
      throw new Error(`No se pudo detectar tipo de factura en: "${invoiceTypeRaw}"`);
    }

    // Extraer punto de venta
    const rawPointOfSaleStr = getCellStringValue(row[mapping.pointOfSale]) || '0';
    const pointOfSale = parseInt(rawPointOfSaleStr);
    if (isNaN(pointOfSale) || pointOfSale < 0) {
      throw new Error(`Punto de venta inválido: ${rawPointOfSaleStr}`);
    }

    // Extraer número de factura
    const rawInvoiceNumberStr = getCellStringValue(row[mapping.invoiceNumber]) || '0';
    const invoiceNumber = parseInt(rawInvoiceNumberStr);
    if (isNaN(invoiceNumber) || invoiceNumber < 0) {
      throw new Error(`Número de factura inválido: ${rawInvoiceNumberStr}`);
    }

    // Campos opcionales
    const emitterName = mapping.emitterName
      ? getCellStringValue(row[mapping.emitterName]).trim() || undefined
      : undefined;

    const totalRaw = mapping.total ? getCellStringValue(row[mapping.total]).trim() : '';
    const total =
      totalRaw && totalRaw !== '0' && totalRaw !== '' ? parseFloat(totalRaw) : undefined;

    const caeRaw = mapping.cae ? getCellStringValue(row[mapping.cae]).trim() : '';
    const cae = caeRaw && caeRaw !== '0' && caeRaw !== '' ? caeRaw : undefined;

    const caeExpiration = mapping.caeExpiration
      ? getCellStringValue(row[mapping.caeExpiration]).trim() || undefined
      : undefined;

    return {
      cuit: normalizedCuit,
      emitterName,
      issueDate,
      invoiceType: invoiceTypeCode,
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
  async getBatchStats(batchId: number): Promise<{
    batch: import('../database/repositories/expected-invoice.js').ImportBatch;
    statusCounts: Record<
      import('../database/repositories/expected-invoice.js').ExpectedInvoiceStatus,
      number
    >;
  }> {
    const batch = await this.repo.findBatchById(batchId);
    if (!batch) {
      throw new Error(`Lote de importación no encontrado: ${batchId}`);
    }

    const statusCounts = await this.repo.countByStatus(batchId);

    return {
      batch,
      statusCounts,
    };
  }

  /**
   * Lista todos los lotes de importación
   */
  async listBatches(
    limit?: number
  ): Promise<import('../database/repositories/expected-invoice.js').ImportBatch[]> {
    return await this.repo.listBatches(limit);
  }
}
