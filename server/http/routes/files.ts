/**
 * Hono router for /api/files/*.
 *
 * Mirror of client/src/routes/api/files/**\/+server.ts during the
 * SvelteKit → Hono migration. See docs/MIGRATION_BUN_HONO.md.
 */

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import fs from 'fs';
import path from 'path';
import { readdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';
// @ts-expect-error - no type definitions available for heic-convert
import heicConvertUntyped from 'heic-convert';
const heicConvert = heicConvertUntyped as (opts: {
  buffer: Buffer;
  format: 'JPEG' | 'PNG';
  quality?: number;
}) => Promise<ArrayBuffer>;

import { InvoiceRepository } from '../../database/repositories/invoice';
import { FileRepository } from '../../database/repositories/file';
import { FileExtractionRepository } from '../../database/repositories/file-extraction';
import { ExpectedInvoiceRepository } from '../../database/repositories/expected-invoice';
import { normalizeCUIT, validateCUIT } from '@shared/validators/cuit';

const PROJECT_ROOT = join(import.meta.dirname, '..', '..', '..');
const DATA_DIR = join(PROJECT_ROOT, 'data');
const INPUT_DIR = join(DATA_DIR, 'input');

interface FileStatus {
  fileName: string;
  fileSize?: number;
  uploadedAt?: Date;
  exists: boolean;
  processed: boolean;
  invoice?: {
    id: number;
    emitterCuit: string;
    emitterName: string;
    fullInvoiceNumber: string | null;
    total: number | null;
    issueDate: string | null;
  };
  error?: string;
}

function normalizeDateToISO(dateStr: string): string | null {
  if (!dateStr) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  const match = dateStr.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
  }

  return null;
}

export const filesRouter = new Hono();

// GET /api/files — list all
filesRouter.get('/', async (c) => {
  try {
    const invoiceRepo = new InvoiceRepository();
    const fileRepo = new FileRepository();
    const filesMap = new Map<string, FileStatus>();

    if (existsSync(INPUT_DIR)) {
      const files = readdirSync(INPUT_DIR);

      for (const fileName of files) {
        const filePath = join(INPUT_DIR, fileName);
        const stats = statSync(filePath);

        filesMap.set(fileName, {
          fileName,
          fileSize: stats.size,
          uploadedAt: stats.birthtime,
          exists: true,
          processed: false,
        });
      }
    }

    const invoices = await invoiceRepo.list({ limit: 1000 });

    for (const invoice of invoices) {
      let fileName = 'unknown.pdf';
      if (invoice.fileId) {
        const file = fileRepo.findById(invoice.fileId);
        if (file) {
          fileName = file.originalFilename;
        }
      }
      const filePath = join(INPUT_DIR, fileName);
      const fileExists = existsSync(filePath);

      const existing = filesMap.get(fileName);

      filesMap.set(fileName, {
        fileName,
        fileSize: existing?.fileSize,
        uploadedAt: existing?.uploadedAt,
        exists: fileExists,
        processed: true,
        invoice: {
          id: invoice.id,
          emitterCuit: invoice.emitterCuit,
          emitterName: invoice.emitterCuit,
          fullInvoiceNumber: invoice.fullInvoiceNumber,
          total: invoice.total,
          issueDate:
            invoice.issueDate instanceof Date
              ? invoice.issueDate.toISOString().split('T')[0]!
              : invoice.issueDate,
        },
      });
    }

    const filesList = Array.from(filesMap.values()).sort((a, b) => {
      if (!a.uploadedAt) return 1;
      if (!b.uploadedAt) return -1;
      return b.uploadedAt.getTime() - a.uploadedAt.getTime();
    });

    const stats = {
      total: filesList.length,
      uploaded: filesList.filter((f) => f.exists).length,
      processed: filesList.filter((f) => f.processed).length,
      pending: filesList.filter((f) => f.exists && !f.processed).length,
      missing: filesList.filter((f) => !f.exists && f.processed).length,
    };

    return c.json({
      success: true,
      stats,
      files: filesList,
    });
  } catch (error) {
    console.error('Error listing files:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      500
    );
  }
});

