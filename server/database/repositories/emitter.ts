/**
 * Repository para la gestión de emisores
 * Refactorizado para usar Drizzle ORM
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { emisores, type Emisor, type NewEmisor } from '../schema.js';
import type { Emitter } from '../../utils/types.js';

export class EmitterRepository {
  /**
   * Mapea un Emisor de Drizzle a la interfaz Emitter del sistema
   */
  private mapToEmitter(row: Emisor): Emitter {
    return {
      cuit: row.cuit,
      cuitNumeric: row.cuitNumerico,
      name: row.nombre,
      legalName: row.razonSocial ?? undefined,
      aliases: row.aliases ? (JSON.parse(row.aliases) as string[]) : [],
      templateId: row.templatePreferidoId ?? undefined,
      configOverride: row.configOverride ?? undefined,
      personType: row.tipoPersona ?? undefined,
      active: row.activo ?? true,
      firstInvoiceDate: row.primeraFacturaFecha ? new Date(row.primeraFacturaFecha) : undefined,
      lastInvoiceDate: row.ultimaFacturaFecha ? new Date(row.ultimaFacturaFecha) : undefined,
      totalInvoices: row.totalFacturas ?? 0,
      createdAt: new Date(row.createdAt ?? ''),
      updatedAt: new Date(row.updatedAt ?? ''),
    };
  }

  /**
   * Busca un emisor por CUIT
   * @param cuit - CUIT del emisor (con o sin guiones)
   * @returns Emisor o null si no existe
   */
  findByCUIT(cuit: string): Emitter | null {
    const cleaned = cuit.replace(/[-\s]/g, '');

    const result = db
      .select()
      .from(emisores)
      .where(eq(emisores.cuitNumerico, cleaned))
      .limit(1)
      .all();

    if (!result || result.length === 0 || !result[0]) return null;

    return this.mapToEmitter(result[0]);
  }

  /**
   * Busca un emisor por CUIT (versión async)
   * @param cuit - CUIT del emisor (con o sin guiones)
   * @returns Emisor o undefined si no existe
   */
  async findByCUITAsync(cuit: string): Promise<Emitter | undefined> {
    const result = this.findByCUIT(cuit);
    return result ?? undefined;
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

    const newEmisor: NewEmisor = {
      cuit: data.cuit,
      cuitNumerico: data.cuitNumeric,
      nombre: data.name,
      razonSocial: data.legalName ?? null,
      aliases: aliasesJson,
      tipoPersona: data.personType ?? null,
    };

    db.insert(emisores).values(newEmisor).run();

    const created = this.findByCUIT(data.cuit);
    if (!created) {
      throw new Error(`Failed to create emitter with CUIT ${data.cuit}`);
    }

    return created;
  }

  /**
   * Actualiza los aliases de un emisor
   * @param cuit - CUIT del emisor
   * @param aliases - Array de aliases
   */
  updateAliases(cuit: string, aliases: string[]): void {
    const aliasesJson = aliases.length > 0 ? JSON.stringify(aliases) : null;

    db.update(emisores)
      .set({
        aliases: aliasesJson,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(emisores.cuit, cuit))
      .run();
  }

  /**
   * Actualiza el template preferido de un emisor
   * @param cuit - CUIT del emisor
   * @param templateId - ID del template
   */
  updatePreferredTemplate(cuit: string, templateId: number): void {
    db.update(emisores)
      .set({
        templatePreferidoId: templateId,
        templateAutoDetectado: true,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(emisores.cuit, cuit))
      .run();
  }

  /**
   * Actualiza el nombre y razón social de un emisor
   * @param cuit - CUIT del emisor
   * @param name - Nuevo nombre
   * @param legalName - Nueva razón social (opcional)
   */
  updateName(cuit: string, name: string, legalName?: string): void {
    db.update(emisores)
      .set({
        nombre: name,
        razonSocial: legalName ?? name,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(emisores.cuit, cuit))
      .run();
  }

  /**
   * Lista todos los emisores
   * @param filters - Filtros opcionales
   * @returns Array de emisores
   */
  list(filters?: { active?: boolean }): Emitter[] {
    let results: Emisor[];

    if (filters?.active !== undefined) {
      results = db
        .select()
        .from(emisores)
        .where(eq(emisores.activo, filters.active))
        .orderBy(emisores.nombre)
        .all();
    } else {
      results = db.select().from(emisores).orderBy(emisores.nombre).all();
    }

    return results.map((row) => this.mapToEmitter(row));
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
    const result = db
      .select({
        totalInvoices: sql<number>`COUNT(*)`,
        totalAmount: sql<number>`COALESCE(SUM(total), 0)`,
        firstInvoiceDate: sql<string | null>`MIN(fecha_emision)`,
        lastInvoiceDate: sql<string | null>`MAX(fecha_emision)`,
      })
      .from(sql`facturas`)
      .where(sql`emisor_cuit = ${cuit}`)
      .limit(1)
      .all();

    if (!result || result.length === 0) return null;

    return result[0] ?? null;
  }
}
