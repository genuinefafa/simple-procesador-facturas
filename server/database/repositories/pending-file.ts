/**
 * Repository para la gestión de archivos pendientes
 */

import type { Database } from 'better-sqlite3';
import { getDatabase } from '../connection';

export type PendingFileStatus = 'pending' | 'reviewing' | 'processed' | 'failed';

export interface PendingFile {
  id: number;
  originalFilename: string;
  filePath: string;
  fileSize: number | null;
  uploadDate: string;
  extractedCuit: string | null;
  extractedDate: string | null;
  extractedTotal: number | null;
  extractedType: string | null;
  extractedPointOfSale: number | null;
  extractedInvoiceNumber: number | null;
  extractionConfidence: number | null;
  extractionMethod: string | null; // PDF_TEXT, OCR, TEMPLATE, MANUAL
  extractionErrors: string | null;
  status: PendingFileStatus;
  invoiceId: number | null;
  createdAt: string;
  updatedAt: string;
}

interface PendingFileRow {
  id: number;
  original_filename: string;
  file_path: string;
  file_size: number | null;
  upload_date: string;
  extracted_cuit: string | null;
  extracted_date: string | null;
  extracted_total: number | null;
  extracted_type: string | null;
  extracted_point_of_sale: number | null;
  extracted_invoice_number: number | null;
  extraction_confidence: number | null;
  extraction_method: string | null;
  extraction_errors: string | null;
  status: PendingFileStatus;
  invoice_id: number | null;
  created_at: string;
  updated_at: string;
}

export class PendingFileRepository {
  private db: Database;

  constructor(db?: Database) {
    this.db = db || getDatabase();
  }