// GET /api/files/hash/:hash
filesRouter.get('/hash/:hash', async (c) => {
  const hash = c.req.param('hash');

  if (!hash || hash.length < 16) {
    return c.json({ error: 'Hash inválido (mínimo 16 caracteres)' }, 400);
  }

  try {
    const fileRepo = new FileRepository();
    const extractionRepo = new FileExtractionRepository();
    const invoiceRepo = new InvoiceRepository();

    let file = fileRepo.findByHash(hash);

    if (!file && hash.length > 16) {
      file = fileRepo.findByHash(hash.substring(0, 16));
    }

    const allFiles = file ? [file] : [];

    let allInvoices: Awaited<ReturnType<typeof invoiceRepo.findByFileId>> = [];
    if (file) {
      allInvoices = await invoiceRepo.findByFileId(file.id);
    }

    const found = allFiles.length > 0 || allInvoices.length > 0;

    return c.json({
      found,
      hash,
      results: {
        files: allFiles.map((f) => {
          const extraction = extractionRepo.findByFileId(f.id);
          return {
            id: f.id,
            filename: f.originalFilename,
            status: f.status,
            uploadDate: f.createdAt,
            extractedCuit: extraction?.extractedCuit ?? null,
            extractedDate: extraction?.extractedDate ?? null,
            extractedType: extraction?.extractedType ?? null,
            fileHash: f.fileHash,
          };
        }),
        invoices: allInvoices.map((inv) => ({
          id: inv.id,
          emitterCuit: inv.emitterCuit,
          issueDate: inv.issueDate,
          invoiceType: inv.invoiceType,
          fullInvoiceNumber: inv.fullInvoiceNumber,
          total: inv.total,
          fileId: inv.fileId,
        })),
      },
      totalFound: allFiles.length + allInvoices.length,
    });
  } catch (error) {
    console.error('[HASH LOOKUP] Error:', error);
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      500
    );
  }
});

