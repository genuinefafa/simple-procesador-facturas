import type { PageLoad } from './$types';
import type { Comprobante } from '../api/comprobantes/+server';

export const load: PageLoad = async ({ fetch }) => {
  const [res, catRes] = await Promise.all([fetch('/api/comprobantes'), fetch('/api/categories')]);
  const data = await res.json();
  const comprobantes: Comprobante[] = data.comprobantes || [];
  const categoriesData = catRes.ok ? await catRes.json() : { items: [] };
  return {
    comprobantes,
    categories: categoriesData.items as Array<{ id: number; key: string; description: string }>,
  };
};