  /**
   * Convierte una fila de base de datos a objeto PendingFile
   */
  private rowToObject(row: PendingFileRow): PendingFile {
    return {
      id: row.id,
      originalFilename: row.original_filename,
      filePath: row.file_path,
      fileSize: row.file_size,
      uploadDate: row.upload_date,
      extractedCuit: row.extracted_cuit,
      extractedDate: row.extracted_date,
      extractedTotal: row.extracted_total,
      extractedType: row.extracted_type,
      extractedPointOfSale: row.extracted_point_of_sale,
      extractedInvoiceNumber: row.extracted_invoice_number,
      extractionConfidence: row.extraction_confidence,
      extractionMethod: row.extraction_method,
      extractionErrors: row.extraction_errors,
      status: row.status,
      invoiceId: row.invoice_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Crea un nuevo registro de archivo pendiente
   */
  create(data: {
    originalFilename: string;
    filePath: string;
    fileSize?: number;
    extractedCuit?: string;
    extractedDate?: string;
    extractedTotal?: number;
    extractedType?: string;
    extractedPointOfSale?: number;
    extractedInvoiceNumber?: number;
    extractionConfidence?: number;
    extractionMethod?: string; // PDF_TEXT, OCR, TEMPLATE, MANUAL
    extractionErrors?: string | string[];
    status?: PendingFileStatus;
  }): PendingFile {
    // Serializar errores si es un array
    const errorsJson =
      data.extractionErrors && Array.isArray(data.extractionErrors)
        ? JSON.stringify(data.extractionErrors)
        : data.extractionErrors || null;

    const stmt = this.db.prepare(`
      INSERT INTO pending_files (
        original_filename, file_path, file_size,
        extracted_cuit, extracted_date, extracted_total,
        extracted_type, extracted_point_of_sale, extracted_invoice_number,
        extraction_confidence, extraction_method, extraction_errors, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.originalFilename,
      data.filePath,
      data.fileSize || null,
      data.extractedCuit || null,
      data.extractedDate || null,
      data.extractedTotal || null,
      data.extractedType || null,
      data.extractedPointOfSale || null,
      data.extractedInvoiceNumber || null,
      data.extractionConfidence || null,
      data.extractionMethod || null,
      errorsJson,
      data.status || 'pending'
    );

    const created = this.findById(Number(result.lastInsertRowid));
    if (!created) {
      throw new Error('Failed to create pending file record');
    }

    return created;
  }

  /**
   * Busca un archivo pendiente por ID
   */
  findById(id: number): PendingFile | null {
    const stmt = this.db.prepare('SELECT * FROM pending_files WHERE id = ?');
    const row = stmt.get(id) as PendingFileRow | undefined;

    return row ? this.rowToObject(row) : null;
  }

  /**
   * Lista archivos pendientes con filtros
   */
  list(filters?: {
    status?: PendingFileStatus | PendingFileStatus[];
    limit?: number;
    offset?: number;
  }): PendingFile[] {
    let query = 'SELECT * FROM pending_files WHERE 1=1';
    const params: (string | number)[] = [];

    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        const placeholders = filters.status.map(() => '?').join(',');
        query += ` AND status IN (${placeholders})`;
        params.push(...filters.status);
      } else {
        query += ' AND status = ?';
        params.push(filters.status);
      }
    }

    query += ' ORDER BY upload_date DESC';

    if (filters?.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    if (filters?.offset) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as PendingFileRow[];

    return rows.map((row) => this.rowToObject(row));
  }

  /**
   * Actualiza los datos extraídos de un archivo pendiente
   */
  updateExtractedData(
    id: number,
    data: {
      extractedCuit?: string;
      extractedDate?: string;
      extractedTotal?: number;
      extractedType?: string;
      extractedPointOfSale?: number;
      extractedInvoiceNumber?: number;
      extractionConfidence?: number;
      extractionMethod?: string;
      extractionErrors?: string | string[];
    }
  ): PendingFile {
    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (data.extractedCuit !== undefined) {
      updates.push('extracted_cuit = ?');
      params.push(data.extractedCuit);
    }
    if (data.extractedDate !== undefined) {
      updates.push('extracted_date = ?');
      params.push(data.extractedDate);
    }
    if (data.extractedTotal !== undefined) {
      updates.push('extracted_total = ?');
      params.push(data.extractedTotal);
    }
    if (data.extractedType !== undefined) {
      updates.push('extracted_type = ?');
      params.push(data.extractedType);
    }
    if (data.extractedPointOfSale !== undefined) {
      updates.push('extracted_point_of_sale = ?');
      params.push(data.extractedPointOfSale);
    }
    if (data.extractedInvoiceNumber !== undefined) {
      updates.push('extracted_invoice_number = ?');
      params.push(data.extractedInvoiceNumber);
    }
    if (data.extractionConfidence !== undefined) {
      updates.push('extraction_confidence = ?');
      params.push(data.extractionConfidence);
    }
    if (data.extractionMethod !== undefined) {
      updates.push('extraction_method = ?');
      params.push(data.extractionMethod);
    }
    if (data.extractionErrors !== undefined) {
      const errorsJson = Array.isArray(data.extractionErrors)
        ? JSON.stringify(data.extractionErrors)
        : data.extractionErrors;
      updates.push('extraction_errors = ?');
      params.push(errorsJson);
    }

    if (updates.length === 0) {
      throw new Error('No fields to update');
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');

    const query = `UPDATE pending_files SET ${updates.join(', ')} WHERE id = ?`;
    params.push(id);

    const stmt = this.db.prepare(query);
    stmt.run(...params);

    const updated = this.findById(id);
    if (!updated) {
      throw new Error('Pending file not found after update');
    }

    return updated;
  }

  /**
   * Actualiza el estado de un archivo pendiente
   */
  updateStatus(id: number, status: PendingFileStatus): PendingFile {
    const stmt = this.db.prepare(`
      UPDATE pending_files
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(status, id);

    const updated = this.findById(id);
    if (!updated) {
      throw new Error('Pending file not found after status update');
    }

    return updated;
  }

  /**
   * Vincula un archivo pendiente con una factura procesada
   */
  linkToInvoice(id: number, invoiceId: number): PendingFile {
    const stmt = this.db.prepare(`
      UPDATE pending_files
      SET invoice_id = ?, status = 'processed', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(invoiceId, id);

    const updated = this.findById(id);
    if (!updated) {
      throw new Error('Pending file not found after linking to invoice');
    }

    return updated;
  }

  /**
   * Elimina un registro de archivo pendiente
   */
  delete(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM pending_files WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Cuenta archivos pendientes por estado
   */
  countByStatus(): Record<PendingFileStatus, number> {
    const stmt = this.db.prepare(`
      SELECT status, COUNT(*) as count
      FROM pending_files
      GROUP BY status
    `);
    const rows = stmt.all() as { status: PendingFileStatus; count: number }[];

    const counts: Record<PendingFileStatus, number> = {
      pending: 0,
      reviewing: 0,
      processed: 0,
      failed: 0,
    };

    for (const row of rows) {
      counts[row.status] = row.count;
    }

    return counts;
  }
}
