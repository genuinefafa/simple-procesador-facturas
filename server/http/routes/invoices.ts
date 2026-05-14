/**
 * Hono router for /api/invoices/*.
 *
 * Mirror of client/src/routes/api/invoices/**\/+server.ts during the
 * SvelteKit → Hono migration. Logic is intentionally identical; only the
 * HTTP plumbing changes (json() → c.json(), params → c.req.param(), etc).
 * Both routers stay alive in parallel until the deploy switch.
 *
 * See docs/MIGRATION_BUN_HONO.md.
 */

import { Hono } from 'hono';
import { existsSync } from 'fs';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { join } from 'path';

import { InvoiceRepository } from '../../database/repositories/invoice';
import { EmitterRepository } from '../../database/repositories/emitter';
import { FileRepository } from '../../database/repositories/file';
import { getDatabase } from '../../database/connection';
import { InvoiceFileService } from '../../services/invoice-file.service';
import {
  createFileExportService,
  getInvoiceRepository,
  getFileRepository,
  getFileExtractionRepository,
  createInvoiceProcessingService,
  createInvoiceCreationService,
} from '../../factories';
import { InvoicePatchSchema, QrPasteSchema, formatZodError } from '../../contracts';
import { extractFromAFIPUrl } from '../../extractors/qr-extractor';
import { calculateFileHash } from '../../utils/file-hash';
import type {
  InvoiceCreationData,
  InvoiceCreationOptions,
} from '../../services/invoice-creation.service';
import type { Invoice } from '@shared/types';

const DATA_DIR = join(process.cwd(), '..', 'data');
const OUTPUT_DIR = join(process.cwd(), '..', 'data', 'finalized');
const UPLOAD_DIR = join(process.cwd(), '..', 'data', 'input');

export const invoicesRouter = new Hono();

// GET /api/invoices — lista
invoicesRouter.get('/', async (c) => {
  try {
    const repo = new InvoiceRepository();

    const fileIdParam = c.req.query('fileId');
    if (fileIdParam) {
      const fileId = parseInt(fileIdParam, 10);
      if (!isNaN(fileId)) {
        const invoices = await repo.findByFileId(fileId);
        return c.json({ success: true, invoices });
      }
    }

    const expectedIdParam = c.req.query('expectedInvoiceId');
    if (expectedIdParam) {
      const expectedInvoiceId = parseInt(expectedIdParam, 10);
      if (!isNaN(expectedInvoiceId)) {
        const invoices = await repo.findByExpectedInvoiceId(expectedInvoiceId);
        return c.json({ success: true, invoices });
      }
    }

    const invoices = await repo.list();
    return c.json({ success: true, invoices });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ success: false, error: message }, 500);
  }
});

// GET /api/invoices/search
invoicesRouter.get('/search', async (c) => {
  const query = c.req.query('q')?.trim() ?? '';
  const limitParam = c.req.query('limit');
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 0, 1), 50) : 20;

  try {
    const repo = new InvoiceRepository();
    const items = query ? await repo.search(query, limit) : [];
    return c.json({ success: true, items });
  } catch (error) {
    console.error('❌ [API] /api/invoices/search error:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      500
    );
  }
});

// POST /api/invoices/export
invoicesRouter.post('/export', async (c) => {
  try {
    const body: unknown = await c.req.json();
    const { invoiceIds } = body as { invoiceIds: number[] };

    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return c.json({ success: false, error: 'Se requiere un array de IDs de facturas' }, 400);
    }

    const invoiceRepo = getInvoiceRepository();
    const fileRepo = getFileRepository();
    const exportService = createFileExportService(OUTPUT_DIR);

    const invoices = (await Promise.all(invoiceIds.map((id) => invoiceRepo.findById(id)))).filter(
      (inv) => inv !== null
    );

    if (invoices.length === 0) {
      return c.json({ success: false, error: 'No se encontraron facturas' }, 404);
    }

    const results = invoices.map((invoice) => {
      let originalPath = '';
      if (invoice.fileId) {
        const file = fileRepo.findById(invoice.fileId);
        if (file) {
          originalPath = join(DATA_DIR, file.storagePath);
        }
      }
      return {
        invoice,
        result: exportService.exportInvoice(invoice, originalPath),
      };
    });

    const successful = results.filter((r) => r.result.success);
    const failed = results.filter((r) => !r.result.success);

    return c.json({
      success: failed.length === 0,
      message: `Exportadas ${successful.length}/${invoices.length} facturas`,
      stats: {
        total: invoices.length,
        successful: successful.length,
        failed: failed.length,
      },
      results: results.map((r) => ({
        invoiceId: r.invoice.id,
        fullInvoiceNumber: r.invoice.fullInvoiceNumber,
        success: r.result.success,
        newPath: r.result.newPath,
        error: r.result.error,
      })),
    });
  } catch (error) {
    console.error('Error exporting invoices:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      500
    );
  }
});

