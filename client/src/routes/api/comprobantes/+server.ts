import { json } from '@sveltejs/kit';
import { ExpectedInvoiceRepository } from '@server/database/repositories/expected-invoice';
import { InvoiceRepository } from '@server/database/repositories/invoice';
import { PendingFileRepository } from '@server/database/repositories/pending-file';
import { EmitterRepository } from '@server/database/repositories/emitter';

export type Final = {
  source: 'final';
  id: number;
  cuit: string;
  emitterName?: string | null;
  issueDate: string | null;
  invoiceType: number | null; // Código ARCA numérico (1, 6, 11, etc.)
  pointOfSale: number | null;
  invoiceNumber: number | null;
  total?: number | null;
  file?: string;
  fileHash?: string | null;
  categoryId?: number | null;
  pendingFileId?: number | null;
  expectedInvoiceId?: number | null;
};

export type Expected = {
  source: 'expected';
  id: number;
  cuit: string;
  emitterName?: string | null;
  issueDate: string;
  invoiceType: number | null; // Código ARCA numérico (1, 6, 11, etc.)
  pointOfSale: number;
  invoiceNumber: number;
  total?: number | null;
  status?: string;
  file?: string;
  matchedPendingFileId?: number | null;
};

export type Pending = {
  id: number;
  originalFilename: string;
  filePath: string;
  status: 'pending' | 'reviewing' | 'processed' | 'failed';
  extractedCuit?: string | null;
  extractedDate?: string | null;
  extractedTotal?: number | null;
};

export type Comprobante = {
  /** ID único: "factura:123" | "expected:456" | "pending:789" */
  id: string;

  /** Tipo de entidad principal */
  kind: 'factura' | 'expected' | 'pending';

  // Las 3 entidades, cualquiera puede ser null
  final: Final | null;
  expected: Expected | null;
  pending: Pending | null;

  // Emisor asociado (si existe)
  emitterCuit?: string | null;
  emitterName?: string | null;
};

export async function GET() {
  const invoiceRepo = new InvoiceRepository();
  const expectedRepo = new ExpectedInvoiceRepository();
  const pendingRepo = new PendingFileRepository();
  const emitterRepo = new EmitterRepository();

  const invoices = await invoiceRepo.list();
  const expectedInvoices = await expectedRepo.listWithFiles({
    status: ['pending', 'discrepancy', 'manual', 'ignored'],
  });

  const pendingFilesRaw = await pendingRepo.list();
  const pendingFiles: Pending[] = pendingFilesRaw.map((pf) => ({
    id: pf.id,
    originalFilename: pf.originalFilename,
    filePath: pf.filePath,
    status: pf.status,
    extractedCuit: pf.extractedCuit,
    extractedDate: pf.extractedDate,
    extractedTotal: pf.extractedTotal,
  }));

  const toISODate = (value: Date | string | null | undefined) => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    return value.toISOString().slice(0, 10);
  };

  const comprobantesMap = new Map<string, Comprobante>();

  // Resolver nombres de emisor en batch para finales
  const uniqueCuits = new Set<string>(invoices.map((i) => i.emitterCuit).filter(Boolean));
  const emitterCache = new Map<string, string | null>();
  for (const cuit of uniqueCuits) {
    const emitter = emitterRepo.findByCUIT(cuit);
    emitterCache.set(cuit, emitter?.name || null);
  }

  // 1) Agregar facturas como comprobantes principales
  const finals: Final[] = invoices.map((inv) => ({
    source: 'final',
    id: inv.id,
    cuit: inv.emitterCuit,
    emitterName: emitterCache.get(inv.emitterCuit) || undefined,
    issueDate: toISODate(inv.issueDate),
    invoiceType: inv.invoiceType,
    pointOfSale: inv.pointOfSale,
    invoiceNumber: inv.invoiceNumber,
    total: inv.total ?? null,
    file: inv.processedFile || inv.originalFile,
    fileHash: (inv as any).fileHash ?? null,
    categoryId: inv.categoryId ?? null,
    pendingFileId: inv.pendingFileId ?? null,
    expectedInvoiceId: inv.expectedInvoiceId ?? null,
  }));

  for (const f of finals) {
    const comprobanteId = `factura:${f.id}`;
    comprobantesMap.set(comprobanteId, {
      id: comprobanteId,
      kind: 'factura',
      final: f,
      expected: null,
      pending: null,
      emitterCuit: f.cuit,
      emitterName: f.emitterName,
    });
  }

  // 2) Agregar esperadas no vinculadas a factura
  const expecteds: Expected[] = expectedInvoices
    .filter((inv) => inv.matchedPendingFileId == null)
    .map((inv) => ({
      source: 'expected',
      id: inv.id,
      cuit: inv.cuit,
      emitterName: inv.emitterName,
      issueDate: inv.issueDate,
      invoiceType: inv.invoiceType,
      pointOfSale: inv.pointOfSale,
      invoiceNumber: inv.invoiceNumber,
      total: inv.total,
      status: inv.status,
      file: inv.filePath || undefined,
      matchedPendingFileId: inv.matchedPendingFileId ?? null,
    }));

  const linkedPendingIds = new Set<number>(
    finals.map((f) => f.pendingFileId).filter(Boolean) as number[]
  );

  for (const e of expecteds) {
    const facturaLinked = finals.find((f) => f.expectedInvoiceId === e.id);
    if (facturaLinked) {
      // Ya incluida en factura
      const comprobanteId = `factura:${facturaLinked.id}`;
      const comp = comprobantesMap.get(comprobanteId)!;
      comp.expected = e;
    } else {
      // Esperada sin factura
      const comprobanteId = `expected:${e.id}`;
      comprobantesMap.set(comprobanteId, {
        id: comprobanteId,
        kind: 'expected',
        final: null,
        expected: e,
        pending: null,
        emitterCuit: e.cuit,
        emitterName: e.emitterName,
      });
    }
  }

  // 3) Agregar pendientes no vinculadas a factura
  for (const p of pendingFiles) {
    if (!linkedPendingIds.has(p.id)) {
      const facturaLinked = finals.find((f) => f.pendingFileId === p.id);
      if (facturaLinked) {
        // Ya incluida en factura
        const factId = `factura:${facturaLinked.id}`;
        const comp = comprobantesMap.get(factId)!;
        comp.pending = p;
      } else {
        // Pendiente sin factura
        const comprobanteId = `pending:${p.id}`;
        comprobantesMap.set(comprobanteId, {
          id: comprobanteId,
          kind: 'pending',
          final: null,
          expected: null,
          pending: p,
          emitterCuit: p.extractedCuit,
          emitterName: undefined,
        });
      }
    }
  }

  const comprobantes = Array.from(comprobantesMap.values());

  // Ordenar: latest first por fecha donde esté disponible
  comprobantes.sort((a, b) => {
    const dateA = a.final?.issueDate || a.expected?.issueDate || a.pending?.extractedDate;
    const dateB = b.final?.issueDate || b.expected?.issueDate || b.pending?.extractedDate;
    if (dateA && dateB) return new Date(dateB).getTime() - new Date(dateA).getTime();
    if (!dateA && dateB) return 1;
    if (dateA && !dateB) return -1;
    return 0;
  });

  return json({ count: comprobantes.length, comprobantes });
}