// GET /api/files/:id/matches
filesRouter.get('/:id/matches', async (c) => {
  const extractionIdParam = c.req.query('extractionId');
  const idParam = c.req.param('id');
  console.info(
    `🔍 [MATCHES] Buscando matches para file ID ${idParam}${extractionIdParam ? ` (extracción ${extractionIdParam})` : ''}...`
  );

  try {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    const fileRepo = new FileRepository();
    const extractionRepo = new FileExtractionRepository();
    const file = fileRepo.findById(id);

    if (!file) {
      return c.json({ success: false, error: 'Archivo no encontrado' }, 404);
    }

    let extraction;
    if (extractionIdParam) {
      const extractionId = parseInt(extractionIdParam, 10);
      if (!isNaN(extractionId)) {
        const allExtractions = extractionRepo.findAllByFileId(id);
        extraction = allExtractions.find((e) => e.id === extractionId) ?? null;
        if (!extraction) {
          console.warn(`⚠️  [MATCHES] Extracción ${extractionId} no encontrada para file ${id}`);
        }
      }
    }
    if (!extraction) {
      extraction = extractionRepo.findByFileId(id);
    }

    if (!extraction) {
      console.info('ℹ️  [MATCHES] Sin datos de extracción');
      return c.json({
        success: true,
        hasExactMatch: false,
        exactMatch: null,
        candidates: [],
        partialMatches: [],
        ocrConfidence: 0,
        detectedFields: [],
      });
    }

    const expectedInvoiceRepo = new ExpectedInvoiceRepository();

    let normalizedCuit: string | undefined;
    if (extraction.extractedCuit && validateCUIT(extraction.extractedCuit)) {
      try {
        normalizedCuit = normalizeCUIT(extraction.extractedCuit);
      } catch {
        console.warn(`⚠️  [MATCHES] CUIT inválido: ${extraction.extractedCuit}`);
      }
    }

    const normalizedDate = extraction.extractedDate
      ? normalizeDateToISO(extraction.extractedDate)
      : undefined;

    const detectedFields: string[] = [];
    if (normalizedCuit) detectedFields.push('cuit');
    if (extraction.extractedType) detectedFields.push('invoiceType');
    if (extraction.extractedPointOfSale !== null) detectedFields.push('pointOfSale');
    if (extraction.extractedInvoiceNumber !== null) detectedFields.push('invoiceNumber');
    if (normalizedDate) detectedFields.push('issueDate');
    if (extraction.extractedTotal !== null) detectedFields.push('total');

    const ocrConfidence = Math.round((detectedFields.length / 6) * 100);

    console.info(
      `📊 [MATCHES] Campos detectados: ${detectedFields.join(', ')} (${ocrConfidence}%)`
    );

    let exactMatch = null;
    if (
      normalizedCuit &&
      extraction.extractedType &&
      extraction.extractedPointOfSale !== null &&
      extraction.extractedInvoiceNumber !== null
    ) {
      exactMatch = await expectedInvoiceRepo.findExactMatch(
        normalizedCuit,
        extraction.extractedType,
        extraction.extractedPointOfSale,
        extraction.extractedInvoiceNumber
      );

      if (exactMatch) {
        console.info('✅ [MATCHES] Match exacto encontrado:', exactMatch.id);
        return c.json({
          success: true,
          hasExactMatch: true,
          exactMatch: {
            ...exactMatch,
            matchScore: 100,
            matchedFields: ['cuit', 'invoiceType', 'pointOfSale', 'invoiceNumber'],
            totalFieldsCompared: 4,
          },
          candidates: [],
          partialMatches: [],
          ocrConfidence,
          detectedFields,
        });
      }
    }

    const searchCriteria = {
      cuit: normalizedCuit,
      invoiceType: extraction.extractedType || undefined,
      pointOfSale: extraction.extractedPointOfSale ?? undefined,
      invoiceNumber: extraction.extractedInvoiceNumber ?? undefined,
      issueDate: normalizedDate || undefined,
      total: extraction.extractedTotal ?? undefined,
      limit: 100,
    };

    console.info(`🔍 [MATCHES] Buscando con criterios:`, searchCriteria);

    const partialMatches = await expectedInvoiceRepo.findPartialMatches(searchCriteria);

    console.info(`🔍 [MATCHES] ${partialMatches.length} matches parciales encontrados`);

    const bestMatch =
      partialMatches.length > 0 && partialMatches[0]!.matchScore >= 75 ? partialMatches[0] : null;

    return c.json({
      success: true,
      hasExactMatch: false,
      exactMatch: null,
      bestMatch,
      candidates: partialMatches,
      partialMatches,
      ocrConfidence,
      detectedFields,
    });
  } catch (error) {
    console.error('❌ [MATCHES] Error:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      500
    );
  }
});

