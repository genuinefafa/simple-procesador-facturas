import { json } from '@sveltejs/kit';
import { ExpectedInvoiceRepository } from '@server/database/repositories/expected-invoice';
import { InvoiceRepository } from '@server/database/repositories/invoice';

export type Final = {
  source: 'final';
  id: number;
  cuit: string;
  emitterName?: string | null;
  issueDate: string | null;
  invoiceType: string | null;
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
  invoiceType: string;
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

  const invoices = await invoiceRepo.list();
  const expectedInvoices = await expectedRepo.listWithFiles({
    status: ['pending', 'discrepancy', 'manual', 'ignored'],
  });

  // Fetch pending files (reuse existing API data structure)
  // NOTE: In a real scenario, you'd call a PendingFileRepository
  // For now, we'll mock this as a fetch would do in the client
  const pendingFiles: Pending[] = [];

  const toISODate = (value: Date | string | null | undefined) => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    return value.toISOString().slice(0, 10);
  };

  const comprobantesMap = new Map<string, Comprobante>();

  // 1) Agregar facturas como comprobantes principales
  const finals: Final[] = invoices.map((inv) => ({
    source: 'final',
    id: inv.id,
    cuit: inv.emitterCuit,
    emitterName: undefined,
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
