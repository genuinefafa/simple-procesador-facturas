/**
 * Repository para la gestión de emisores
 */

import type { Database } from 'better-sqlite3';
import type { Emitter } from '../../utils/types';
import { getDatabase } from '../connection';

export class EmitterRepository {
  private db: Database;

  constructor(db?: Database) {
    this.db = db || getDatabase();
  }

  /**
   * Busca un emisor por CUIT
   * @param cuit - CUIT del emisor (con o sin guiones)
   * @returns Emisor o null si no existe
   */
  findByCUIT(cuit: string): Emitter | null {
    const cleaned = cuit.replace(/[-\s]/g, '');

    const stmt = this.db.prepare(`
      SELECT * FROM emisores WHERE cuit_numerico = ?
    `);

    const row = stmt.get(cleaned) as Emitter | undefined;
    return row || null;
  }

  /**
   * Crea un nuevo emisor
   * @param data - Datos del emisor
   * @returns El emisor creado
   */
  create(data: {
    cuit: string;
    cuitNumeric: string;
    name: string;
    legalName?: string;
    personType?: 'FISICA' | 'JURIDICA';
  }): Emitter {
    const stmt = this.db.prepare(`
      INSERT INTO emisores (
        cuit, cuit_numerico, nombre, razon_social, tipo_persona
      ) VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      data.cuit,
      data.cuitNumeric,
      data.name,
      data.legalName || null,
      data.personType || null
    );

    return this.findByCUIT(data.cuit)!;
  }

  /**
   * Actualiza el template preferido de un emisor
   * @param cuit - CUIT del emisor
   * @param templateId - ID del template
   */
  updatePreferredTemplate(cuit: string, templateId: number): void {
    const stmt = this.db.prepare(`
      UPDATE emisores
      SET template_preferido_id = ?,
          template_auto_detectado = 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE cuit = ?
    `);

    stmt.run(templateId, cuit);
  }

  /**
   * Lista todos los emisores
   * @param filters - Filtros opcionales
   * @returns Array de emisores
   */
  list(filters?: { active?: boolean }): Emitter[] {
    let query = 'SELECT * FROM emisores WHERE 1=1';
    const params: unknown[] = [];

    if (filters?.active !== undefined) {
      query += ' AND activo = ?';
      params.push(filters.active ? 1 : 0);
    }

    query += ' ORDER BY nombre ASC';

    const stmt = this.db.prepare(query);
    return stmt.all(...params) as Emitter[];
  }

  /**
   * Obtiene estadísticas de un emisor
   * @param cuit - CUIT del emisor
   * @returns Estadísticas o null
   */
  getStats(cuit: string): {
    totalInvoices: number;
    totalAmount: number;
    firstInvoiceDate: string | null;
    lastInvoiceDate: string | null;
  } | null {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as totalInvoices,
        COALESCE(SUM(total), 0) as totalAmount,
        MIN(fecha_emision) as firstInvoiceDate,
        MAX(fecha_emision) as lastInvoiceDate
      FROM facturas
      WHERE emisor_cuit = ?
    `);

    const result = stmt.get(cuit) as
      | {
          totalInvoices: number;
          totalAmount: number;
          firstInvoiceDate: string | null;
          lastInvoiceDate: string | null;
        }
      | undefined;

    return result || null;
  }
}