// GET /api/files/:id
filesRouter.get('/:id', (c) => {
  const idParam = c.req.param('id');
  console.info(`📋 [FILE] Obteniendo archivo ID ${idParam}...`);

  try {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    const fileRepo = new FileRepository();
    const extractionRepo = new FileExtractionRepository();

    const file = fileRepo.findById(id);

    if (!file) {
      return c.json({ success: false, error: 'Archivo no encontrado' }, 404);
    }

    console.info(`✅ [FILE] Encontrado: ${file.originalFilename} → ${file.storagePath}`);

    const extractions = extractionRepo.findAllByFileId(id);
    const extraction = extractions.length > 0 ? extractions[0]! : null;

    const response = {
      id: file.id,
      originalFilename: file.originalFilename,
      filePath: file.storagePath,
      fileHash: file.fileHash,
      status: file.status,
      uploadDate: file.createdAt,
      fileSize: file.fileSize,
      fileType: file.fileType,
      categoryId: file.categoryId ?? null,
      extractedCuit: extraction?.extractedCuit ?? null,
      extractedDate: extraction?.extractedDate ?? null,
      extractedTotal: extraction?.extractedTotal ?? null,
      extractedType: extraction?.extractedType ?? null,
      extractedPointOfSale: extraction?.extractedPointOfSale ?? null,
      extractedInvoiceNumber: extraction?.extractedInvoiceNumber ?? null,
      extractionConfidence: extraction?.confidence ?? null,
      extractionMethod: extraction?.method ?? null,
      extractionErrors: extraction?.errors ?? null,
      extractions: extractions.map((ext) => ({
        id: ext.id,
        method: ext.method,
        confidence: ext.confidence,
        extractedCuit: ext.extractedCuit,
        extractedDate: ext.extractedDate,
        extractedTotal: ext.extractedTotal,
        extractedType: ext.extractedType,
        extractedPointOfSale: ext.extractedPointOfSale,
        extractedInvoiceNumber: ext.extractedInvoiceNumber,
        extractedAt: ext.extractedAt,
        errors: ext.errors,
      })),
    };

    return c.json({
      success: true,
      file: response,
    });
  } catch (error) {
    console.error('❌ [FILE] Error:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      500
    );
  }
});

// PATCH /api/files/:id
filesRouter.patch('/:id', async (c) => {
  const idParam = c.req.param('id');
  console.info(`📝 [FILE] Actualizando archivo ID ${idParam}...`);

  try {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    const fileRepo = new FileRepository();
    const file = fileRepo.findById(id);

    if (!file) {
      return c.json({ success: false, error: 'Archivo no encontrado' }, 404);
    }

    const body = await c.req.json<{ categoryId?: number | null }>();

    if ('categoryId' in body) {
      fileRepo.updateCategory(id, body.categoryId ?? null);
      console.info(`✅ [FILE] Categoría actualizada para archivo ${id}`);
    }

    const updatedFile = fileRepo.findById(id);

    return c.json({
      success: true,
      file: updatedFile,
    });
  } catch (error) {
    console.error('❌ [FILE] Error:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      500
    );
  }
});

// DELETE /api/files/:id
filesRouter.delete('/:id', (c) => {
  const idParam = c.req.param('id');
  console.info(`🗑️  [FILE] Eliminando archivo ID ${idParam}...`);

  try {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) {
      return c.json({ success: false, error: 'ID inválido' }, 400);
    }

    const fileRepo = new FileRepository();
    const file = fileRepo.findById(id);

    if (!file) {
      return c.json({ success: false, error: 'Archivo no encontrado' }, 404);
    }

    fileRepo.delete(id);

    console.info(`✅ [FILE] Archivo ${id} eliminado`);

    return c.json({
      success: true,
      message: 'Archivo eliminado correctamente',
    });
  } catch (error) {
    console.error('❌ [FILE] Error:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      500
    );
  }
});

