/**
 * Repository para la gestión de categorías
 */

import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { categories, type Category, type NewCategory } from '../schema';

/**
 * Interface for CategoryRepository - enables dependency injection and testing
 */
export interface ICategoryRepository {
  findById(id: number): Promise<Category | undefined>;
  findByKey(key: string): Promise<Category | undefined>;
  findAllActive(): Promise<Category[]>;
}

export class CategoryRepository implements ICategoryRepository {
  /**
   * Obtiene todas las categorías activas
   */
  async findAllActive(): Promise<Category[]> {
    return getDb()
      .select()
      .from(categories)
      .where(eq(categories.active, true))
      .orderBy(categories.description);
  }

  /**
   * Obtiene todas las categorías (activas e inactivas)
   */
  async findAll(): Promise<Category[]> {
    return getDb().select().from(categories).orderBy(categories.description);
  }

  /**
   * Obtiene una categoría por ID
   */
  async findById(id: number): Promise<Category | undefined> {
    const result = await getDb().select().from(categories).where(eq(categories.id, id)).limit(1);
    return result[0];
  }

  /**
   * Obtiene una categoría por key
   */
  async findByKey(key: string): Promise<Category | undefined> {
    const result = await getDb().select().from(categories).where(eq(categories.key, key)).limit(1);
    return result[0];
  }

  /**
   * Crea una nueva categoría
   */
  async create(category: NewCategory): Promise<Category> {
    const result = await getDb().insert(categories).values(category).returning();
    if (!result || result.length === 0 || !result[0]) {
      throw new Error('Failed to create category');
    }
    return result[0];
  }

  /**
   * Actualiza una categoría
   */
  async update(id: number, updates: Partial<NewCategory>): Promise<Category> {
    const result = await getDb()
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
    await getDb()
      .update(categories)
      .set({ active: false, updatedAt: new Date().toISOString() })
      .where(eq(categories.id, id));
  }

  /**
   * Elimina una categoría
   */
  async delete(id: number): Promise<void> {
    await getDb().delete(categories).where(eq(categories.id, id));
  }
}
