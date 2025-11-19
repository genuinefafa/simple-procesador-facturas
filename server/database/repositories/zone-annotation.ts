/**
 * Repository para gestión de zonas anotadas en facturas
 */

import type { Database } from 'better-sqlite3';
import { getDatabase } from '../connection.js';

export interface ZoneAnnotation {
  id: number;
  invoiceId: number;
  field: string;
  x: number;
  y: number;
  width: number;
  height: number;
  extractedValue?: string;
  annotatedAt: Date;
  annotatedBy: string;
  usedForTemplate: boolean;
}

interface ZoneAnnotationRow {
  id: number;
  factura_id: number;
  campo: string;
  x: number;
  y: number;
  width: number;
  height: number;
  valor_extraido: string | null;
  anotado_en: string;
  anotado_por: string;
  usado_para_template: number;
}

export class ZoneAnnotationRepository {
  private db: Database;

  constructor(db?: Database) {
    this.db = db || getDatabase();
  }

  /**
   * Crea una nueva anotación de zona
   */
  create(data: {
    invoiceId: number;
    field: string;
    x: number;
    y: number;
    width: number;
    height: number;
    extractedValue?: string;
  }): ZoneAnnotation {
    const stmt = this.db.prepare(`
      INSERT INTO facturas_zonas_anotadas (
        factura_id, campo, x, y, width, height, valor_extraido
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.invoiceId,
      data.field,
      data.x,
      data.y,
      data.width,
      data.height,
      data.extractedValue || null
    );

    return this.findById(Number(result.lastInsertRowid))!;
  }

  /**
   * Busca una anotación por ID
   */
  findById(id: number): ZoneAnnotation | null {
    const stmt = this.db.prepare('SELECT * FROM facturas_zonas_anotadas WHERE id = ?');
    const row = stmt.get(id) as ZoneAnnotationRow | undefined;
    return row ? this.mapRowToZoneAnnotation(row) : null;
  }

  /**
   * Obtiene todas las anotaciones de una factura
   */
  findByInvoiceId(invoiceId: number): ZoneAnnotation[] {
    const stmt = this.db.prepare(
      'SELECT * FROM facturas_zonas_anotadas WHERE factura_id = ? ORDER BY anotado_en ASC'
    );
    const rows = stmt.all(invoiceId) as ZoneAnnotationRow[];
    return rows.map((row) => this.mapRowToZoneAnnotation(row));
  }

  /**
   * Elimina todas las anotaciones de una factura
   */
  deleteByInvoiceId(invoiceId: number): void {
    const stmt = this.db.prepare('DELETE FROM facturas_zonas_anotadas WHERE factura_id = ?');
    stmt.run(invoiceId);
  }

  /**
   * Elimina una anotación específica
   */
  deleteById(id: number): void {
    const stmt = this.db.prepare('DELETE FROM facturas_zonas_anotadas WHERE id = ?');
    stmt.run(id);
  }

  /**
   * Marca anotaciones como usadas para template
   */
  markAsUsedForTemplate(invoiceId: number): void {
    const stmt = this.db.prepare(`
      UPDATE facturas_zonas_anotadas
      SET usado_para_template = 1
      WHERE factura_id = ?
    `);
    stmt.run(invoiceId);
  }

  /**
   * Mapea una fila de la base de datos a un objeto ZoneAnnotation
   */
  private mapRowToZoneAnnotation(row: ZoneAnnotationRow): ZoneAnnotation {
    return {
      id: row.id,
      invoiceId: row.factura_id,
      field: row.campo,
      x: row.x,
      y: row.y,
      width: row.width,
      height: row.height,
      extractedValue: row.valor_extraido ?? undefined,
      annotatedAt: new Date(row.anotado_en),
      annotatedBy: row.anotado_por,
      usedForTemplate: row.usado_para_template === 1,
    };
  }
}
