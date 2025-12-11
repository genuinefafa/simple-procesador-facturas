import { json } from '@sveltejs/kit';
import { CategoryRepository } from '@server/database/repositories/category';

export async function GET() {
  const categoryRepo = new CategoryRepository();
  const categories = await categoryRepo.findAllActive();
  return json({ items: categories });
}
