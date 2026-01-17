import { json } from '@sveltejs/kit';
import { EmitterRepository } from '@server/database/repositories/emitter';
import { InvoiceRepository } from '@server/database/repositories/invoice';
import { ExpectedInvoiceRepository } from '@server/database/repositories/expected-invoice';
import { FileRepository } from '@server/database/repositories/file';
import { FileExtractionRepository } from '@server/database/repositories/file-extraction';
import type { RequestHandler } from './$types';

/**
 * Cuenta comprobantes por emisor usando la misma lógica que /api/comprobantes
 * Esto incluye: facturas + expected (no matched) + archivos uploaded con ese CUIT extraído
 */
async function countComprobantesByEmitter(): Promise<Map<string, number>> {
  const invoiceRepo = new InvoiceRepository();
  const expectedRepo = new ExpectedInvoiceRepository();
  const fileRepo = new FileRepository();
  const extractionRepo = new FileExtractionRepository();

  const counts = new Map<string, number>();

  // Helper para normalizar CUIT
  const normalizeCuit = (cuit: string | null | undefined): string | null => {
    if (!cuit) return null;
    return cuit.replace(/[-\s]/g, '');
  };

  // 1) Contar facturas finales
  const invoices = await invoiceRepo.list();
  for (const inv of invoices) {
    const cuit = normalizeCuit(inv.emitterCuit);
    if (cuit) {
      counts.set(cuit, (counts.get(cuit) || 0) + 1);
    }
  }

  // 2) Contar expected invoices (no matched)
  const expectedInvoices = await expectedRepo.listWithFiles({
    status: ['pending', 'discrepancy', 'manual', 'ignored'],
  });
  for (const exp of expectedInvoices) {
    const cuit = normalizeCuit(exp.cuit);
    if (cuit) {
      counts.set(cuit, (counts.get(cuit) || 0) + 1);
    }
  }

  // 3) Contar archivos uploaded (sin factura asociada)
  const uploadedFiles = fileRepo.list({ status: 'uploaded' });
  for (const file of uploadedFiles) {
    const extraction = extractionRepo.findByFileId(file.id);
    const cuit = normalizeCuit(extraction?.extractedCuit);
    if (cuit) {
      counts.set(cuit, (counts.get(cuit) || 0) + 1);
    }
  }

  return counts;
}

export const GET: RequestHandler = async ({ url }) => {
  const emitterRepo = new EmitterRepository();

  const q = url.searchParams.get('q'); // Combined search query
  const cuit = url.searchParams.get('cuit');
  const name = url.searchParams.get('name');
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  const includeStats = url.searchParams.get('stats') !== 'false'; // Por defecto incluir stats

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

    // Calcular conteo real de comprobantes por emisor (si se pide stats)
    let comprobanteCounts: Map<string, number> | null = null;
    if (includeStats) {
      comprobanteCounts = await countComprobantesByEmitter();
    }

    // Enriquecer emisores con el conteo real
    const enrichedEmitters = emitters.slice(0, limit).map((e: any) => {
      const cuitNumeric = (e.cuit || '').replace(/[-\s]/g, '');
      return {
        ...e,
        // Usar el conteo calculado, o el de la DB como fallback
        totalInvoices: comprobanteCounts?.get(cuitNumeric) ?? e.totalInvoices ?? 0,
      };
    });

    return json({ count: enrichedEmitters.length, emitters: enrichedEmitters });
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

    // Crear emisor en la DB
    const newEmitter = emitterRepo.create({
      cuit,
      cuitNumeric: cuit.replace(/[-\s]/g, ''),
      name: nombre,
      legalName: razonSocial || nombre,
      aliases: aliases
        ? aliases
            .split(',')
            .map((a: string) => a.trim())
            .filter(Boolean)
        : [],
      personType: tipoPersona || 'JURIDICA',
    });

    return json({ emitter: newEmitter }, { status: 201 });
  } catch (e) {
    console.error('Error creating emitter:', e);
    return json({ error: 'Failed to create emitter', message: String(e) }, { status: 500 });
  }
};
