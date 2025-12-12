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

  return json({ count: expected.length, items: expected });
}
