import { json } from '@sveltejs/kit';
import { EmitterRepository } from '@server/database/repositories/emitter';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const emitterRepo = new EmitterRepository();

  const q = url.searchParams.get('q'); // Combined search query
  const cuit = url.searchParams.get('cuit');
  const name = url.searchParams.get('name');
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);

  try {
    let emitters: any[] = [];
    const allEmitters = emitterRepo.list();

    if (q) {
      // Búsqueda combinada: por CUIT (sin guiones) o por nombre
      const qClean = q.replace(/[^\d]/g, ''); // Remove non-digits for CUIT search
      emitters = allEmitters.filter((e: any) => {
        const cuitNumeric = (e.cuit || '').replace(/[^\d]/g, '');
        const cuitMatches = qClean && cuitNumeric.includes(qClean);
        const nameMatches = (e.name || '').toLowerCase().includes(q.toLowerCase());
        return cuitMatches || nameMatches;
      });
    } else if (cuit) {
      // Búsqueda exacta o parcial por CUIT
      const found = emitterRepo.findByCUIT(cuit);
      if (found) {
        emitters = [found];
      }
    } else if (name) {
      // Búsqueda por nombre
      emitters = allEmitters.filter((e: any) =>
        (e.name || '').toLowerCase().includes(name.toLowerCase())
      );
    } else {
      // Listar todos (limitado)
      emitters = allEmitters.slice(0, limit);
    }

    return json({ count: emitters.length, emitters: emitters.slice(0, limit) });
  } catch (e) {
    console.error('Error fetching emitters:', e);
    return json({ error: 'Failed to fetch emitters', message: String(e) }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request }) => {
  const emitterRepo = new EmitterRepository();

  try {
    const body: any = await request.json();
    const { cuit, nombre, razonSocial, aliases, tipoPersona } = body;

    if (!cuit || !nombre) {
      return json({ error: 'Missing required fields: cuit, nombre' }, { status: 400 });
    }

    // Verificar que no exista ya
    const existing = emitterRepo.findByCUIT(cuit);
    if (existing) {
      return json(
        { error: 'Emitter with this CUIT already exists', emitter: existing },
        { status: 409 }
      );
    }

    // TODO: Crear emisor en la DB
    // emitterRepo.create({ ... })
    // Por ahora, solo devolver mock
    const newEmitter = {
      cuit,
      cuitNumeric: cuit.replace(/[-\s]/g, ''),
      name: nombre,
      displayName: nombre,
      legalName: razonSocial || nombre,
      aliases: aliases ? aliases.split(',') : [],
      personType: tipoPersona || 'JURIDICA',
      active: true,
      firstInvoiceDate: null,
      lastInvoiceDate: null,
      totalInvoices: 0,
    };

    // TODO: log audit event (action='emitter.create', newEmitter)

    return json({ emitter: newEmitter }, { status: 201 });
  } catch (e) {
    console.error('Error creating emitter:', e);
    return json({ error: 'Failed to create emitter', message: String(e) }, { status: 500 });
  }
};
