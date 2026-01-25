/**
 * Tipos canónicos del módulo Comprobantes.
 * Fuente de verdad única — todos los endpoints y páginas importan de aquí.
 */

export type Final = {
  source: 'final';
  id: number;
  cuit: string;
  emitterName?: string | null;
  issueDate: string | null;
  processedAt?: string | null;
  invoiceType: number | null;
  pointOfSale: number | null;
  invoiceNumber: number | null;
  total?: number | null;
  file?: string;
  filePath?: string;
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
  invoiceType: number | null;
  pointOfSale: number;
  invoiceNumber: number;
  total?: number | null;
  status?: string;
  categoryId?: number | null;
};

export type FileData = {
  id: number;
  originalFilename: string;
  filePath: string;
  fileHash?: string | null;
  status: 'uploaded' | 'processed' | 'failed';
  uploadDate?: string | null;
  extractedCuit?: string | null;
  extractedDate?: string | null;
  extractedTotal?: number | null;
  extractedType?: number | null;
  extractedPointOfSale?: number | null;
  extractedInvoiceNumber?: number | null;
  extractionConfidence?: number | null;
  extractionMethod?: string | null;
  extractionErrors?: string | null;
  linkedInvoiceId?: number | null;
};

export type Match = {
  id: number;
  cuit: string;
  emitterName?: string | null;
  issueDate: string;
  invoiceType: number | null;
  pointOfSale: number;
  invoiceNumber: number;
  total?: number | null;
  status?: string;
  matchScore: number;
  categoryId?: number | null;
};

export type Comprobante = {
  /** ID único: "factura:123" | "expected:456" | "file:789" */
  id: string;
  kind: 'factura' | 'expected' | 'file';
  final: Final | null;
  expected: Expected | null;
  file: FileData | null;
  matches?: Match[];
  emitterCuit?: string | null;
  emitterName?: string | null;
  /** Fecha representativa según kind: issueDate (final/expected), uploadDate (file) */
  effectiveDate: string | null;
};
