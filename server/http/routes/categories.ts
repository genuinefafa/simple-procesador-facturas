/**
 * Hono router for /api/categories.
 *
 * Mirror of client/src/routes/api/categories/+server.ts during the
 * SvelteKit → Hono migration. See docs/MIGRATION_BUN_HONO.md.
 */

import { Hono } from 'hono';

import { CategoryRepository } from '../../database/repositories/category';

export const categoriesRouter = new Hono();

categoriesRouter.get('/', async (c) => {
  const categoryRepo = new CategoryRepository();
  const categories = await categoryRepo.findAllActive();
  return c.json({ items: categories });
});
