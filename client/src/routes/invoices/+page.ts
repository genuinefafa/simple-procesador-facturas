import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  const res = await fetch('/api/invoices-known');
  const data = await res.json();
  return { items: data.items as unknown[] };
};