// POST /api/invoices/upload
invoicesRouter.post('/upload', async (c) => {
  console.info('📤 [UPLOAD] Iniciando subida de archivos...');
  console.info('📤 [UPLOAD] Directorio destino:', UPLOAD_DIR);

  try {
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
      console.info('📁 [UPLOAD] Directorio creado');
    }

    const formData = await c.req.formData();
    const files = formData.getAll('files') as File[];
    const categoryIdRaw = formData.get('categoryId');
    const categoryId =
      typeof categoryIdRaw === 'string' && categoryIdRaw ? parseInt(categoryIdRaw, 10) : null;

    console.info(`📤 [UPLOAD] Archivos recibidos: ${files.length}`);
    if (categoryId !== null) {
      console.info(`📤 [UPLOAD] Categoría pre-seleccionada: ${categoryId}`);
    }

    if (!files || files.length === 0) {
      console.warn('⚠️  [UPLOAD] No se recibieron archivos');
      return c.json({ success: false, error: 'No se recibieron archivos' }, 400);
    }

    const uploadedFiles: Array<{
      fileId: number;
      name: string;
      size: number;
      path: string;
      hash: string | undefined;
      hashPreview: string | undefined;
    }> = [];
    const errors: Array<Record<string, unknown>> = [];
    const fileRepo = getFileRepository();
    const extractionRepo = getFileExtractionRepository();
    const invoiceRepo = getInvoiceRepository();
    const processingService = await createInvoiceProcessingService();

    for (const file of files) {
      console.info(`📄 [UPLOAD] Procesando: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`);

      try {
        const ext = file.name.split('.').pop()?.toLowerCase();
        const SUPPORTED_EXTENSIONS = [
          'pdf',
          'jpg',
          'jpeg',
          'png',
          'tif',
          'tiff',
          'webp',
          'heic',
          'heif',
        ];
        if (!ext || !SUPPORTED_EXTENSIONS.includes(ext)) {
          throw new Error(`Tipo no soportado. Formatos aceptados: PDF, JPG, PNG, TIF, WEBP, HEIC`);
        }

        if (file.size > 10 * 1024 * 1024) {
          throw new Error(`Archivo muy grande. Máximo 10MB`);
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        let filePath = join(UPLOAD_DIR, file.name);
        let savedFilename = file.name;

        if (existsSync(filePath)) {
          const timestamp = Date.now();
          const extname = file.name.split('.').pop();
          const basename = file.name.substring(
            0,
            file.name.length - (extname ? extname.length + 1 : 0)
          );
          savedFilename = `${basename}.${timestamp}.${extname}`;
          filePath = join(UPLOAD_DIR, savedFilename);
          console.info(`⚠️  [UPLOAD] Archivo ya existe, renombrando a: ${savedFilename}`);
        }

        await writeFile(filePath, buffer);
        console.info(`✅ [UPLOAD] Guardado: ${filePath}`);

        let fileHash: string | undefined;
        let hashPreview: string | undefined;
        try {
          const hashResult = await calculateFileHash(filePath);
          fileHash = hashResult.hash;
          hashPreview = fileHash.substring(0, 16);
          console.info(`🔐 [UPLOAD] Hash: ${hashPreview}...`);

          const existingFile = fileRepo.findByHash(fileHash);
          if (existingFile) {
            await unlink(filePath);

            const linkedInvoices = await invoiceRepo.findByFileId(existingFile.id);

            if (linkedInvoices.length > 0) {
              const linkedInvoice = linkedInvoices[0]!;
              throw new Error(
                JSON.stringify({
                  type: 'duplicate',
                  duplicateType: 'invoice',
                  duplicateId: linkedInvoice.id,
                  duplicateFilename: existingFile.originalFilename,
                  message: `Archivo duplicado (hash idéntico a factura:${linkedInvoice.id})`,
                })
              );
            } else {
              throw new Error(
                JSON.stringify({
                  type: 'duplicate',
                  duplicateType: 'file',
                  duplicateId: existingFile.id,
                  duplicateFilename: existingFile.originalFilename,
                  message: `Archivo duplicado (hash idéntico a file:${existingFile.id})`,
                })
              );
            }
          }
        } catch (error) {
          if (error instanceof Error && error.message.includes('duplicado')) {
            throw error;
          }
          console.warn(`⚠️  [UPLOAD] Error calculando hash:`, error);
        }

        const fileType = await processingService.detectDocumentType(filePath);
        const relativePath = `input/${savedFilename}`;

        const createdFile = fileRepo.create({
          originalFilename: savedFilename,
          fileType: fileType as 'PDF_DIGITAL' | 'PDF_IMAGEN' | 'IMAGEN' | 'HEIC',
          fileSize: file.size,
          fileHash: fileHash!,
          storagePath: relativePath,
          status: 'uploaded',
          categoryId: categoryId,
        });

        console.info(`📝 [UPLOAD] File creado en BD: ID ${createdFile.id}`);

        if (fileType === 'PDF_DIGITAL') {
          try {
            console.info(`🔍 [UPLOAD] Auto-extracting PDF_DIGITAL file ${createdFile.id}...`);
            const processingResult = await processingService.processInvoice(
              filePath,
              savedFilename
            );

            if (processingResult.extractedData) {
              const method = processingResult.method || 'PDF_TEXT';
              extractionRepo.upsertByMethod(createdFile.id, method, {
                extractedCuit: processingResult.extractedData.cuit || null,
                extractedDate: processingResult.extractedData.date || null,
                extractedTotal: processingResult.extractedData.total || null,
                extractedType: processingResult.extractedData.invoiceType || null,
                extractedPointOfSale: processingResult.extractedData.pointOfSale || null,
                extractedInvoiceNumber: processingResult.extractedData.invoiceNumber || null,
                confidence: processingResult.confidence || null,
                errors: processingResult.error || null,
              });
              console.info(
                `✅ [UPLOAD] Auto-extraction completed (conf: ${processingResult.confidence}%, method: ${method})`
              );
            } else {
              console.warn(`⚠️  [UPLOAD] No extracted data: ${processingResult.error}`);
            }
          } catch (extractionError) {
            console.warn(`⚠️  [UPLOAD] Auto-extraction error:`, extractionError);
          }
        } else {
          console.info(
            `📋 [UPLOAD] Skipping auto-extraction for ${fileType} file ${createdFile.id} — user can trigger manually`
          );
        }

        uploadedFiles.push({
          fileId: createdFile.id,
          name: savedFilename,
          size: file.size,
          path: filePath,
          hash: fileHash,
          hashPreview,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        console.warn(`⚠️  [UPLOAD] Error con ${file.name}: ${errorMessage}`);

        let errorData: Record<string, unknown> = { message: errorMessage };
        try {
          errorData = JSON.parse(errorMessage) as Record<string, unknown>;
        } catch {
          // not JSON, keep simple message
        }

        errors.push({
          name: file.name,
          error: (errorData.message as string) || errorMessage,
          ...errorData,
        });
      }
    }

    const successCount = uploadedFiles.length;
    const errorCount = errors.length;
    const totalCount = successCount + errorCount;

    console.info(`✅ [UPLOAD] Completado: ${successCount}/${totalCount} archivo(s) subido(s)`);

    if (errorCount > 0) {
      console.warn(`⚠️  [UPLOAD] Errores: ${errorCount} archivo(s) fallaron`);
    }

    const hasSuccess = successCount > 0;

    return c.json({
      success: hasSuccess,
      message: hasSuccess
        ? `${successCount} de ${totalCount} archivo(s) subido(s) correctamente`
        : `No se pudo subir ningún archivo`,
      uploadedFiles,
      errors,
      summary: {
        total: totalCount,
        success: successCount,
        failed: errorCount,
      },
    });
  } catch (error) {
    console.error('❌ [UPLOAD] Error:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      500
    );
  }
});

// GET /api/invoices/pending
invoicesRouter.get('/pending', async (c) => {
  try {
    const invoiceRepo = new InvoiceRepository();
    const emitterRepo = new EmitterRepository();

    const pendingInvoices = await invoiceRepo.list({ limit: 50 });

    const enrichedInvoices = pendingInvoices.map((invoice: Invoice) => {
      const emitter = emitterRepo.findByCUIT(invoice.emitterCuit);
      return {
        id: invoice.id,
        emitterCuit: invoice.emitterCuit,
        emitterName: emitter?.name || 'Desconocido',
        emitterAlias: emitter?.aliases[0] || null,
        issueDate: invoice.issueDate,
        invoiceType: invoice.invoiceType,
        fullInvoiceNumber: invoice.fullInvoiceNumber,
        total: invoice.total,
        fileId: invoice.fileId,
      };
    });

    return c.json({
      success: true,
      count: enrichedInvoices.length,
      invoices: enrichedInvoices,
    });
  } catch (error) {
    console.error('Error fetching pending invoices:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      500
    );
  }
});

// POST /api/invoices/process
invoicesRouter.post('/process', async (c) => {
  console.info('⚙️  [PROCESS] Iniciando procesamiento de facturas...');

  try {
    const body: unknown = await c.req.json();
    const { fileIds, method } = body as {
      fileIds?: number[];
      method?: 'ocr' | 'pdf_text' | 'qr';
    };

    console.info(
      `⚙️  [PROCESS] Files a procesar: ${fileIds?.length || 0}, método: ${method || 'auto'}`
    );

    const methodMap: Record<string, 'OCR' | 'PDF_TEXT' | 'QR'> = {
      ocr: 'OCR',
      pdf_text: 'PDF_TEXT',
      qr: 'QR',
    };
    const forcedMethod = method ? methodMap[method] : undefined;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      console.warn('⚠️  [PROCESS] No se recibió array de fileIds');
      return c.json({ success: false, error: 'Se requiere un array de fileIds' }, 400);
    }

    const fileRepo = getFileRepository();
    const extractionRepo = getFileExtractionRepository();
    const processingService = await createInvoiceProcessingService();

    const files = fileIds.map((id) => fileRepo.findById(id)).filter((f) => f !== null);

    if (files.length === 0) {
      return c.json({ success: false, error: 'No se encontraron archivos' }, 404);
    }

    console.info('⚙️  [PROCESS] Service inicializado, procesando...');

    const results = [];
    let processedCount = 0;
    let pendingCount = 0;
    let failedCount = 0;

    for (const file of files) {
      console.info(`📝 Procesando file ID ${file.id}: ${file.originalFilename}`);

      const absolutePath = file.storagePath.startsWith('/')
        ? file.storagePath
        : join(process.cwd(), '..', 'data', file.storagePath);

      const result = await processingService.processInvoice(absolutePath, file.originalFilename, {
        forceMethod: forcedMethod,
      });

      if (result.extractedData) {
        const extractionMethod = result.method || 'OCR';
        console.info(`💾 Guardando extracción [${extractionMethod}] para file ${file.id}`);

        extractionRepo.upsertByMethod(file.id, extractionMethod, {
          extractedCuit: result.extractedData.cuit || null,
          extractedDate: result.extractedData.date || null,
          extractedTotal: result.extractedData.total || null,
          extractedType: result.extractedData.invoiceType || null,
          extractedPointOfSale: result.extractedData.pointOfSale || null,
          extractedInvoiceNumber: result.extractedData.invoiceNumber || null,
          confidence: result.confidence || null,
          errors: result.error || null,
        });
      }

      if (result.success && result.confidence >= 80) {
        console.info(`✅ Extracción exitosa (conf: ${result.confidence}%) — listo para revisión`);
        processedCount++;
      } else if (result.requiresReview) {
        console.info(`⚠️  Requiere revisión manual (conf: ${result.confidence}%)`);
        fileRepo.updateStatus(file.id, 'uploaded');
        pendingCount++;
      } else {
        console.warn(`❌ Procesamiento falló: ${result.error}`);
        failedCount++;
      }

      results.push({
        fileId: file.id,
        success: result.success,
        fileName: file.originalFilename,
        error: result.error,
        requiresReview: result.requiresReview,
        confidence: result.confidence,
        extractedData: result.extractedData,
      });
    }

    const stats = {
      total: results.length,
      processed: processedCount,
      pending: pendingCount,
      failed: failedCount,
    };

    console.info(
      `✅ [PROCESS] Completado: ${stats.processed} procesadas, ${stats.pending} pendientes, ${stats.failed} fallidas`
    );

    return c.json({
      success: true,
      message: `Procesadas ${stats.processed}/${stats.total} facturas. ${stats.pending} requieren revisión.`,
      stats,
      results,
    });
  } catch (error) {
    console.error('❌ [PROCESS] Error:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      500
    );
  }
});

// POST /api/invoices/qr-paste/:fileId
invoicesRouter.post('/qr-paste/:fileId', async (c) => {
  const fileId = parseInt(c.req.param('fileId'), 10);
  if (isNaN(fileId)) {
    return c.json({ success: false, error: 'ID de archivo inválido' }, 400);
  }

  const body: unknown = await c.req.json();
  const parsed = QrPasteSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(formatZodError(parsed.error), 400);
  }

  const fileRepo = getFileRepository();
  const file = fileRepo.findById(fileId);
  if (!file) {
    return c.json({ success: false, error: 'Archivo no encontrado' }, 404);
  }

  const result = extractFromAFIPUrl(parsed.data.qrUrl);
  if (!result.success) {
    return c.json(
      { success: false, error: result.errors?.[0] || 'URL de QR AFIP/ARCA inválida' },
      400
    );
  }

  const extractionRepo = getFileExtractionRepository();
  extractionRepo.upsertByMethod(fileId, 'QR', {
    extractedCuit: result.data.cuit || null,
    extractedDate: result.data.date || null,
    extractedTotal: result.data.total ?? null,
    extractedType: result.data.invoiceType ?? null,
    extractedPointOfSale: result.data.pointOfSale ?? null,
    extractedInvoiceNumber: result.data.invoiceNumber ?? null,
    confidence: result.confidence,
    errors: null,
  });

  console.info(`✅ [QR-PASTE] file ${fileId}: extracción persistida (conf ${result.confidence}%)`);

  return c.json({
    success: true,
    extraction: {
      confidence: result.confidence,
      data: result.data,
    },
  });
});

