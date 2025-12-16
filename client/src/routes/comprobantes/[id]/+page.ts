import type { PageLoad } from './$types';

// Re-definir tipos aquí (sin circular import)
export type Final = {
  source: 'final';
  id: number;
  cuit: string;
  emitterName?: string | null;
  issueDate: string | null;
  processedAt?: string | null;
  invoiceType: string | null;
  pointOfSale: number | null;
  invoiceNumber: number | null;
  total?: number | null;
  file?: string;
  filePath?: string;
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
  filePath?: string;
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
  extractedType?: string | null;
  extractedPointOfSale?: number | null;
  extractedInvoiceNumber?: number | null;
  extractionConfidence?: number | null;
  extractionMethod?: string | null;
  extractionErrors?: string | null;
};

export type Match = {
  id: number;
  cuit: string;
  emitterName?: string | null;
  issueDate: string;
  invoiceType: string;
  pointOfSale: number;
  invoiceNumber: number;
  total?: number | null;
  status?: string;
  matchScore: number;
};

export type Comprobante = {
  id: string;
  kind: 'factura' | 'expected' | 'pending';
  final: Final | null;
  expected: Expected | null;
  pending: Pending | null;
  matches?: Match[];
  emitterCuit?: string | null;
  emitterName?: string | null;
};

export const load: PageLoad = async ({ fetch, params }) => {
  const [idType, idVal] = params.id.split(':');
  const id = parseInt(idVal, 10);

  let comprobante: Comprobante | null = null;

  try {
    if (idType === 'factura') {
      const res = await fetch(`/api/invoices/${id}`);
      if (res.ok) {
        const data = await res.json();
        const base = data.invoice || data;

        const final: Final = {
          source: 'final',
          id: base.id,
          cuit: base.emitterCuit,
          emitterName: base.emitterName,
          issueDate: base.issueDate,
          processedAt: base.processedAt || null,
          invoiceType: base.invoiceType,
          pointOfSale: base.pointOfSale,
          invoiceNumber: base.invoiceNumber,
          total: base.total,
          file: base.processedFile,
          filePath: base.processedFile,
          fileHash: base.fileHash,
          expectedInvoiceId: base.expectedInvoiceId,
          pendingFileId: base.pendingFileId,
        };

        let expected: Expected | null = null;
        if (final.expectedInvoiceId) {
          const expRes = await fetch('/api/expected-invoices');
          if (expRes.ok) {
            const expData = await expRes.json();
            const exp = (expData.invoices || []).find((e: any) => e.id === final.expectedInvoiceId);
            if (exp) {
              expected = {
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
                filePath: exp.filePath,
                matchedPendingFileId: exp.matchedPendingFileId ?? null,
              };
            }
          }
        }

        let pending: Pending | null = null;
        if (final.pendingFileId) {
          const pRes = await fetch(`/api/pending-files/${final.pendingFileId}`);
          if (pRes.ok) {
            const pData = await pRes.json();
            const d = pData.pendingFile || pData;
            pending = {
              id: d.id,
              originalFilename: d.originalFilename,
              filePath: d.filePath,
              status: d.status,
              extractedCuit: d.extractedCuit,
              extractedDate: d.extractedDate,
              extractedTotal: d.extractedTotal,
              extractedType: d.extractedType,
              extractedPointOfSale: d.extractedPointOfSale,
              extractedInvoiceNumber: d.extractedInvoiceNumber,
              extractionConfidence: d.extractionConfidence,
              extractionMethod: d.extractionMethod,
              extractionErrors: d.extractionErrors,
            };
          }
        }

        comprobante = {
          id: `factura:${final.id}`,
          kind: 'factura',
          final,
          expected,
          pending,
          emitterCuit: final.cuit,
          emitterName: final.emitterName,
        };
      }
    } else if (idType === 'expected') {
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
            filePath: exp.filePath,
            matchedPendingFileId: exp.matchedPendingFileId ?? null,
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
      const res = await fetch(`/api/pending-files/${id}`);
      if (res.ok) {
        const response = await res.json();
        const data = response.pendingFile; // { success, pendingFile }
        const pending: Pending = {
          id: data.id,
          originalFilename: data.originalFilename,
          filePath: data.filePath,
          status: data.status,
          extractedCuit: data.extractedCuit,
          extractedDate: data.extractedDate,
          extractedTotal: data.extractedTotal,
          extractedType: data.extractedType,
          extractedPointOfSale: data.extractedPointOfSale,
          extractedInvoiceNumber: data.extractedInvoiceNumber,
          extractionConfidence: data.extractionConfidence,
          extractionMethod: data.extractionMethod,
          extractionErrors: data.extractionErrors,
        };

        let matches: Match[] = [];
        try {
          const matchRes = await fetch(`/api/pending-files/${id}/matches`);
          if (matchRes.ok) {
            const matchData = await matchRes.json();
            if (matchData.hasExactMatch && matchData.exactMatch) {
              matches = [matchData.exactMatch];
            }
            const additional = matchData.partialMatches || matchData.candidates || [];
            matches = [
              ...matches,
              ...additional.filter((m: any) => !matches.find((e) => e.id === m.id)),
            ];
          }
        } catch (e) {
          console.warn('No se pudieron cargar matches:', e);
        }

        comprobante = {
          id: `pending:${pending.id}`,
          kind: 'pending',
          final: null,
          expected: null,
          pending,
          matches,
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
