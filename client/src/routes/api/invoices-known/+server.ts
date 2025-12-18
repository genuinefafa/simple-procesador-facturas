import { json } from '@sveltejs/kit';
import { ExpectedInvoiceRepository } from '@server/database/repositories/expected-invoice';
import { InvoiceRepository } from '@server/database/repositories/invoice';

type ExpectedInvoice = {
  source: 'expected';
  id: number;
  cuit: string;
  emitterName?: string | null;
  issueDate: string;
  invoiceType: number | null; // Código ARCA numérico
  pointOfSale: number;
  invoiceNumber: number;
  total?: number | null;
  status?: string;
  file?: string;
  matchedPendingFileId?: number | null;
};

type FinalInvoice = {
  source: 'final';
  id: number;
  cuit: string;
  emitterName?: string | null;
  issueDate: string | null;
  invoiceType: number | null; // Código ARCA numérico
  pointOfSale: number | null;
  invoiceNumber: number | null;
  total?: number | null;
  file?: string;
  fileHash?: string | null;
  categoryId?: number | null;
  pendingFileId?: number | null;
  expectedInvoiceId?: number | null;
};

export async function GET() {
  const invoiceRepo = new InvoiceRepository();
  const expectedRepo = new ExpectedInvoiceRepository();

  const invoices = await invoiceRepo.list();
  const expectedInvoices = await expectedRepo.listWithFiles({
    status: ['pending', 'discrepancy', 'manual', 'ignored'],
  });

  const toISODate = (value: Date | string | null | undefined) => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    return value.toISOString().slice(0, 10);
  };

  const finals: FinalInvoice[] = invoices.map((inv) => ({
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

  const expecteds: ExpectedInvoice[] = expectedInvoices
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

  const items = [...expecteds, ...finals];

  return json({ count: items.length, items });
}