// POST /api/invoices/from-file/:fileId
invoicesRouter.post('/from-file/:fileId', async (c) => {
  try {
    const fileId = parseInt(c.req.param('fileId'), 10);
    if (isNaN(fileId)) {
      return c.json({ success: false, error: 'ID de archivo inválido' }, 400);
    }

    const body: unknown = await c.req.json();
    const { source, expectedId, data } = body as {
      source: 'extraction' | 'expected' | 'manual';
      expectedId?: number;
      data: InvoiceCreationData;
    };

    if (!source || !data) {
      return c.json({ success: false, error: 'Se requieren campos: source, data' }, 400);
    }

    if (
      !data.cuit ||
      !data.invoiceType ||
      data.pointOfSale == null ||
      data.invoiceNumber == null ||
      !data.issueDate ||
      !data.total
    ) {
      return c.json({ success: false, error: 'Datos de factura incompletos' }, 400);
    }

    const options: InvoiceCreationOptions = { source, expectedId };

    const service = createInvoiceCreationService();
    const result = await service.createFromFile(fileId, data, options);

    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }

    return c.json({ success: true, invoice: result.invoice });
  } catch (error) {
    console.error('❌ [FROM-FILE] Error:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      500
    );
  }
});

// PATCH /api/invoices/:id/emisor
invoicesRouter.patch('/:id/emisor', async (c) => {
  try {
    const invoiceId = parseInt(c.req.param('id'), 10);

    if (isNaN(invoiceId)) {
      return c.json({ success: false, error: 'ID de factura inválido' }, 400);
    }

    const body = await c.req.json<{ newCuit?: string }>();
    const { newCuit } = body;

    if (!newCuit) {
      return c.json({ success: false, error: 'Missing required field: newCuit' }, 400);
    }

    const invoiceRepo = new InvoiceRepository();
    const emitterRepo = new EmitterRepository();

    const invoice = await invoiceRepo.findById(invoiceId);
    if (!invoice) {
      return c.json({ success: false, error: 'Factura no encontrada' }, 404);
    }

    const newEmitter = emitterRepo.findByCUIT(newCuit);
    if (!newEmitter) {
      return c.json({ success: false, error: 'Emisor destino no encontrado' }, 404);
    }

    const db = getDatabase();
    const duplicate = db
      .prepare(
        `
      SELECT id FROM facturas
      WHERE emisor_cuit = ?
        AND tipo_comprobante = ?
        AND punto_venta = ?
        AND numero_comprobante = ?
        AND id != ?
    `
      )
      .get(newCuit, invoice.invoiceType, invoice.pointOfSale, invoice.invoiceNumber, invoiceId);

    if (duplicate) {
      return c.json(
        {
          success: false,
          error: `Ya existe una factura con este CUIT y número: ${newCuit}`,
        },
        409
      );
    }

    const stmt = db.prepare(`
      UPDATE facturas
      SET emisor_cuit = ?
      WHERE id = ?
    `);
    stmt.run(newCuit, invoiceId);

    return c.json({
      success: true,
      message: 'Emisor actualizado correctamente',
      invoice: { id: invoiceId, emisorCuit: newCuit },
    });
  } catch (e) {
    console.error('Error reassigning emitter:', e);
    return c.json({ success: false, error: 'Failed to reassign emitter', message: String(e) }, 500);
  }
});

