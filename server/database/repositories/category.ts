/**
 * Repository para la gestión de categorías
 */

import { eq } from 'drizzle-orm';
import { db } from '../db';
import { categories, type Category, type NewCategory } from '../schema';

export class CategoryRepository {
  /**
   * Obtiene todas las categorías activas
   */
  async findAllActive(): Promise<Category[]> {
    return db
      .select()
      .from(categories)
      .where(eq(categories.active, true))
      .orderBy(categories.description);
  }

  /**
   * Obtiene todas las categorías (activas e inactivas)
   */
  async findAll(): Promise<Category[]> {
    return db.select().from(categories).orderBy(categories.description);
  }

  /**
   * Obtiene una categoría por ID
   */
  async findById(id: number): Promise<Category | undefined> {
    const result = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
    return result[0];
  }

  /**
   * Obtiene una categoría por key
   */
  async findByKey(key: string): Promise<Category | undefined> {
    const result = await db.select().from(categories).where(eq(categories.key, key)).limit(1);
    return result[0];
  }

  /**
   * Crea una nueva categoría
   */
  async create(category: NewCategory): Promise<Category> {
    const result = await db.insert(categories).values(category).returning();
    if (!result || result.length === 0 || !result[0]) {
      throw new Error('Failed to create category');
    }
    return result[0];
  }

  /**
   * Actualiza una categoría
   */
  async update(id: number, updates: Partial<NewCategory>): Promise<Category> {
    const result = await db
      .update(categories)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(categories.id, id))
      .returning();
    if (!result || result.length === 0 || !result[0]) {
      throw new Error('Category not found');
    }
    return result[0];
  }

  /**
   * Desactiva una categoría (soft delete)
   */
  async deactivate(id: number): Promise<void> {
    await db
      .update(categories)
      .set({ active: false, updatedAt: new Date().toISOString() })
      .where(eq(categories.id, id));
  }

  /**
   * Elimina una categoría
   */
  async delete(id: number): Promise<void> {
    await db.delete(categories).where(eq(categories.id, id));
  }
}
