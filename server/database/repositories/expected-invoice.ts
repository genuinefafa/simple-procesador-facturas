/**
 * Repository para la gestión de facturas esperadas (desde Excel AFIP)
 */

import type { Database } from 'better-sqlite3';
import { getDatabase } from '../connection';

export type ExpectedInvoiceStatus = 'pending' | 'matched' | 'discrepancy' | 'manual' | 'ignored';

export interface ExpectedInvoice {
  id: number;
  importBatchId: number | null;
  cuit: string;
  emitterName: string | null;
  issueDate: string;
  invoiceType: string;
  pointOfSale: number;
  invoiceNumber: number;
  total: number | null;
  cae: string | null;
  caeExpiration: string | null;
  currency: string | null;
  status: ExpectedInvoiceStatus;
  matchedPendingFileId: number | null;
  matchedInvoiceId: number | null;
  matchConfidence: number | null;
  importDate: string;
  notes: string | null;
}

interface ExpectedInvoiceRow {
  id: number;
  import_batch_id: number | null;
  cuit: string;
  emitter_name: string | null;
  issue_date: string;
  invoice_type: string;
  point_of_sale: number;
  invoice_number: number;
  total: number | null;
  cae: string | null;
  cae_expiration: string | null;
  currency: string | null;
  status: ExpectedInvoiceStatus;
  matched_pending_file_id: number | null;
  matched_invoice_id: number | null;
  match_confidence: number | null;
  import_date: string;
  notes: string | null;
}

export interface ImportBatch {
  id: number;
  filename: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  errorRows: number;
  importDate: string;
  notes: string | null;
}

interface ImportBatchRow {
  id: number;
  filename: string;
  total_rows: number;
  imported_rows: number;
  skipped_rows: number;
  error_rows: number;
  import_date: string;
  notes: string | null;
}

export class ExpectedInvoiceRepository {
  private db: Database;

  constructor(db?: Database) {
    this.db = db || getDatabase();
  }

  /**
   * Convierte una fila de base de datos a objeto ExpectedInvoice
   */
  private rowToObject(row: ExpectedInvoiceRow): ExpectedInvoice {
    return {
      id: row.id,
      importBatchId: row.import_batch_id,
      cuit: row.cuit,
      emitterName: row.emitter_name,
      issueDate: row.issue_date,
      invoiceType: row.invoice_type,
      pointOfSale: row.point_of_sale,
      invoiceNumber: row.invoice_number,
      total: row.total,
      cae: row.cae,
      caeExpiration: row.cae_expiration,
      currency: row.currency,
      status: row.status,
      matchedPendingFileId: row.matched_pending_file_id,
      matchedInvoiceId: row.matched_invoice_id,
      matchConfidence: row.match_confidence,
      importDate: row.import_date,
      notes: row.notes,
    };
  }

  /**
   * Convierte una fila de batch a objeto ImportBatch
   */
  private batchRowToObject(row: ImportBatchRow): ImportBatch {
    return {
      id: row.id,
      filename: row.filename,
      totalRows: row.total_rows,
      importedRows: row.imported_rows,
      skippedRows: row.skipped_rows,
      errorRows: row.error_rows,
      importDate: row.import_date,
      notes: row.notes,
    };
  }

  // =============================================================================
  // GESTIÓN DE LOTES DE IMPORTACIÓN
  // =============================================================================

