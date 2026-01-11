import { json } from '@sveltejs/kit';
import { ExpectedInvoiceRepository } from '@server/database/repositories/expected-invoice';
import { InvoiceRepository } from '@server/database/repositories/invoice';
import { FileRepository } from '@server/database/repositories/file';
import { FileExtractionRepository } from '@server/database/repositories/file-extraction';
import { EmitterRepository } from '@server/database/repositories/emitter';

export type Final = {
  source: 'final';
  id: number;
  cuit: string;
  emitterName?: string | null;
  issueDate: string | null;
  processedAt?: string | null;
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
  fileHash?: string | null;
  status: 'uploaded' | 'processed';
  uploadDate?: string | null;
  extractedCuit?: string | null;
  extractedDate?: string | null;
  extractedTotal?: number | null;
  extractedType?: number | null;
  extractedPointOfSale?: number | null;
  extractedInvoiceNumber?: number | null;
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
  const fileRepo = new FileRepository();
  const extractionRepo = new FileExtractionRepository();
  const emitterRepo = new EmitterRepository();

  const invoices = await invoiceRepo.list();
  const expectedInvoices = await expectedRepo.listWithFiles({
    status: ['pending', 'discrepancy', 'manual', 'ignored'],
  });

  // Get uploaded files (not yet associated to invoice)
  const uploadedFilesRaw = fileRepo.list({ status: 'uploaded' });
  const pendingFiles: Pending[] = uploadedFilesRaw.map((file) => {
    // Get extraction data if available
    const extraction = extractionRepo.findByFileId(file.id);

    return {
      id: file.id,
      originalFilename: file.originalFilename,
      filePath: file.storagePath,
      fileHash: file.fileHash ?? null,
      status: file.status,
      uploadDate: file.createdAt ?? null,
      extractedCuit: extraction?.extractedCuit ?? null,
      extractedDate: extraction?.extractedDate ?? null,
      extractedTotal: extraction?.extractedTotal ?? null,
      extractedType: extraction?.extractedType ?? null,
      extractedPointOfSale: extraction?.extractedPointOfSale ?? null,
      extractedInvoiceNumber: extraction?.extractedInvoiceNumber ?? null,
    };
  });

  const toISODate = (value: Date | string | null | undefined) => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    return value.toISOString().slice(0, 10);
  };

  const comprobantesMap = new Map<string, Comprobante>();

  // Resolver nombres de emisor en batch para finales, esperadas y pendientes
  // Usar displayName que ya viene calculado desde el repository
  const uniqueCuits = new Set<string>([
    ...invoices.map((i) => i.emitterCuit).filter((c): c is string => Boolean(c)),
    ...expectedInvoices.map((i) => i.cuit).filter((c): c is string => Boolean(c)),
    ...pendingFiles.map((p) => p.extractedCuit).filter((c): c is string => Boolean(c)),
  ]);
  const emitterCache = new Map<string, string | null>();
  for (const cuit of uniqueCuits) {
    const emitter = emitterRepo.findByCUIT(cuit);
    emitterCache.set(cuit, emitter?.displayName || null);
  }

  // 1) Agregar facturas como comprobantes principales
  const finals: Final[] = invoices.map((inv) => ({
    source: 'final',
    id: inv.id,
    cuit: inv.emitterCuit,
    emitterName: emitterCache.get(inv.emitterCuit) || undefined,
    issueDate: toISODate(inv.issueDate),
    processedAt: inv.processedAt ? inv.processedAt.toString() : null,
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
      emitterName: emitterCache.get(inv.cuit) || inv.emitterName,
      issueDate: inv.issueDate,
      invoiceType: inv.invoiceType,
      pointOfSale: inv.pointOfSale,
      invoiceNumber: inv.invoiceNumber,
      total: inv.total,
      status: inv.status,
      file: inv.filePath || undefined,
      matchedPendingFileId: inv.matchedPendingFileId ?? null,
    }));

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

  // 3) Agregar archivos subidos (no vinculados a factura)
  // Los archivos con status='uploaded' son por definición no asociados a factura
  for (const p of pendingFiles) {
    // Buscar si hay una expected vinculada a este file
    // NOTA: Por ahora buscamos por matchedPendingFileId (legacy) hasta que se actualice el repo
    const expectedLinked = expectedInvoices.find((e) => e.matchedPendingFileId === p.id);
    const expectedData = expectedLinked
      ? {
          source: 'expected' as const,
          id: expectedLinked.id,
          cuit: expectedLinked.cuit,
          emitterName: emitterCache.get(expectedLinked.cuit) || expectedLinked.emitterName,
          issueDate: expectedLinked.issueDate,
          invoiceType: expectedLinked.invoiceType,
          pointOfSale: expectedLinked.pointOfSale,
          invoiceNumber: expectedLinked.invoiceNumber,
          total: expectedLinked.total,
          status: expectedLinked.status,
          file: expectedLinked.filePath || undefined,
          matchedPendingFileId: expectedLinked.matchedPendingFileId ?? null,
        }
      : null;

    // Archivo subido sin factura (pero puede tener expected vinculado)
    const comprobanteId = `pending:${p.id}`;
    comprobantesMap.set(comprobanteId, {
      id: comprobanteId,
      kind: 'pending',
      final: null,
      expected: expectedData,
      pending: p,
      emitterCuit: p.extractedCuit,
      emitterName: p.extractedCuit ? emitterCache.get(p.extractedCuit) : undefined,
    });
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
