import { json } from '@sveltejs/kit';
import { createComprobanteService } from '@server/factories';

export async function GET() {
  const service = createComprobanteService();
  const comprobantes = await service.listAll();
  return json({ count: comprobantes.length, comprobantes });
}