// GET /api/invoices/:id
invoicesRouter.get('/:id', async (c) => {
  try {
    const invoiceId = parseInt(c.req.param('id'), 10);

    if (isNaN(invoiceId)) {
      return c.json({ success: false, error: 'ID de factura inválido' }, 400);
    }

    const invoiceRepo = new InvoiceRepository();
    const emitterRepo = new EmitterRepository();
    const fileRepo = new FileRepository();

    const invoice = await invoiceRepo.findById(invoiceId);

    if (!invoice) {
      return c.json({ success: false, error: 'Factura no encontrada' }, 404);
    }

    let originalFile: string | null = null;
    let storagePath: string | null = null;
    let fileHash: string | null = null;
    if (invoice.fileId) {
      const file = fileRepo.findById(invoice.fileId);
      if (file) {
        originalFile = file.originalFilename;
        storagePath = file.storagePath;
        fileHash = file.fileHash ?? null;
      }
    }

    const emitter = emitterRepo.findByCUIT(invoice.emitterCuit);

    return c.json({
      success: true,
      invoice: {
        id: invoice.id,
        emitterCuit: invoice.emitterCuit,
        emitterName: emitter?.name || 'Desconocido',
        emitterAlias: emitter?.aliases[0] || null,
        issueDate: invoice.issueDate,
        invoiceType: invoice.invoiceType,
        pointOfSale: invoice.pointOfSale,
        invoiceNumber: invoice.invoiceNumber,
        fullInvoiceNumber: invoice.fullInvoiceNumber,
        total: invoice.total,
        currency: invoice.currency,
        originalFile,
        storagePath,
        fileHash,
        categoryId: invoice.categoryId ?? null,
        expectedInvoiceId: invoice.expectedInvoiceId ?? null,
        fileId: invoice.fileId ?? null,
        createdAt: invoice.createdAt,
      },
      extractedValues: {
        cuit: invoice.emitterCuit,
        fecha: invoice.issueDate,
        tipo: invoice.invoiceType,
        punto_venta: invoice.pointOfSale?.toString(),
        numero: invoice.invoiceNumber?.toString(),
        total: invoice.total?.toString(),
      },
    });
  } catch (error) {
    console.error('Error fetching invoice:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      500
    );
  }
});

