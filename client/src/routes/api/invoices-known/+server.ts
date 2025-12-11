import { json } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

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

function listExpectedInvoices(dbPath: string): ExpectedInvoice[] {
  if (!fs.existsSync(dbPath)) return [];
  const db = new Database(dbPath);
  const rows = db
    .prepare(
      `SELECT id, cuit, emitter_name as emitterName, issue_date as issueDate, invoice_type as invoiceType,
              point_of_sale as pointOfSale, invoice_number as invoiceNumber, total, status, category_id as categoryId
       FROM expected_invoices
       ORDER BY issue_date DESC`
    )
    .all() as Array<{
    id: number;
    cuit: string;
    emitterName: string | null;
    issueDate: string;
    invoiceType: string;
    pointOfSale: number;
    invoiceNumber: number;
    total: number | null;
    status: string;
    categoryId: number | null;
  }>;

  return rows.map((r) => ({
    source: 'expected',
    id: r.id,
    cuit: r.cuit,
    emitterName: r.emitterName,
    issueDate: r.issueDate,
    invoiceType: r.invoiceType,
    pointOfSale: r.pointOfSale,
    invoiceNumber: r.invoiceNumber,
    total: r.total,
    status: r.status,
    categoryId: r.categoryId,
  }));
}

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
  const dbPath = path.join(rootDir, 'data', 'database.sqlite');
  const expected = listExpectedInvoices(dbPath);
  const pdfs = listPdfInvoices(processedDir);
  const data: KnownInvoice[] = [...expected, ...pdfs];
  return json({ count: data.length, items: data });
}
