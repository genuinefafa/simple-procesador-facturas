import { json } from '@sveltejs/kit';
import { ExpectedInvoiceRepository } from '@server/database/repositories/expected-invoice';
import { InvoiceRepository } from '@server/database/repositories/invoice';
import { FileRepository } from '@server/database/repositories/file';

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
  matchedFileId?: number | null;
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
  fileId?: number | null;
  expectedInvoiceId?: number | null;
};

export async function GET() {
  const invoiceRepo = new InvoiceRepository();
  const expectedRepo = new ExpectedInvoiceRepository();
  const fileRepo = new FileRepository();

  const invoices = await invoiceRepo.list();
  const expectedInvoices = await expectedRepo.listWithFiles({
    status: ['pending', 'discrepancy', 'manual', 'ignored'],
  });

  const toISODate = (value: Date | string | null | undefined) => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    return value.toISOString().slice(0, 10);
  };

  const finals: FinalInvoice[] = invoices.map((inv) => {
    // Obtener datos de archivo via fileId
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
      emitterName: undefined,
      issueDate: toISODate(inv.issueDate),
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

  const expecteds: ExpectedInvoice[] = expectedInvoices
    .filter((inv) => inv.matchedFileId == null)
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
      matchedFileId: inv.matchedFileId ?? null,
    }));

  const items = [...expecteds, ...finals];

  return json({ count: items.length, items });
}
