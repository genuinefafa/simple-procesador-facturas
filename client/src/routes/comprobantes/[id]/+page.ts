import type { PageLoad } from './$types';

// Re-definir tipos aquí (sin circular import)
export type Final = {
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
  invoiceType: string;
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
  status: 'pending' | 'reviewing' | 'processed' | 'failed';
  extractedCuit?: string | null;
  extractedDate?: string | null;
  extractedTotal?: number | null;
};

export type Comprobante = {
  id: string;
  kind: 'factura' | 'expected' | 'pending';
  final: Final | null;
  expected: Expected | null;
  pending: Pending | null;
  emitterCuit?: string | null;
  emitterName?: string | null;
};

export const load: PageLoad = async ({ fetch, params }) => {
  const [idType, idVal] = params.id.split(':');
  const id = parseInt(idVal, 10);

  let comprobante: Comprobante | null = null;

  try {
    if (idType === 'factura') {
      // Fetch factura desde /api/invoices/:id
      const res = await fetch(`/api/invoices/${id}`);
      if (res.ok) {
        const data = await res.json();
        // Mapear respuesta a Final
        const final: Final = {
          source: 'final',
          id: data.id,
          cuit: data.emitterCuit,
          emitterName: undefined,
          issueDate: data.issueDate,
          invoiceType: data.invoiceType,
          pointOfSale: data.pointOfSale,
          invoiceNumber: data.invoiceNumber,
          total: data.total,
          file: data.processedFile,
          fileHash: data.fileHash,
          expectedInvoiceId: data.expectedInvoiceId,
          pendingFileId: data.pendingFileId,
        };
        comprobante = {
          id: `factura:${final.id}`,
          kind: 'factura',
          final,
          expected: null,
          pending: null,
          emitterCuit: final.cuit,
        };
      }
    } else if (idType === 'expected') {
      // Fetch desde /api/expected-invoices
      const res = await fetch(`/api/expected-invoices`);
      if (res.ok) {
        const data = await res.json();
        const exp = (data.invoices || []).find((e: any) => e.id === id);
        if (exp) {
          const expected: Expected = {
            source: 'expected',
            id: exp.id,
            cuit: exp.cuit,
            emitterName: exp.emitterName,
            issueDate: exp.issueDate,
            invoiceType: exp.invoiceType,
            pointOfSale: exp.pointOfSale,
            invoiceNumber: exp.invoiceNumber,
            total: exp.total,
            status: exp.status,
            file: exp.filePath,
          };
          comprobante = {
            id: `expected:${expected.id}`,
            kind: 'expected',
            final: null,
            expected,
            pending: null,
            emitterCuit: expected.cuit,
            emitterName: expected.emitterName,
          };
        }
      }
    } else if (idType === 'pending') {
      // Fetch desde /api/pending-files/:id
      const res = await fetch(`/api/pending-files/${id}`);
      if (res.ok) {
        const data = await res.json();
        const pending: Pending = {
          id: data.id,
          originalFilename: data.originalFilename,
          filePath: data.filePath,
          status: data.status,
          extractedCuit: data.extractedCuit,
          extractedDate: data.extractedDate,
          extractedTotal: data.extractedTotal,
        };
        comprobante = {
          id: `pending:${pending.id}`,
          kind: 'pending',
          final: null,
          expected: null,
          pending,
          emitterCuit: pending.extractedCuit,
        };
      }
    }
  } catch (e) {
    console.error('Error loading comprobante:', e);
  }

  if (!comprobante) {
    throw new Error(`Comprobante no encontrado: ${params.id}`);
  }

  return { comprobante };
};
