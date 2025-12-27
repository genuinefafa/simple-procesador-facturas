/**
 * Servicio para importar facturas esperadas desde archivos Excel/CSV de AFIP
 */

import ExcelJS from 'exceljs';
import { normalizeCUIT, validateCUIT } from '../validators/cuit.js';
import { ExpectedInvoiceRepository } from '../database/repositories/expected-invoice.js';
import { EmitterRepository } from '../database/repositories/emitter.js';
import { normalizeEmitterName } from '../utils/emitter-name-normalizer.js';
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
  emittersCreated: number;
  emittersExisting: number;
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
  // Columnas adicionales de ARCA para emisores
  emitterDocType?: string;
  emitterDocNumber?: string;
  emitterDenomination?: string;
}

/**
 * Tipo de formato Excel detectado
 */
export type ExcelFormat = 'simple' | 'arca-full';

/**
 * Servicio de importación de Excel/CSV de AFIP
 */
export class ExcelImportService {
  private repo: ExpectedInvoiceRepository;
  private emitterRepo: EmitterRepository;

  constructor() {
    this.repo = new ExpectedInvoiceRepository();
    this.emitterRepo = new EmitterRepository();
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

    // Detectar fila de headers (puede ser fila 1 o 2)
    let headerRowNumber = 1;
    const firstRow = worksheet.getRow(1);
    const firstRowHeaders: string[] = [];
    firstRow.eachCell((cell, colNumber) => {
      firstRowHeaders[colNumber - 1] = getCellStringValue(cell.value).trim();
    });

    // Si todos los headers de la primera fila son iguales, es un título repetido
    // En ese caso, los headers reales están en la fila 2
    const uniqueHeaders = new Set(firstRowHeaders.filter((h) => h !== ''));
    if (uniqueHeaders.size === 1) {
      console.info(`   ⚠️  Fila 1 parece ser un título repetido, usando fila 2 como headers`);
      headerRowNumber = 2;
    }

    // Obtener headers
    const headerRow = worksheet.getRow(headerRowNumber);
    const headers: string[] = [];
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber - 1] = getCellStringValue(cell.value).trim();
    });

    console.info(`   📌 Headers encontrados (fila ${headerRowNumber}): ${headers.join(', ')}`);

    // Auto-detectar formato (simple vs ARCA completo)
    const format = this.detectExcelFormat(headers);
    console.info(
      `   📋 Formato detectado: ${format === 'arca-full' ? 'ARCA completo (con emisores)' : 'Simple'}`
    );

    // Auto-detectar columnas si no se proporciona mapeo
    const mapping = columnMapping || this.autoDetectColumns(headers);
    console.info(`   🔍 Mapeo de columnas:`);
    console.info(`      CUIT: "${mapping.cuit}"`);
    console.info(`      Fecha: "${mapping.issueDate}"`);
    console.info(`      Tipo: "${mapping.invoiceType}"`);
    console.info(`      Punto Venta: "${mapping.pointOfSale}"`);
    console.info(`      Número: "${mapping.invoiceNumber}"`);
    if (format === 'arca-full') {
      console.info(`      Denominación Emisor: "${mapping.emitterDenomination}"`);
      console.info(`      Nro. Doc. Emisor: "${mapping.emitterDocNumber}"`);
    }

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

    // Procesar cada fila (comenzando después de los headers)
    let rowCount = 0;
    const emittersToProcess = new Map<string, { cuit: string; name: string }>();
    const dataStartRow = headerRowNumber + 1;

    worksheet.eachRow((row, rowNumber) => {
      // Saltar filas de título y headers
      if (rowNumber < dataStartRow) return;

      try {
        const rowData: Record<string, ExcelJS.CellValue> = {};
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber - 1];
          if (header) {
            rowData[header] = cell.value;
          }
        });

        // Si es formato ARCA completo, procesar información de emisor
        if (format === 'arca-full' && mapping.emitterDocNumber && mapping.emitterDenomination) {
          const emitterDocNumberRaw = getCellStringValue(rowData[mapping.emitterDocNumber]).trim();
          const emitterDenomination = getCellStringValue(
            rowData[mapping.emitterDenomination]
          ).trim();

          if (emitterDocNumberRaw && emitterDenomination) {
            // Normalizar CUIT del emisor
            const cuitNumerico = emitterDocNumberRaw.replace(/\D/g, '');
            if (cuitNumerico.length === 11) {
              const cuit = `${cuitNumerico.substring(0, 2)}-${cuitNumerico.substring(2, 10)}-${cuitNumerico.substring(10)}`;

              // Validar CUIT
              if (validateCUIT(cuit)) {
                // Normalizar el nombre del emisor (capitalización y abreviación de tipos societarios)
                const normalizedName = normalizeEmitterName(emitterDenomination);
                emittersToProcess.set(cuitNumerico, { cuit, name: normalizedName });
              } else {
                console.warn(`   ⚠️  CUIT inválido en fila ${rowNumber}: ${cuit}`);
              }
            }
          }
        }

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

    // Procesar emisores si es formato ARCA completo
    let emittersCreated = 0;
    let emittersExisting = 0;

    if (format === 'arca-full' && emittersToProcess.size > 0) {
      console.info(`   👥 Procesando ${emittersToProcess.size} emisores únicos...`);

      for (const [cuitNumerico, emitterData] of emittersToProcess) {
        try {
          // Buscar si el emisor ya existe
          const existingEmitter = this.emitterRepo.findByCUIT(emitterData.cuit);

          if (!existingEmitter) {
            // Crear nuevo emisor con nombre normalizado
            this.emitterRepo.create({
              cuit: emitterData.cuit,
              cuitNumeric: cuitNumerico,
              name: emitterData.name,
              legalName: emitterData.name, // ARCA tiene la razón social oficial normalizada
              aliases: [],
            });
            emittersCreated++;
            console.info(`      ✅ Emisor creado: ${emitterData.name} (${emitterData.cuit})`);
          } else {
            emittersExisting++;
            // Siempre actualizar con los datos oficiales de ARCA (normalizados)
            // ARCA/AFIP tiene la razón social correcta y actualizada
            this.emitterRepo.updateName(emitterData.cuit, emitterData.name, emitterData.name);
            console.info(`      🔄 Emisor actualizado: ${emitterData.name} (${emitterData.cuit})`);
          }
        } catch (error) {
          console.error(
            `      ❌ Error procesando emisor ${emitterData.cuit}: ${error instanceof Error ? error.message : 'Error desconocido'}`
          );
        }
      }

      console.info(`   ✅ Emisores creados: ${emittersCreated}`);
      console.info(`   ℹ️  Emisores ya existentes: ${emittersExisting}`);
    }

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
      emittersCreated,
      emittersExisting,
      errors,
    };
  }

  /**
   * Detecta automáticamente el formato del Excel (simple vs ARCA completo)
   */
  private detectExcelFormat(headers: string[]): ExcelFormat {
    const arcaColumns = ['Denominación Emisor', 'Nro. Doc. Emisor', 'Tipo Doc. Emisor'];
    const hasArcaColumns = arcaColumns.every((col) => headers.some((h) => h.trim() === col));
    return hasArcaColumns ? 'arca-full' : 'simple';
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

    const findOptionalColumn = (patterns: string[]): string | undefined => {
      for (const pattern of patterns) {
        const index = normalizedHeaders.findIndex((h) => h.includes(pattern));
        if (index !== -1) {
          const header = headers[index];
          if (header) return header;
        }
      }
      return undefined;
    };

    // Detectar columnas opcionales de ARCA primero
    const emitterDocNumber = findOptionalColumn(['nro. doc. emisor']);
    const emitterDenomination = findOptionalColumn(['denominación emisor', 'denominacion emisor']);
    const emitterDocType = findOptionalColumn(['tipo doc. emisor']);

    // Para la columna CUIT, si no existe una columna específica de CUIT pero existe
    // "Nro. Doc. Emisor" (Excel de comprobantes recibidos), usar esa
    let cuitColumn: string;
    try {
      cuitColumn = findColumn(['cuit', 'nro. cuit', 'numero de cuit']);
    } catch {
      if (emitterDocNumber) {
        console.info(
          `   ℹ️  Usando columna "Nro. Doc. Emisor" como CUIT (Excel de comprobantes recibidos)`
        );
        cuitColumn = emitterDocNumber;
      } else {
        throw new Error('No se pudo auto-detectar columna de CUIT o Nro. Doc. Emisor');
      }
    }

    return {
      cuit: cuitColumn,
      // Si existe "Denominación Emisor" (ARCA completo), usar esa. Si no, buscar por regex
      emitterName:
        emitterDenomination ||
        headers.find((h) => /nombre|razon social|proveedor/i.test(h) && !/tipo doc/i.test(h)),
      issueDate: findColumn(['fecha', 'fecha emision', 'fecha de emision']),
      invoiceType: findColumn(['tipo', 'tipo comprobante', 'comprobante']),
      pointOfSale: findColumn(['punto de venta', 'pto venta', 'punto venta', 'pto. vta']),
      invoiceNumber: findColumn([
        'numero desde',
        'número desde',
        'numero',
        'nro comprobante',
        'numero comprobante',
      ]),
      total: headers.find((h) => /total|importe|monto|imp. total/i.test(h)),
      cae: headers.find((h) => /cae|cód. autorización|codigo autorizacion/i.test(h)),
      // Columnas adicionales de ARCA
      emitterDocType,
      emitterDocNumber,
      emitterDenomination,
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
