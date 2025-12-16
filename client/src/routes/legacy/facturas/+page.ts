import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  const [invoicesRes, categoriesRes] = await Promise.all([
    fetch('/api/invoices-known'),
    fetch('/api/categories'),
  ]);
  const invoices = await invoicesRes.json();
  const categories = await categoriesRes.json();
  return {
    items: invoices.items as unknown[],
    categories: categories.items as Array<{ id: number; key: string; description: string }>,
  };
};
