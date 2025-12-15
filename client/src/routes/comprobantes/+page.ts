import type { PageLoad } from './$types';
import type { Comprobante } from '../api/comprobantes/+server';

export const load: PageLoad = async ({ fetch }) => {
  const res = await fetch('/api/comprobantes');
  const data = await res.json();
  const comprobantes: Comprobante[] = data.comprobantes || [];

  return { comprobantes };
};
