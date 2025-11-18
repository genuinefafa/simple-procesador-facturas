/**
 * Repository para la gestión de facturas
 */

import type { Database } from 'better-sqlite3';
import type { Invoice, InvoiceType, Currency, ExtractionMethod } from '../../utils/types';
import { getDatabase } from '../connection';

interface InvoiceRow {
  id: number;
  emisor_cuit: string;
  template_usado_id: number | null;
  fecha_emision: string;
  tipo_comprobante: InvoiceType;
  punto_venta: number;
  numero_comprobante: number;
  comprobante_completo: string;
  total: number | null;
  moneda: Currency;
  archivo_original: string;
  archivo_procesado: string;
  tipo_archivo: 'PDF_DIGITAL' | 'PDF_IMAGEN' | 'IMAGEN';
  file_hash: string | null;
  metodo_extraccion: ExtractionMethod;
  confianza_extraccion: number | null;
  validado_manualmente: number;
  requiere_revision: number;
  procesado_en: string;
}

export class InvoiceRepository {
  private db: Database;

  constructor(db?: Database) {
    this.db = db || getDatabase();
  }

  /**
   * Crea una nueva factura
   * @param data - Datos de la factura
   * @returns La factura creada
   */
  create(data: {
    emitterCuit: string;
    templateUsedId?: number;
    issueDate: Date | string;
    invoiceType: InvoiceType;
    pointOfSale: number;
    invoiceNumber: number;
    total?: number;
    currency?: Currency;
    originalFile: string;
    processedFile: string;
    fileType: 'PDF_DIGITAL' | 'PDF_IMAGEN' | 'IMAGEN';
    extractionMethod: ExtractionMethod;
    extractionConfidence?: number;
    requiresReview?: boolean;
  }): Invoice {
    const fullInvoiceNumber = `${data.invoiceType}-${String(data.pointOfSale).padStart(4, '0')}-${String(data.invoiceNumber).padStart(8, '0')}`;

    // Normalizar fecha
    const issueDateStr = typeof data.issueDate === 'string'
      ? data.issueDate
      : data.issueDate.toISOString().split('T')[0];

    const stmt = this.db.prepare(`
      INSERT INTO facturas (
        emisor_cuit, template_usado_id, fecha_emision, tipo_comprobante,
        punto_venta, numero_comprobante, comprobante_completo, total, moneda,
        archivo_original, archivo_procesado, tipo_archivo,
        metodo_extraccion, confianza_extraccion, requiere_revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.emitterCuit,
      data.templateUsedId || null,
      issueDateStr,
      data.invoiceType,
      data.pointOfSale,
      data.invoiceNumber,
      fullInvoiceNumber,
      data.total ?? null,
      data.currency || 'ARS',
      data.originalFile,
      data.processedFile,
      data.fileType,
      data.extractionMethod,
      data.extractionConfidence || null,
      data.requiresReview ? 1 : 0
    );

    return this.findById(Number(result.lastInsertRowid))!;
  }

  /**
   * Mapea una fila de la base de datos a un objeto Invoice
   */
  private mapRowToInvoice(row: InvoiceRow): Invoice {
    return {
      id: row.id,
      emitterCuit: row.emisor_cuit,
      templateUsedId: row.template_usado_id ?? undefined,
      issueDate: new Date(row.fecha_emision),
      invoiceType: row.tipo_comprobante,
      pointOfSale: row.punto_venta,
      invoiceNumber: row.numero_comprobante,
      fullInvoiceNumber: row.comprobante_completo,
      total: row.total ?? 0,
      currency: row.moneda,
      originalFile: row.archivo_original,
      processedFile: row.archivo_procesado,
      fileType: row.tipo_archivo,
      extractionMethod: row.metodo_extraccion,
      extractionConfidence: row.confianza_extraccion ?? undefined,
      manuallyValidated: row.validado_manualmente === 1,
      requiresReview: row.requiere_revision === 1,
      processedAt: new Date(row.procesado_en),
    };
  }

  /**
   * Busca una factura por ID
   * @param id - ID de la factura
   * @returns Factura o null
   */
  findById(id: number): Invoice | null {
    const stmt = this.db.prepare('SELECT * FROM facturas WHERE id = ?');
    const row = stmt.get(id) as InvoiceRow | undefined;
    return row ? this.mapRowToInvoice(row) : null;
  }

  /**
   * Busca una factura por comprobante
   * @param emitterCuit - CUIT del emisor
   * @param type - Tipo de comprobante
   * @param pointOfSale - Punto de venta
   * @param number - Número de comprobante
   * @returns Factura o null
   */
  findByInvoiceNumber(
    emitterCuit: string,
    type: InvoiceType,
    pointOfSale: number,
    number: number
  ): Invoice | null {
    const stmt = this.db.prepare(`
      SELECT * FROM facturas
      WHERE emisor_cuit = ?
        AND tipo_comprobante = ?
        AND punto_venta = ?
        AND numero_comprobante = ?
    `);

    const row = stmt.get(emitterCuit, type, pointOfSale, number) as InvoiceRow | undefined;
    return row ? this.mapRowToInvoice(row) : null;
  }

  /**
   * Lista facturas con filtros
   * @param filters - Filtros opcionales
   * @returns Array de facturas
   */
  list(filters?: {
    emitterCuit?: string;
    dateFrom?: Date;
    dateTo?: Date;
    minAmount?: number;
    maxAmount?: number;
    invoiceType?: InvoiceType;
    requiresReview?: boolean;
    limit?: number;
    offset?: number;
  }): Invoice[] {
    let query = 'SELECT * FROM facturas WHERE 1=1';
    const params: unknown[] = [];

    if (filters?.emitterCuit) {
      query += ' AND emisor_cuit = ?';
      params.push(filters.emitterCuit);
    }

    if (filters?.dateFrom) {
      query += ' AND fecha_emision >= ?';
      params.push(filters.dateFrom.toISOString().split('T')[0]);
    }

    if (filters?.dateTo) {
      query += ' AND fecha_emision <= ?';
      params.push(filters.dateTo.toISOString().split('T')[0]);
    }

    if (filters?.minAmount !== undefined) {
      query += ' AND total >= ?';
      params.push(filters.minAmount);
    }

    if (filters?.maxAmount !== undefined) {
      query += ' AND total <= ?';
      params.push(filters.maxAmount);
    }

    if (filters?.invoiceType) {
      query += ' AND tipo_comprobante = ?';
      params.push(filters.invoiceType);
    }

    if (filters?.requiresReview !== undefined) {
      query += ' AND requiere_revision = ?';
      params.push(filters.requiresReview ? 1 : 0);
    }

    query += ' ORDER BY fecha_emision DESC, id DESC';

    if (filters?.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    if (filters?.offset) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as InvoiceRow[];
    return rows.map((row) => this.mapRowToInvoice(row));
  }

  /**
   * Marca una factura como validada manualmente
   * @param id - ID de la factura
   */
  markAsValidated(id: number): void {
    const stmt = this.db.prepare(`
      UPDATE facturas
      SET validado_manualmente = 1,
          requiere_revision = 0
      WHERE id = ?
    `);

    stmt.run(id);
  }

  /**
   * Actualiza la ruta del archivo procesado
   * @param id - ID de la factura
   * @param processedFile - Nueva ruta del archivo
   */
  updateProcessedFile(id: number, processedFile: string): void {
    const stmt = this.db.prepare(`
      UPDATE facturas
      SET archivo_procesado = ?
      WHERE id = ?
    `);

    stmt.run(processedFile, id);
  }

  /**
   * Busca una factura por emisor y número completo
   * @param emitterCuit - CUIT del emisor
   * @param type - Tipo de comprobante
   * @param pointOfSale - Punto de venta
   * @param number - Número de comprobante
   * @returns Factura o null
   */
  findByEmitterAndNumber(
    emitterCuit: string,
    type: InvoiceType,
    pointOfSale: number,
    number: number
  ): Invoice | null {
    return this.findByInvoiceNumber(emitterCuit, type, pointOfSale, number);
  }

  /**
   * Cuenta facturas según filtros
   * @param filters - Filtros opcionales
   * @returns Cantidad de facturas
   */
  count(filters?: { emitterCuit?: string; requiresReview?: boolean }): number {
    let query = 'SELECT COUNT(*) as count FROM facturas WHERE 1=1';
    const params: unknown[] = [];

    if (filters?.emitterCuit) {
      query += ' AND emisor_cuit = ?';
      params.push(filters.emitterCuit);
    }

    if (filters?.requiresReview !== undefined) {
      query += ' AND requiere_revision = ?';
      params.push(filters.requiresReview ? 1 : 0);
    }

    const stmt = this.db.prepare(query);
    const result = stmt.get(...params) as { count: number };
    return result.count;
  }
}
