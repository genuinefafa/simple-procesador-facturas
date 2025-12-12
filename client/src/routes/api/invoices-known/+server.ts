import { json } from '@sveltejs/kit';
import { InvoiceRepository } from '@server/database/repositories/invoice';

type FinalInvoice = {
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
  categoryId?: number | null;
  pendingFileId?: number | null;
  expectedInvoiceId?: number | null;
};

export async function GET() {
  const invoiceRepo = new InvoiceRepository();
  const invoices = await invoiceRepo.list();

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
    categoryId: inv.categoryId ?? null,
    pendingFileId: inv.pendingFileId ?? null,
    expectedInvoiceId: inv.expectedInvoiceId ?? null,
  }));

  const items = finals;

  return json({ count: items.length, items });
}
