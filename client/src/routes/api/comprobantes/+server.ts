import { json } from '@sveltejs/kit';
import { ComprobanteService } from '@server/services/comprobante.service';

export async function GET() {
  const service = new ComprobanteService();
  const comprobantes = await service.listAll();
  return json({ count: comprobantes.length, comprobantes });
}
