import { json } from '@sveltejs/kit';
import { ExpectedInvoiceRepository } from '@server/database/repositories/expected-invoice';
import { InvoiceRepository } from '@server/database/repositories/invoice';

type ExpectedInvoice = {
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
};

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
  const expectedInvoiceRepo = new ExpectedInvoiceRepository();
  const invoiceRepo = new InvoiceRepository();

  // Obtener todas las facturas esperadas con archivos matcheados
  const expectedInvoices = await expectedInvoiceRepo.listWithFiles();

  const expected: ExpectedInvoice[] = expectedInvoices.map((inv) => ({
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
  }));

  // Obtener facturas finales (procesadas) para mostrarlas aunque no estén en Excel
  const invoices = await invoiceRepo.list();

  const toISODate = (value: Date | string | null | undefined) => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    return value.toISOString().slice(0, 10);
  };

  const finals: FinalInvoice[] = invoices
    .filter((inv) => inv.pendingFileId !== undefined && inv.pendingFileId !== null)
    .map((inv) => ({
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

  const items = [...expected, ...finals];

  return json({ count: items.length, items });
}