// PATCH /api/invoices/:id
invoicesRouter.patch('/:id', async (c) => {
  try {
    const invoiceId = parseInt(c.req.param('id'), 10);

    if (isNaN(invoiceId)) {
      return c.json({ success: false, error: 'ID de factura inválido' }, 400);
    }

    const body: unknown = await c.req.json();

    const parseResult = InvoicePatchSchema.safeParse(body);
    if (!parseResult.success) {
      return c.json(formatZodError(parseResult.error), 400);
    }

    const updates = parseResult.data;

    const invoiceRepo = new InvoiceRepository();

    const invoice = await invoiceRepo.findById(invoiceId);
    if (!invoice) {
      return c.json({ success: false, error: 'Factura no encontrada' }, 404);
    }

    const updateData: Record<string, unknown> = {};

    if (updates.emitterCuit) {
      const emitterRepo = new EmitterRepository();
      const emitter = emitterRepo.findByCUIT(updates.emitterCuit);
      if (!emitter) {
        return c.json(
          { success: false, error: `Emisor con CUIT ${updates.emitterCuit} no encontrado` },
          400
        );
      }
      updateData.cuitEmisor = emitter.cuit;
    }

    if (updates.invoiceType) {
      updateData.tipoComprobante = updates.invoiceType;
    }

    if (updates.pointOfSale !== undefined) {
      updateData.puntoVenta = updates.pointOfSale;
    }

    if (updates.invoiceNumber !== undefined) {
      updateData.numeroComprobante = updates.invoiceNumber;
    }

    if (updates.total !== undefined) {
      updateData.total = updates.total;
    }

    if (updates.issueDate) {
      updateData.fechaEmision = updates.issueDate;
    }

    if (updates.categoryId !== undefined) {
      updateData.categoryId = updates.categoryId;
    }

    if (updates.expectedInvoiceId !== undefined) {
      updateData.expectedInvoiceId = updates.expectedInvoiceId;
    }

    const updated = await invoiceRepo.update(invoiceId, updateData);

    if (!updated) {
      return c.json({ success: false, error: 'Error al actualizar la factura' }, 500);
    }

    const final = await invoiceRepo.findById(invoiceId);

    const fileService = new InvoiceFileService();

    const renameCheckFields = {
      emitterCuit: updates.emitterCuit,
      invoiceType: updates.invoiceType ?? undefined,
      pointOfSale: updates.pointOfSale ?? undefined,
      invoiceNumber: updates.invoiceNumber ?? undefined,
      issueDate: updates.issueDate ?? undefined,
      categoryId: updates.categoryId,
    };

    if (fileService.shouldRenameFile(renameCheckFields) && final && final.fileId) {
      try {
        const emitterRepo = new EmitterRepository();
        const emitter = emitterRepo.findByCUIT(final.emitterCuit);

        if (!emitter) {
          console.warn(`[PATCH] Emisor no encontrado: ${final.emitterCuit}`);
        } else {
          const result = await fileService.renameWithCategoryResolution(
            final.fileId,
            {
              emitterCuit: final.emitterCuit,
              invoiceType: final.invoiceType,
              pointOfSale: final.pointOfSale,
              invoiceNumber: final.invoiceNumber,
              issueDate: final.issueDate.toISOString().split('T')[0]!,
              fileId: final.fileId,
            },
            emitter,
            final.categoryId
          );

          if (!result.success) {
            console.warn(`[PATCH] No se pudo renombrar archivo: ${result.error}`);
          }
        }
      } catch (err) {
        console.error('[PATCH] Error renombrando archivo:', err);
      }
    }

    return c.json({
      success: true,
      message: 'Factura actualizada correctamente',
      invoice: final,
    });
  } catch (error) {
    console.error('Error updating invoice:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      500
    );
  }
});

// DELETE /api/invoices/:id
invoicesRouter.delete('/:id', async (c) => {
  try {
    const invoiceId = parseInt(c.req.param('id'), 10);

    if (isNaN(invoiceId)) {
      return c.json({ success: false, error: 'ID de factura inválido' }, 400);
    }

    const invoiceRepo = new InvoiceRepository();

    const result = await invoiceRepo.deleteWithUnlink(invoiceId);

    if (!result.success) {
      return c.json({ success: false, error: result.error }, 404);
    }

    const messages: string[] = ['Factura eliminada correctamente'];
    if (result.unlinkedExpected) {
      messages.push(
        `Factura esperada #${result.unlinkedExpected} desvinculada y marcada como pendiente`
      );
    }
    if (result.unlinkedFile) {
      messages.push(`Archivo #${result.unlinkedFile} desvinculado y marcado como subido`);
    }

    return c.json({
      success: true,
      message: messages.join('. '),
      unlinkedExpected: result.unlinkedExpected,
      unlinkedFile: result.unlinkedFile,
    });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      500
    );
  }
});
