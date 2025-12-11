import { json } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';
import { ExpectedInvoiceRepository } from '@server/database/repositories/expected-invoice';

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
  categoryId?: number | null;
};

type PdfInvoice = {
  source: 'pdf';
  file: string;
  cuit_guess?: string;
  year?: string;
};

type KnownInvoice = ExpectedInvoice | PdfInvoice;

function listPdfInvoices(processedDir: string): PdfInvoice[] {
  if (!fs.existsSync(processedDir)) return [];
  const results: PdfInvoice[] = [];
  const cuitDirs = fs.readdirSync(processedDir).filter((d) => {
    const full = path.join(processedDir, d);
    return fs.statSync(full).isDirectory();
  });
  for (const cuit of cuitDirs) {
    const cuitPath = path.join(processedDir, cuit);
    const yearDirs = fs.readdirSync(cuitPath).filter((d) => {
      const full = path.join(cuitPath, d);
      return fs.statSync(full).isDirectory();
    });
    for (const year of yearDirs) {
      const yearPath = path.join(cuitPath, year);
      const pdfs = fs.readdirSync(yearPath).filter((f) => f.toLowerCase().endsWith('.pdf'));
      for (const pdf of pdfs) {
        results.push({
          source: 'pdf',
          file: path.join(yearPath, pdf),
          cuit_guess: cuit,
          year,
        });
      }
    }
  }
  return results;
}

export async function GET() {
  // During client dev, CWD is client/, so go up one level to reach project data/
  const rootDir = path.join(process.cwd(), '..');
  const processedDir = path.join(rootDir, 'data', 'processed');

  const expectedInvoiceRepo = new ExpectedInvoiceRepository();
  const expectedInvoices = expectedInvoiceRepo.list();

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
    categoryId: inv.categoryId,
  }));

  const pdfs = listPdfInvoices(processedDir);
  const data: KnownInvoice[] = [...expected, ...pdfs];
  return json({ count: data.length, items: data });
}
