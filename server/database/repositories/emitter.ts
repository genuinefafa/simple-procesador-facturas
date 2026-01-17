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
    const emitter: Emitter = {
      cuit: row.cuit,
      cuitNumeric: row.cuitNumerico,
      name: row.nombre,
      displayName: '', // Se calcula después
      legalName: row.razonSocial ?? undefined,
      aliases: row.aliases ? (JSON.parse(row.aliases) as string[]) : [],
      templateId: row.templatePreferidoId ?? undefined,
      configOverride: row.configOverride ?? undefined,
      personType: row.tipoPersona ?? undefined,
      active: row.activo ?? true,
      // NOTA: firstInvoiceDate, lastInvoiceDate, totalInvoices se calculan
      // dinámicamente en las APIs - ya no se almacenan en DB (migración 0016)
      totalInvoices: 0,
      createdAt: new Date(row.createdAt ?? ''),
      updatedAt: new Date(row.updatedAt ?? ''),
    };

    // Calcular displayName usando el método estático
    emitter.displayName = EmitterRepository.getShortestName(emitter);

    return emitter;
  }

  /**
   * Obtiene el nombre más corto del emisor entre nombre, razón social y aliases
   * Útil para mostrar en listas compactas
   * @param emitter - Emisor del cual obtener el nombre corto
   * @returns El nombre más corto disponible
   */
  static getShortestName(emitter: Emitter): string {
    const candidates: string[] = [];

    // Agregar nombre principal
    if (emitter.name) candidates.push(emitter.name);

    // Agregar razón social si es diferente del nombre
    if (emitter.legalName && emitter.legalName !== emitter.name) {
      candidates.push(emitter.legalName);
    }

    // Agregar aliases
    if (emitter.aliases && emitter.aliases.length > 0) {
      candidates.push(...emitter.aliases);
    }

    // Si no hay ningún candidato, devolver el CUIT
    if (candidates.length === 0) {
      return emitter.cuit;
    }

    // Retornar el más corto
    return candidates.reduce((shortest, current) =>
      current.length < shortest.length ? current : shortest
    );
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
  findByCUITAsync(cuit: string): Promise<Emitter | undefined> {
    const result = this.findByCUIT(cuit);
    return Promise.resolve(result ?? undefined);
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

  /**
   * Busca un emisor por ID (cuit)
   * @param id - CUIT del emisor
   * @returns Emisor o null si no existe
   */
  findById(id: string): Emitter | null {
    return this.findByCUIT(id);
  }

  /**
   * Actualiza un emisor
   * @param cuit - CUIT del emisor a actualizar
   * @param data - Datos a actualizar
   * @returns El emisor actualizado o null si no existe
   */
  update(
    cuit: string,
    data: {
      name?: string;
      legalName?: string;
      aliases?: string[];
      personType?: 'FISICA' | 'JURIDICA';
      active?: boolean;
    }
  ): Emitter | null {
    const existing = this.findByCUIT(cuit);
    if (!existing) return null;

    const updateData: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (data.name !== undefined) {
      updateData.nombre = data.name;
    }
    if (data.legalName !== undefined) {
      updateData.razonSocial = data.legalName;
    }
    if (data.aliases !== undefined) {
      updateData.aliases = data.aliases.length > 0 ? JSON.stringify(data.aliases) : null;
    }
    if (data.personType !== undefined) {
      updateData.tipoPersona = data.personType;
    }
    if (data.active !== undefined) {
      updateData.activo = data.active;
    }

    db.update(emisores).set(updateData).where(eq(emisores.cuit, cuit)).run();

    return this.findByCUIT(cuit);
  }

  /**
   * Cuenta las facturas vinculadas a un emisor (solo facturas finales)
   * @param cuit - CUIT del emisor
   * @returns Cantidad de facturas
   */
  countInvoices(cuit: string): number {
    const result = db
      .select({
        count: sql<number>`COUNT(*)`,
      })
      .from(sql`facturas`)
      .where(sql`emisor_cuit = ${cuit}`)
      .all();

    return result[0]?.count ?? 0;
  }

  /**
   * Cuenta todos los comprobantes vinculados a un emisor
   * (facturas finales + expected invoices que no tienen factura vinculada)
   * @param cuit - CUIT del emisor (con o sin guiones)
   * @returns Cantidad total de comprobantes
   */
  countComprobantes(cuit: string): number {
    const cleaned = cuit.replace(/[-\s]/g, '');

    // Contar facturas finales
    const facturasResult = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(sql`facturas`)
      .where(sql`REPLACE(emisor_cuit, '-', '') = ${cleaned}`)
      .all();
    const facturas = facturasResult[0]?.count ?? 0;

    // Contar expected invoices que NO tienen factura vinculada (status != 'matched')
    const expectedResult = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(sql`expected_invoices`)
      .where(sql`REPLACE(cuit, '-', '') = ${cleaned} AND status != 'matched'`)
      .all();
    const expected = expectedResult[0]?.count ?? 0;

    return facturas + expected;
  }

  /**
   * Obtiene estadísticas completas de un emisor
   * (considera facturas finales + expected invoices)
   * @param cuit - CUIT del emisor
   * @returns Estadísticas combinadas
   */
  getFullStats(cuit: string): {
    totalComprobantes: number;
    totalFacturas: number;
    totalExpected: number;
    totalAmount: number;
    firstDate: string | null;
    lastDate: string | null;
  } {
    const cleaned = cuit.replace(/[-\s]/g, '');

    // Stats de facturas finales
    const facturasStats = db
      .select({
        count: sql<number>`COUNT(*)`,
        total: sql<number>`COALESCE(SUM(total), 0)`,
        firstDate: sql<string | null>`MIN(fecha_emision)`,
        lastDate: sql<string | null>`MAX(fecha_emision)`,
      })
      .from(sql`facturas`)
      .where(sql`REPLACE(emisor_cuit, '-', '') = ${cleaned}`)
      .all();

    // Stats de expected invoices (no matched)
    // Nota: expected_invoices usa issue_date, no fecha_emision
    const expectedStats = db
      .select({
        count: sql<number>`COUNT(*)`,
        total: sql<number>`COALESCE(SUM(total), 0)`,
        firstDate: sql<string | null>`MIN(issue_date)`,
        lastDate: sql<string | null>`MAX(issue_date)`,
      })
      .from(sql`expected_invoices`)
      .where(sql`REPLACE(cuit, '-', '') = ${cleaned} AND status != 'matched'`)
      .all();

    const f = facturasStats[0] || { count: 0, total: 0, firstDate: null, lastDate: null };
    const e = expectedStats[0] || { count: 0, total: 0, firstDate: null, lastDate: null };

    // Combinar fechas
    const dates = [f.firstDate, f.lastDate, e.firstDate, e.lastDate].filter(
      (d): d is string => d !== null && d !== undefined
    );
    const firstDate: string | null = dates.length > 0 ? (dates.sort()[0] ?? null) : null;
    const lastDate: string | null = dates.length > 0 ? (dates.sort().reverse()[0] ?? null) : null;

    return {
      totalComprobantes: (f.count ?? 0) + (e.count ?? 0),
      totalFacturas: f.count ?? 0,
      totalExpected: e.count ?? 0,
      totalAmount: (f.total ?? 0) + (e.total ?? 0),
      firstDate,
      lastDate,
    };
  }

  /**
   * Elimina un emisor
   * @param cuit - CUIT del emisor a eliminar
   * @returns true si se eliminó, false si no existía
   * @throws Error si el emisor tiene facturas vinculadas
   */
  delete(cuit: string): boolean {
    const existing = this.findByCUIT(cuit);
    if (!existing) return false;

    // Verificar que no tenga facturas vinculadas
    const invoiceCount = this.countInvoices(cuit);
    if (invoiceCount > 0) {
      throw new Error(
        `No se puede eliminar el emisor porque tiene ${invoiceCount} factura(s) vinculada(s)`
      );
    }

    db.delete(emisores).where(eq(emisores.cuit, cuit)).run();
    return true;
  }
}
