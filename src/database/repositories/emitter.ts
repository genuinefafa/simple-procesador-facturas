/**
 * Repository para la gestión de emisores
 */

import type { Database } from 'better-sqlite3';
import type { Emitter } from '../../utils/types';
import { getDatabase } from '../connection';

/**
 * Interfaz para fila de emisor desde la base de datos
 */
interface EmitterRow {
  cuit: string;
  cuit_numerico: string;
  nombre: string;
  razon_social: string | null;
  aliases: string | null;
  template_preferido_id: number | null;
  template_auto_detectado: number;
  config_override: string | null;
  tipo_persona: string | null;
  activo: number;
  primera_factura_fecha: string | null;
  ultima_factura_fecha: string | null;
  total_facturas: number;
  created_at: string;
  updated_at: string;
}

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

    const row = stmt.get(cleaned) as EmitterRow | undefined;
    if (!row) return null;

    // Parsear aliases desde JSON
    return this.mapRowToEmitter(row);
  }

  /**
   * Mapea una fila de DB a un objeto Emitter
   * @param row - Fila de la base de datos
   * @returns Objeto Emitter
   */
  private mapRowToEmitter(row: EmitterRow): Emitter {
    return {
      cuit: row.cuit,
      cuitNumeric: row.cuit_numerico,
      name: row.nombre,
      legalName: row.razon_social ?? undefined,
      aliases: row.aliases ? (JSON.parse(row.aliases) as string[]) : [],
      templateId: row.template_preferido_id ?? undefined,
      configOverride: row.config_override ?? undefined,
      personType: (row.tipo_persona as 'FISICA' | 'JURIDICA' | null) ?? undefined,
      active: Boolean(row.activo),
      firstInvoiceDate: row.primera_factura_fecha ? new Date(row.primera_factura_fecha) : undefined,
      lastInvoiceDate: row.ultima_factura_fecha ? new Date(row.ultima_factura_fecha) : undefined,
      totalInvoices: row.total_facturas,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
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
    aliases?: string[];
    personType?: 'FISICA' | 'JURIDICA';
  }): Emitter {
    const aliasesJson =
      data.aliases && data.aliases.length > 0 ? JSON.stringify(data.aliases) : null;

    const stmt = this.db.prepare(`
      INSERT INTO emisores (
        cuit, cuit_numerico, nombre, razon_social, aliases, tipo_persona
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      data.cuit,
      data.cuitNumeric,
      data.name,
      data.legalName || null,
      aliasesJson,
      data.personType || null
    );

    return this.findByCUIT(data.cuit)!;
  }

  /**
   * Actualiza los aliases de un emisor
   * @param cuit - CUIT del emisor
   * @param aliases - Array de aliases
   */
  updateAliases(cuit: string, aliases: string[]): void {
    const aliasesJson = aliases.length > 0 ? JSON.stringify(aliases) : null;

    const stmt = this.db.prepare(`
      UPDATE emisores
      SET aliases = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE cuit = ?
    `);

    stmt.run(aliasesJson, cuit);
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
    const rows = stmt.all(...params) as EmitterRow[];
    return rows.map((row) => this.mapRowToEmitter(row));
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