  /**
   * Crea un nuevo lote de importación
   */
  createBatch(data: {
    filename: string;
    totalRows: number;
    importedRows?: number;
    skippedRows?: number;
    errorRows?: number;
    notes?: string;
  }): ImportBatch {
    const stmt = this.db.prepare(`
      INSERT INTO import_batches (
        filename, total_rows, imported_rows, skipped_rows, error_rows, notes
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.filename,
      data.totalRows,
      data.importedRows || 0,
      data.skippedRows || 0,
      data.errorRows || 0,
      data.notes || null
    );

    const batch = this.findBatchById(Number(result.lastInsertRowid));
    if (!batch) {
      throw new Error('Failed to create import batch');
    }

    return batch;
  }

  /**
   * Busca un lote por ID
   */
  findBatchById(id: number): ImportBatch | null {
    const stmt = this.db.prepare('SELECT * FROM import_batches WHERE id = ?');
    const row = stmt.get(id) as ImportBatchRow | undefined;

    return row ? this.batchRowToObject(row) : null;
  }

  /**
   * Actualiza un lote de importación
   */
  updateBatch(
    id: number,
    data: {
      importedRows?: number;
      skippedRows?: number;
      errorRows?: number;
      notes?: string;
    }
  ): ImportBatch {
    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (data.importedRows !== undefined) {
      updates.push('imported_rows = ?');
      params.push(data.importedRows);
    }
    if (data.skippedRows !== undefined) {
      updates.push('skipped_rows = ?');
      params.push(data.skippedRows);
    }
    if (data.errorRows !== undefined) {
      updates.push('error_rows = ?');
      params.push(data.errorRows);
    }
    if (data.notes !== undefined) {
      updates.push('notes = ?');
      params.push(data.notes);
    }

    if (updates.length === 0) {
      throw new Error('No fields to update');
    }

    const query = `UPDATE import_batches SET ${updates.join(', ')} WHERE id = ?`;
    params.push(id);

    const stmt = this.db.prepare(query);
    stmt.run(...params);

    const updated = this.findBatchById(id);
    if (!updated) {
      throw new Error('Import batch not found after update');
    }

    return updated;
  }

  /**
   * Lista todos los lotes de importación
   */
  listBatches(limit?: number): ImportBatch[] {
    let query = 'SELECT * FROM import_batches ORDER BY import_date DESC';

    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all() as ImportBatchRow[];

    return rows.map((row) => this.batchRowToObject(row));
  }

  // =============================================================================
  // GESTIÓN DE FACTURAS ESPERADAS
  // =============================================================================

  /**
   * Crea múltiples facturas esperadas en un lote
   */
  createManyInvoices(
    invoices: Array<{
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
    }>,
    batchId: number
  ): ExpectedInvoice[] {
    const stmt = this.db.prepare(`
      INSERT INTO expected_invoices (
        import_batch_id, cuit, emitter_name, issue_date, invoice_type,
        point_of_sale, invoice_number, total, cae, cae_expiration, currency
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const created: ExpectedInvoice[] = [];

    // Usar transacción para insertar todos los registros
    const insertMany = this.db.transaction((invoicesToInsert) => {
      for (const invoice of invoicesToInsert) {
        try {
          const result = stmt.run(
            batchId,
            invoice.cuit,
            invoice.emitterName || null,
            invoice.issueDate,
            invoice.invoiceType,
            invoice.pointOfSale,
            invoice.invoiceNumber,
            invoice.total || null,
            invoice.cae || null,
            invoice.caeExpiration || null,
            invoice.currency || 'ARS'
          );

          const newInvoice = this.findById(Number(result.lastInsertRowid));
          if (newInvoice) {
            created.push(newInvoice);
          }
        } catch (error) {
          // Si falla por duplicado, continuar con el siguiente
          console.warn(
            `Factura duplicada: ${invoice.invoiceType}-${invoice.pointOfSale}-${invoice.invoiceNumber}`,
            error
          );
        }
      }
    });

    insertMany(invoices);

    return created;
  }

  /**
   * Busca una factura esperada por ID
   */
  findById(id: number): ExpectedInvoice | null {
    const stmt = this.db.prepare('SELECT * FROM expected_invoices WHERE id = ?');
    const row = stmt.get(id) as ExpectedInvoiceRow | undefined;

    return row ? this.rowToObject(row) : null;
  }

  /**
   * Busca candidatos para matching según criterios
   */
  findCandidates(criteria: {
    cuit: string;
    dateRange?: [string, string]; // [fecha_desde, fecha_hasta]
    totalRange?: [number, number]; // [total_min, total_max]
    status?: ExpectedInvoiceStatus[];
  }): ExpectedInvoice[] {
    let query = 'SELECT * FROM expected_invoices WHERE cuit = ?';
    const params: (string | number)[] = [criteria.cuit];

    if (criteria.dateRange) {
      query += ' AND issue_date BETWEEN ? AND ?';
      params.push(criteria.dateRange[0], criteria.dateRange[1]);
    }

    if (criteria.totalRange) {
      query += ' AND total BETWEEN ? AND ?';
      params.push(criteria.totalRange[0], criteria.totalRange[1]);
    }

    if (criteria.status && criteria.status.length > 0) {
      const placeholders = criteria.status.map(() => '?').join(',');
      query += ` AND status IN (${placeholders})`;
      params.push(...criteria.status);
    } else {
      // Por defecto solo buscar en pending
      query += " AND status = 'pending'";
    }

    query += ' ORDER BY issue_date DESC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as ExpectedInvoiceRow[];

    return rows.map((row) => this.rowToObject(row));
  }

  /**
   * Busca un match exacto por todos los campos clave
   */
  findExactMatch(
    cuit: string,
    type: string,
    pointOfSale: number,
    invoiceNumber: number
  ): ExpectedInvoice | null {
    const stmt = this.db.prepare(`
      SELECT * FROM expected_invoices
      WHERE cuit = ? AND invoice_type = ? AND point_of_sale = ? AND invoice_number = ?
      AND status = 'pending'
      LIMIT 1
    `);

    const row = stmt.get(cuit, type, pointOfSale, invoiceNumber) as ExpectedInvoiceRow | undefined;

    return row ? this.rowToObject(row) : null;
  }

  /**
   * Lista facturas esperadas con filtros
   */
  list(filters?: {
    status?: ExpectedInvoiceStatus | ExpectedInvoiceStatus[];
    batchId?: number;
    cuit?: string;
    limit?: number;
    offset?: number;
  }): ExpectedInvoice[] {
    let query = 'SELECT * FROM expected_invoices WHERE 1=1';
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

    if (filters?.batchId) {
      query += ' AND import_batch_id = ?';
      params.push(filters.batchId);
    }

    if (filters?.cuit) {
      query += ' AND cuit = ?';
      params.push(filters.cuit);
    }

    query += ' ORDER BY issue_date DESC';

    if (filters?.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    if (filters?.offset) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as ExpectedInvoiceRow[];

    return rows.map((row) => this.rowToObject(row));
  }

  /**
   * Marca una factura esperada como matcheada
   */
  markAsMatched(
    id: number,
    pendingFileId: number,
    invoiceId: number,
    confidence: number
  ): ExpectedInvoice {
    const stmt = this.db.prepare(`
      UPDATE expected_invoices
      SET status = 'matched',
          matched_pending_file_id = ?,
          matched_invoice_id = ?,
          match_confidence = ?
      WHERE id = ?
    `);

    stmt.run(pendingFileId, invoiceId, confidence, id);

    const updated = this.findById(id);
    if (!updated) {
      throw new Error('Expected invoice not found after marking as matched');
    }

    return updated;
  }

  /**
   * Marca una factura esperada como procesada manualmente
   */
  markAsManual(id: number, notes?: string): ExpectedInvoice {
    const stmt = this.db.prepare(`
      UPDATE expected_invoices
      SET status = 'manual', notes = ?
      WHERE id = ?
    `);

    stmt.run(notes || null, id);

    const updated = this.findById(id);
    if (!updated) {
      throw new Error('Expected invoice not found after marking as manual');
    }

    return updated;
  }

  /**
   * Marca una factura esperada como ignorada
   */
  markAsIgnored(id: number, notes?: string): ExpectedInvoice {
    const stmt = this.db.prepare(`
      UPDATE expected_invoices
      SET status = 'ignored', notes = ?
      WHERE id = ?
    `);

    stmt.run(notes || null, id);

    const updated = this.findById(id);
    if (!updated) {
      throw new Error('Expected invoice not found after marking as ignored');
    }

    return updated;
  }

  /**
   * Cuenta facturas esperadas por estado
   */
  countByStatus(batchId?: number): Record<ExpectedInvoiceStatus, number> {
    let query = `
      SELECT status, COUNT(*) as count
      FROM expected_invoices
    `;

    const params: number[] = [];

    if (batchId) {
      query += ' WHERE import_batch_id = ?';
      params.push(batchId);
    }

    query += ' GROUP BY status';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as { status: ExpectedInvoiceStatus; count: number }[];

    const counts: Record<ExpectedInvoiceStatus, number> = {
      pending: 0,
      matched: 0,
      discrepancy: 0,
      manual: 0,
      ignored: 0,
    };

    for (const row of rows) {
      counts[row.status] = row.count;
    }

    return counts;
  }

  /**
   * Lista facturas esperadas pendientes (sin match)
   */
  listPending(limit?: number): ExpectedInvoice[] {
    return this.list({ status: 'pending', limit });
  }

  /**
   * Lista facturas esperadas matcheadas
   */
  listMatched(batchId?: number): ExpectedInvoice[] {
    return this.list({ status: 'matched', batchId });
  }

  /**
   * Lista facturas esperadas sin match
   */
  listUnmatched(batchId?: number): ExpectedInvoice[] {
    return this.list({ status: 'pending', batchId });
  }
}
