/**
 * Endpoint para crear facturas desde archivos subidos (nuevo modelo)
 * Reemplaza el flujo automático con un flujo manual controlado por el usuario
 *
 * POST /api/invoices/from-file/:fileId
 * Body: {
 *   source: 'extraction' | 'expected' | 'manual',
 *   expectedId?: number,  // Si source='expected'
 *   data: {
 *     cuit: string,
 *     invoiceType: number,
 *     pointOfSale: number,
 *     invoiceNumber: number,
 *     issueDate: string,  // YYYY-MM-DD
 *     total: number,
 *     currency?: string,
 *   }
 * }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { FileRepository } from '@server/database/repositories/file';
import { FileExtractionRepository } from '@server/database/repositories/file-extraction';
import { InvoiceRepository } from '@server/database/repositories/invoice';
import { ExpectedInvoiceRepository } from '@server/database/repositories/expected-invoice';
import { EmitterRepository } from '@server/database/repositories/emitter';
import { CategoryRepository } from '@server/database/repositories/category';
import { existsSync } from 'fs';
import { copyFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { generateProcessedFilename, generateSubdirectory } from '@server/utils/file-naming';
import { validateCUIT, normalizeCUIT } from '@server/validators/cuit';

const PROJECT_ROOT = join(process.cwd(), '..');
const DATA_DIR = join(PROJECT_ROOT, 'data');
const FINALIZED_DIR = join(DATA_DIR, 'finalized');

export const POST: RequestHandler = async ({ params, request }) => {
  console.info(`📝 [FROM-FILE] Creando factura desde file ID ${params.fileId}...`);

  try {
    const fileId = parseInt(params.fileId, 10);
    if (isNaN(fileId)) {
      return json({ success: false, error: 'ID de archivo inválido' }, { status: 400 });
    }

    const body: unknown = await request.json();
    const { source, expectedId, data } = body as {
      source: 'extraction' | 'expected' | 'manual';
      expectedId?: number;
      data: {
        cuit: string;
        invoiceType: number;
        pointOfSale: number;
        invoiceNumber: number;
        issueDate: string;
        total: number;
        currency?: string;
      };
    };

    // Validar datos requeridos
    if (!source || !data) {
      return json({ success: false, error: 'Se requieren campos: source, data' }, { status: 400 });
    }

    if (
      !data.cuit ||
      !data.invoiceType ||
      data.pointOfSale == null ||
      data.invoiceNumber == null ||
      !data.issueDate ||
      !data.total
    ) {
      return json({ success: false, error: 'Datos de factura incompletos' }, { status: 400 });
    }

    // 1. Obtener file y extraction
    const fileRepo = new FileRepository();
    const extractionRepo = new FileExtractionRepository();

    const file = fileRepo.findById(fileId);
    if (!file) {
      return json({ success: false, error: 'Archivo no encontrado' }, { status: 404 });
    }

    const extraction = extractionRepo.findByFileId(fileId);

    console.info(`📄 [FROM-FILE] File: ${file.originalFilename}`);
    console.info(`📊 [FROM-FILE] Source: ${source}`);

    // 2. Validar y normalizar CUIT
    if (!validateCUIT(data.cuit)) {
      return json({ success: false, error: 'CUIT inválido' }, { status: 400 });
    }

    const normalizedCuit = normalizeCUIT(data.cuit);
    console.info(`✅ [FROM-FILE] CUIT válido: ${normalizedCuit}`);

    // 3. Buscar o crear emisor
    const emitterRepo = new EmitterRepository();
    let emitter = await emitterRepo.findByCUIT(normalizedCuit);

    if (!emitter) {
      console.info(`➕ [FROM-FILE] Creando nuevo emisor para ${normalizedCuit}`);
      emitter = await emitterRepo.create({
        cuit: normalizedCuit,
        cuitNumeric: normalizedCuit.replace(/-/g, ''),
        name: `Emisor ${normalizedCuit}`,
        aliases: [],
      });
    }

    // 4. Buscar categoría si existe
    const categoryRepo = new CategoryRepository();
    let categoryId: number | undefined = undefined;
    let categoryKey: string | undefined = undefined;

    // TODO: El frontend podría enviar categoryKey en el body
    // Por ahora dejamos sin categoría

    // 5. Generar nombre de archivo procesado usando funciones correctas
    const issueDate = new Date(data.issueDate);
    const newFilename = generateProcessedFilename(
      issueDate,
      emitter,
      data.invoiceType,
      data.pointOfSale,
      data.invoiceNumber,
      file.originalFilename,
      categoryKey
    );

    const subdir = generateSubdirectory(issueDate);
    const targetDir = join(FINALIZED_DIR, subdir);
    const newPath = join(targetDir, newFilename);
    const newRelativePath = `finalized/${subdir}/${newFilename}`;

    console.info(`📁 [FROM-FILE] Target: ${newRelativePath}`);

    // 6. Copiar archivo a finalized/ (no mover, preservar original)
    const absoluteSourcePath = file.storagePath.startsWith('/')
      ? file.storagePath
      : join(DATA_DIR, file.storagePath);

    if (!existsSync(absoluteSourcePath)) {
      return json({ success: false, error: 'Archivo físico no encontrado' }, { status: 404 });
    }

    // Crear directorio si no existe
    await mkdir(targetDir, { recursive: true });

    // Copiar archivo
    await copyFile(absoluteSourcePath, newPath);
    console.info(`📋 [FROM-FILE] Archivo copiado a ${newPath}`);

    // 7. Actualizar file
    fileRepo.updatePath(fileId, newRelativePath);
    fileRepo.updateStatus(fileId, 'processed');

    // 8. Crear factura
    const invoiceRepo = new InvoiceRepository();

    const invoice = await invoiceRepo.create({
      emitterCuit: normalizedCuit,
      issueDate: data.issueDate,
      invoiceType: data.invoiceType,
      pointOfSale: data.pointOfSale,
      invoiceNumber: data.invoiceNumber,
      total: data.total,
      currency: (data.currency || 'ARS') as 'ARS' | 'USD',
      // Legacy fields (mantener por ahora, serán removidos en Sprint 4)
      originalFile: absoluteSourcePath,
      processedFile: newPath,
      finalizedFile: newRelativePath,
      fileType: file.fileType as 'PDF_DIGITAL' | 'PDF_IMAGEN' | 'IMAGEN',
      fileHash: file.fileHash,
      extractionMethod: (extraction?.method || 'MANUAL') as
        | 'TEMPLATE'
        | 'GENERICO'
        | 'MANUAL'
        | 'PDF_TEXT'
        | 'OCR'
        | 'PDF_TEXT+OCR',
      extractionConfidence: extraction?.confidence ?? undefined,
      requiresReview: false, // Si el usuario crea manualmente, ya está validado
      expectedInvoiceId: source === 'expected' ? expectedId : undefined,
      // NUEVO campo (Sprint 3)
      fileId: fileId,
      categoryId: categoryId,
    });

    console.info(`✅ [FROM-FILE] Factura creada: ID ${invoice.id}`);

    // 9. Si hay expected_invoice vinculado, actualizar su estado
    if (source === 'expected' && expectedId) {
      const expectedRepo = new ExpectedInvoiceRepository();
      await expectedRepo.updateStatus(expectedId, 'matched');
      await expectedRepo.linkToFile(expectedId, fileId);
      console.info(`🔗 [FROM-FILE] Expected invoice ${expectedId} vinculado`);
    }

    return json({
      success: true,
      invoice: {
        id: invoice.id,
        fullInvoiceNumber: invoice.fullInvoiceNumber,
        emitterCuit: invoice.emitterCuit,
        total: invoice.total,
        issueDate: invoice.issueDate,
        filePath: newRelativePath,
      },
    });
  } catch (error) {
    console.error('❌ [FROM-FILE] Error:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
};
