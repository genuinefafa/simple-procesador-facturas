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
  fileId?: number | null;
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
};

export type FileData = {
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
  /** ID único: "factura:123" | "expected:456" | "file:789" */
  id: string;

  /** Tipo de entidad principal */
  kind: 'factura' | 'expected' | 'file';

  // Las 3 entidades, cualquiera puede ser null
  final: Final | null;
  expected: Expected | null;
  file: FileData | null;

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

  const toISODate = (value: Date | string | null | undefined) => {
    if (!value) return null;
    if (typeof value === 'string') {
      // Si ya es ISO date (YYYY-MM-DD), retornar tal cual
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
      // Si es ISO timestamp, extraer solo la fecha
      if (value.includes('T')) return value.split('T')[0];
      // DD-MM-YYYY o DD/MM/YYYY → YYYY-MM-DD
      const ddmmyyyy = value.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
      if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
      return value;
    }
    // Validar que la fecha sea válida antes de llamar toISOString
    if (value instanceof Date && !isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    return null;
  };

  // Get uploaded files (not yet associated to invoice)
  const uploadedFilesRaw = fileRepo.list({ status: 'uploaded' });
  const uploadedFiles: FileData[] = uploadedFilesRaw.map((file) => {
    // Get extraction data if available
    const extraction = extractionRepo.findByFileId(file.id);

    return {
      id: file.id,
      originalFilename: file.originalFilename,
      filePath: file.storagePath,
      fileHash: file.fileHash ?? null,
      status: file.status,
      uploadDate: toISODate(file.createdAt),
      extractedCuit: extraction?.extractedCuit ?? null,
      extractedDate: toISODate(extraction?.extractedDate) ?? null,
      extractedTotal: extraction?.extractedTotal ?? null,
      extractedType: extraction?.extractedType ?? null,
      extractedPointOfSale: extraction?.extractedPointOfSale ?? null,
      extractedInvoiceNumber: extraction?.extractedInvoiceNumber ?? null,
    };
  });

  const comprobantesMap = new Map<string, Comprobante>();

  // Resolver nombres de emisor en batch para finales, esperadas y archivos subidos
  // Usar displayName que ya viene calculado desde el repository
  const uniqueCuits = new Set<string>([
    ...invoices.map((i) => i.emitterCuit).filter((c): c is string => Boolean(c)),
    ...expectedInvoices.map((i) => i.cuit).filter((c): c is string => Boolean(c)),
    ...uploadedFiles.map((p) => p.extractedCuit).filter((c): c is string => Boolean(c)),
  ]);
  const emitterCache = new Map<string, string | null>();
  for (const cuit of uniqueCuits) {
    const emitter = emitterRepo.findByCUIT(cuit);
    emitterCache.set(cuit, emitter?.displayName || null);
  }

  // 1) Agregar facturas como comprobantes principales
  // Obtener rutas de archivo via fileId -> files.storage_path
  const finals: Final[] = invoices.map((inv) => {
    let filePath: string | undefined;
    let fileHash: string | null = null;
    if (inv.fileId) {
      const file = fileRepo.findById(inv.fileId);
      if (file) {
        filePath = file.storagePath;
        fileHash = file.fileHash ?? null;
      }
    }
    return {
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
      file: filePath,
      fileHash,
      categoryId: inv.categoryId ?? null,
      fileId: inv.fileId ?? null,
      expectedInvoiceId: inv.expectedInvoiceId ?? null,
    };
  });

  for (const f of finals) {
    const comprobanteId = `factura:${f.id}`;
    comprobantesMap.set(comprobanteId, {
      id: comprobanteId,
      kind: 'factura',
      final: f,
      expected: null,
      file: null,
      emitterCuit: f.cuit,
      emitterName: f.emitterName,
    });
  }

  // 2) Agregar esperadas no vinculadas a factura
  // Una expected está vinculada a factura si alguna factura tiene expectedInvoiceId === expected.id
  const expectedIdsLinkedToInvoice = new Set(
    finals.map((f) => f.expectedInvoiceId).filter((id): id is number => id != null)
  );

  const expecteds: Expected[] = expectedInvoices
    .filter((inv) => !expectedIdsLinkedToInvoice.has(inv.id))
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
        file: null,
        emitterCuit: e.cuit,
        emitterName: e.emitterName,
      });
    }
  }

  // 3) Agregar archivos subidos (no vinculados a factura)
  // Los archivos con status='uploaded' son por definición no asociados a factura
  // Pero verificamos también que no estén referenciados por ninguna factura (defensa en profundidad)
  const fileIdsUsedByInvoices = new Set(
    finals.map((f) => f.fileId).filter((id): id is number => id != null)
  );

  for (const p of uploadedFiles) {
    // Saltar si este file ya está asociado a una factura
    if (fileIdsUsedByInvoices.has(p.id)) {
      continue;
    }

    const comprobanteId = `file:${p.id}`;
    comprobantesMap.set(comprobanteId, {
      id: comprobanteId,
      kind: 'file',
      final: null,
      expected: null,
      file: p,
      emitterCuit: p.extractedCuit,
      emitterName: p.extractedCuit ? emitterCache.get(p.extractedCuit) : undefined,
    });
  }

  const comprobantes = Array.from(comprobantesMap.values());

  // Ordenar: latest first por fecha donde esté disponible
  comprobantes.sort((a, b) => {
    const dateA =
      a.final?.issueDate || a.expected?.issueDate || a.file?.extractedDate || a.file?.uploadDate;
    const dateB =
      b.final?.issueDate || b.expected?.issueDate || b.file?.extractedDate || b.file?.uploadDate;
    if (dateA && dateB) return new Date(dateB).getTime() - new Date(dateA).getTime();
    if (!dateA && dateB) return 1;
    if (dateA && !dateB) return -1;
    return 0;
  });

  return json({ count: comprobantes.length, comprobantes });
}
