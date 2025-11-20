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
    extractionErrors?: string | string[];
    status?: PendingFileStatus;
  }): PendingFile {
    // Convertir array de errores a JSON string si es necesario
    const extractionErrors =
      data.extractionErrors && Array.isArray(data.extractionErrors)
        ? JSON.stringify(data.extractionErrors)
        : data.extractionErrors || null;

    const stmt = this.db.prepare(`
      INSERT INTO pending_files (
        original_filename, file_path, file_size,
        extracted_cuit, extracted_date, extracted_total, extracted_type,
        extracted_point_of_sale, extracted_invoice_number,
        extraction_confidence, extraction_errors, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      extractionErrors,
      data.status || 'pending'
    );

    return this.findById(Number(result.lastInsertRowid))!;
  }

  /**
   * Busca un archivo pendiente por ID
   */
  findById(id: number): PendingFile | null {
    const stmt = this.db.prepare('SELECT * FROM pending_files WHERE id = ?');
    const row = stmt.get(id) as PendingFileRow | undefined;

    return row ? this.mapRowToPendingFile(row) : null;
  }

  /**
   * Lista archivos pendientes con filtros opcionales
   */
  list(filters?: {
    status?: PendingFileStatus | PendingFileStatus[];
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }): PendingFile[] {
    let query = 'SELECT * FROM pending_files WHERE 1=1';
    const params: any[] = [];

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

    if (filters?.dateFrom) {
      query += ' AND upload_date >= ?';
      params.push(filters.dateFrom);
    }

    if (filters?.dateTo) {
      query += ' AND upload_date <= ?';
      params.push(filters.dateTo);
    }

    query += ' ORDER BY upload_date DESC';

    if (filters?.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);

      if (filters?.offset) {
        query += ' OFFSET ?';
        params.push(filters.offset);
      }
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as PendingFileRow[];

    return rows.map(this.mapRowToPendingFile);
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
      extractionErrors?: string | string[];
    }
  ): PendingFile | null {
    const updates: string[] = [];
    const params: any[] = [];

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
    if (data.extractionErrors !== undefined) {
      updates.push('extraction_errors = ?');
      const errors =
        Array.isArray(data.extractionErrors)
          ? JSON.stringify(data.extractionErrors)
          : data.extractionErrors;
      params.push(errors);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    params.push(id);
    const stmt = this.db.prepare(`
      UPDATE pending_files
      SET ${updates.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...params);
    return this.findById(id);
  }

  /**
   * Actualiza el estado de un archivo pendiente
   */
  updateStatus(id: number, status: PendingFileStatus): PendingFile | null {
    const stmt = this.db.prepare('UPDATE pending_files SET status = ? WHERE id = ?');
    stmt.run(status, id);
    return this.findById(id);
  }

  /**
   * Asocia un archivo pendiente con una factura procesada
   */
  linkToInvoice(id: number, invoiceId: number): PendingFile | null {
    const stmt = this.db.prepare(`
      UPDATE pending_files
      SET invoice_id = ?, status = 'processed'
      WHERE id = ?
    `);
    stmt.run(invoiceId, id);
    return this.findById(id);
  }

  /**
   * Elimina un archivo pendiente
   */
  delete(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM pending_files WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Cuenta archivos pendientes por estado
   */
  countByStatus(status?: PendingFileStatus): number {
    let query = 'SELECT COUNT(*) as count FROM pending_files';
    const params: any[] = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    const stmt = this.db.prepare(query);
    const result = stmt.get(...params) as { count: number };
    return result.count;
  }

  /**
   * Mapea una fila de la base de datos a un objeto PendingFile
   */
  private mapRowToPendingFile(row: PendingFileRow): PendingFile {
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
      extractionErrors: row.extraction_errors,
      status: row.status,
      invoiceId: row.invoice_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