// GET /api/files/* — serve binary by path (mirror of Kit's [...path])
filesRouter.get('/*', async (c) => {
  const rawPath = c.req.path.replace(/^\/api\/files\//, '');
  const filename = path.basename(decodeURIComponent(rawPath));

  try {
    const filePath = decodeURIComponent(rawPath);

    console.info(`📂 [FILE-SERVER] Solicitado: ${filename}`);
    console.info(`   Path original: ${filePath}`);

    if (filePath.includes('..') || filePath.includes('~')) {
      console.error(`❌ [FILE-SERVER] Path inválido (directory traversal): ${filePath}`);
      throw new HTTPException(400, { message: 'Invalid file path' });
    }

    const projectRoot = PROJECT_ROOT;
    let absolutePath: string;

    if (path.isAbsolute(filePath)) {
      absolutePath = filePath;
      console.info(`   Usando ruta absoluta: ${absolutePath}`);
    } else {
      absolutePath = path.resolve(projectRoot, filePath);
      console.info(`   Intentando ruta relativa: ${absolutePath}`);

      if (!fs.existsSync(absolutePath)) {
        const searchDirs = [
          path.join(projectRoot, 'examples'),
          path.join(projectRoot, 'data/processed'),
          path.join(projectRoot, 'data/input'),
        ];

        console.info(`   No encontrado, buscando en directorios comunes...`);

        const finalizedDir = path.join(projectRoot, 'data/finalized');
        if (fs.existsSync(finalizedDir)) {
          try {
            const subdirs = fs.readdirSync(finalizedDir).filter((item) => {
              const itemPath = path.join(finalizedDir, item);
              return fs.statSync(itemPath).isDirectory();
            });

            for (const subdir of subdirs) {
              const candidatePath = path.join(finalizedDir, subdir, path.basename(filePath));
              console.info(`     Probando: ${candidatePath}`);
              if (fs.existsSync(candidatePath)) {
                absolutePath = candidatePath;
                console.info(`     ✅ Encontrado en finalized/${subdir}!`);
                break;
              }
            }
          } catch (err) {
            console.warn(`     Error buscando en finalized:`, err);
          }
        }

        if (!fs.existsSync(absolutePath)) {
          for (const dir of searchDirs) {
            const candidatePath = path.join(dir, path.basename(filePath));
            console.info(`     Probando: ${candidatePath}`);
            if (fs.existsSync(candidatePath)) {
              absolutePath = candidatePath;
              console.info(`     ✅ Encontrado!`);
              break;
            }
          }
        }
      }
    }

    if (!fs.existsSync(absolutePath)) {
      console.error(`❌ [FILE-SERVER] Archivo no encontrado: ${filename}`);
      console.error(`   Path original: ${filePath}`);
      console.error(`   Path buscado: ${absolutePath}`);
      throw new HTTPException(404, { message: `File not found: ${filename}` });
    }

    let fileBuffer: Buffer<ArrayBufferLike> = fs.readFileSync(absolutePath);
    const ext = path.extname(absolutePath).toLowerCase();

    console.info(`✅ [FILE-SERVER] Sirviendo: ${filename} (${fileBuffer.length} bytes)`);

    if (ext === '.heic' || ext === '.heif') {
      console.info(`   🔄 Convirtiendo HEIC a JPEG...`);
      try {
        const outputBuffer = await heicConvert({
          buffer: fileBuffer,
          format: 'JPEG',
          quality: 0.9,
        });
        fileBuffer = Buffer.from(outputBuffer) as Buffer;
        console.info(`   ✅ Conversión exitosa (${fileBuffer.length} bytes)`);
      } catch (convertErr) {
        console.error(`   ❌ Error convirtiendo HEIC:`, convertErr);
        throw new HTTPException(500, { message: 'Error converting HEIC file' });
      }
    }

    let contentType = 'application/octet-stream';
    if (ext === '.pdf') {
      contentType = 'application/pdf';
    } else if (['.jpg', '.jpeg'].includes(ext)) {
      contentType = 'image/jpeg';
    } else if (ext === '.png') {
      contentType = 'image/png';
    } else if (ext === '.tif' || ext === '.tiff') {
      contentType = 'image/tiff';
    } else if (ext === '.webp') {
      contentType = 'image/webp';
    } else if (ext === '.heic' || ext === '.heif') {
      contentType = 'image/jpeg';
    }

    const encodedFilename = encodeURIComponent(filename);

    return new Response(new Uint8Array(fileBuffer), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        // eslint-disable-next-line no-control-regex
        'Content-Disposition': `inline; filename="${filename.replace(/[^\x00-\x7F]/g, '_')}"; filename*=UTF-8''${encodedFilename}`,
      },
    });
  } catch (err) {
    if (err instanceof HTTPException) {
      throw err;
    }
    console.error(`❌ [FILE-SERVER] Error sirviendo archivo: ${filename}`);
    console.error(`   Error:`, err);
    throw new HTTPException(500, { message: 'Internal server error' });
  }
});
