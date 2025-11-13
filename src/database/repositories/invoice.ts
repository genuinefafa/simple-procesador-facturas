/**
 * Repository para la gestión de facturas
 */

import type { Database } from 'better-sqlite3';
import type { Invoice, InvoiceType, Currency, ExtractionMethod } from '../../utils/types';
import { getDatabase } from '../connection';

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
    issueDate: Date;
    invoiceType: InvoiceType;
    pointOfSale: number;
    invoiceNumber: number;
    total: number;
    currency?: Currency;
    originalFile: string;
    processedFile: string;
    fileType: 'PDF_DIGITAL' | 'PDF_IMAGEN' | 'IMAGEN';
    extractionMethod: ExtractionMethod;
    extractionConfidence?: number;
    requiresReview?: boolean;
  }): Invoice {
    const fullInvoiceNumber = `${data.invoiceType}-${String(data.pointOfSale).padStart(4, '0')}-${String(data.invoiceNumber).padStart(8, '0')}`;

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
      data.issueDate.toISOString().split('T')[0],
      data.invoiceType,
      data.pointOfSale,
      data.invoiceNumber,
      fullInvoiceNumber,
      data.total,
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
   * Busca una factura por ID
   * @param id - ID de la factura
   * @returns Factura o null
   */
  findById(id: number): Invoice | null {
    const stmt = this.db.prepare('SELECT * FROM facturas WHERE id = ?');
    const row = stmt.get(id) as Invoice | undefined;
    return row || null;
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

    const row = stmt.get(emitterCuit, type, pointOfSale, number) as Invoice | undefined;
    return row || null;
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
    return stmt.all(...params) as Invoice[];
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
