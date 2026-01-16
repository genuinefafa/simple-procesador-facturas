import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';

// Re-definir tipos aquí (sin circular import)
export type Final = {
  source: 'final';
  id: number;
  cuit: string;
  emitterName?: string | null;
  issueDate: string | null;
  processedAt?: string | null;
  invoiceType: number | null; // Código ARCA numérico
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
  invoiceType: number | null; // Código ARCA numérico
  pointOfSale: number;
  invoiceNumber: number;
  total?: number | null;
  status?: string;
  file?: string;
  filePath?: string;
  matchedFileId?: number | null;
};

export type FileData = {
  id: number;
  originalFilename: string;
  filePath: string;
  fileHash?: string | null;
  status: 'uploaded' | 'processed' | 'failed';
  extractedCuit?: string | null;
  extractedDate?: string | null;
  extractedTotal?: number | null;
  extractedType?: number | null; // Código ARCA numérico
  extractedPointOfSale?: number | null;
  extractedInvoiceNumber?: number | null;
  extractionConfidence?: number | null;
  extractionMethod?: string | null;
  extractionErrors?: string | null;
  linkedInvoiceId?: number | null; // ID de la factura vinculada a este archivo
};

export type Match = {
  id: number;
  cuit: string;
  emitterName?: string | null;
  issueDate: string;
  invoiceType: number | null; // Código ARCA numérico
  pointOfSale: number;
  invoiceNumber: number;
  total?: number | null;
  status?: string;
  matchScore: number;
};

export type Comprobante = {
  id: string;
  kind: 'factura' | 'expected' | 'file';
  final: Final | null;
  expected: Expected | null;
  file: FileData | null; // Archivo sin factura asociada
  matches?: Match[];
  emitterCuit?: string | null;
  emitterName?: string | null;
};

export const load: PageLoad = async ({ fetch, params }) => {
  const [idType, idVal] = params.id.split(':');
  const id = parseInt(idVal, 10);

  let comprobante: Comprobante | null = null;
  let categories: Array<{ id: number; key: string; description: string }> = [];

  // Cargar categorías para dropdown/visualización
  try {
    const catRes = await fetch('/api/categories');
    if (catRes.ok) {
      const catData = await catRes.json();
      categories = (catData.items || []) as Array<{ id: number; key: string; description: string }>;
    }
  } catch {
    // ignore
  }

  try {
    if (idType === 'factura') {
      const res = await fetch(`/api/invoices/${id}`);
      if (res.ok) {
        const data = await res.json();
        const base = data.invoice || data;
        console.log('[LOADER] API response base:', { id: base.id, categoryId: base.categoryId });

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
          categoryId: base.categoryId ?? null,
          expectedInvoiceId: base.expectedInvoiceId,
          fileId: base.fileId ?? null,
        };
        console.log('[LOADER] final object:', { id: final.id, categoryId: final.categoryId });

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
                matchedFileId: exp.matchedFileId ?? null,
              };
            }
          }
        }

        // Cargar archivo asociado (si existe fileId)
        let file: FileData | null = null;
        const fileIdToLoad = final.fileId;
        if (fileIdToLoad) {
          const fileRes = await fetch(`/api/files/${fileIdToLoad}`);
          if (fileRes.ok) {
            const fileData = await fileRes.json();
            const d = fileData.file || fileData;
            file = {
              id: d.id,
              originalFilename: d.originalFilename,
              filePath: d.filePath,
              fileHash: d.fileHash,
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

        // Cargar matches si la factura no tiene expected vinculado y tiene archivo
        let matches: Match[] = [];
        if (!final.expectedInvoiceId && fileIdToLoad) {
          try {
            const matchRes = await fetch(`/api/files/${fileIdToLoad}/matches`);
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
          } catch (err) {
            console.warn('No se pudieron cargar matches para factura:', err);
          }
        }

        comprobante = {
          id: `factura:${final.id}`,
          kind: 'factura',
          final,
          expected,
          file,
          matches,
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
            matchedFileId: exp.matchedFileId ?? null,
          };
          comprobante = {
            id: `expected:${expected.id}`,
            kind: 'expected',
            final: null,
            expected,
            file: null,
            emitterCuit: expected.cuit,
            emitterName: expected.emitterName,
          };
        }
      }
    } else if (idType === 'file' || idType === 'pending') {
      // Soportar tanto 'file:N' (nuevo) como 'pending:N' (legacy)
      // Usar endpoint /api/files
      const res = await fetch(`/api/files/${id}`);
      if (res.ok) {
        const response = await res.json();
        const data = response.file;

        // IMPORTANTE: Si el archivo ya tiene una factura vinculada, redirigir automáticamente
        // Esto evita que el usuario pueda crear facturas duplicadas desde un archivo ya procesado
        let linkedInvoiceId: number | null = null;
        try {
          const invoicesRes = await fetch(`/api/invoices?fileId=${id}`);
          if (invoicesRes.ok) {
            const invoicesData = await invoicesRes.json();
            if (invoicesData.invoices && invoicesData.invoices.length > 0) {
              linkedInvoiceId = invoicesData.invoices[0].id;

              // Redirigir automáticamente a la factura (HTTP 302)
              console.info(
                `[FILE→FACTURA] Redirigiendo de file:${id} a factura:${linkedInvoiceId}`
              );
              throw redirect(302, `/comprobantes/factura:${linkedInvoiceId}`);
            }
          }
        } catch (err) {
          // Si es un redirect de SvelteKit, re-lanzarlo
          if (err && typeof err === 'object' && 'status' in err && (err as any).status === 302) {
            throw err;
          }
          console.warn('No se pudo verificar factura vinculada:', err);
        }

        const file: FileData = {
          id: data.id,
          originalFilename: data.originalFilename,
          filePath: data.filePath,
          fileHash: data.fileHash,
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
          linkedInvoiceId,
        };

        let matches: Match[] = [];
        try {
          // Usar nuevo endpoint /api/files/[id]/matches
          const matchRes = await fetch(`/api/files/${id}/matches`);
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
        } catch (err) {
          console.warn('No se pudieron cargar matches:', err);
        }

        comprobante = {
          id: `file:${file.id}`,
          kind: 'file',
          final: null,
          expected: null,
          file,
          matches,
          emitterCuit: file.extractedCuit,
        };
      }
    }
  } catch (e) {
    // IMPORTANTE: Si es un redirect de SvelteKit, re-lanzarlo sin convertir a error
    if (e && typeof e === 'object' && 'status' in e && 'location' in e) {
      throw e; // Re-lanzar redirect
    }
    console.error('Error loading comprobante:', e);
  }

  if (!comprobante) {
    throw new Error(`Comprobante no encontrado: ${params.id}`);
  }

  return { comprobante, categories };
};
