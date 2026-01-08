/**
 * API endpoint para finalizar/procesar un archivo pendiente con datos corregidos
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PendingFileRepository } from '@server/database/repositories/pending-file.js';
import { EmitterRepository } from '@server/database/repositories/emitter.js';
import { InvoiceRepository } from '@server/database/repositories/invoice.js';
import { ExpectedInvoiceRepository } from '@server/database/repositories/expected-invoice.js';
import { validateCUIT, normalizeCUIT, getPersonType } from '@server/validators/cuit.js';
import { join, dirname, basename, extname } from 'path';
import { mkdir, rename, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import type { InvoiceType } from '@server/utils/types.js';
import { getFriendlyType } from '@server/utils/afip-codes.js';
import { generateSubdirectory, generateProcessedFilename } from '@server/utils/file-naming.js';

const FINALIZED_DIR = join(process.cwd(), '..', 'data', 'finalized');

/**
 * POST /api/pending-files/:id/finalize
 * Intentar procesar nuevamente con datos actualizados/corregidos
 * Si OK: crear factura, renombrar archivo, marcar como processed
 * NUEVO: Vincular con expectedInvoice si existe match exacto
 */
export const POST: RequestHandler = async ({ params, request }) => {
  console.info(`🎯 [FINALIZE] Finalizando archivo pendiente ID ${params.id}...`);

  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return json({ success: false, error: 'ID inválido' }, { status: 400 });
    }

    const pendingFileRepo = new PendingFileRepository();
    const pendingFile = await pendingFileRepo.findById(id);

    if (!pendingFile) {
      return json({ success: false, error: 'Archivo pendiente no encontrado' }, { status: 404 });
    }

    // Permitir consolidación incluso si ya está procesado: seguiremos vinculando si corresponde

    // Leer overrides del body (permitir que el formulario reemplace los datos extraídos)
    let overrides: any = {};
    try {
      overrides = await request.json();
    } catch {
      overrides = {};
    }

    const extractedCuit = (overrides.emitterCuit as string) ?? pendingFile.extractedCuit;
    const extractedDate = (overrides.issueDate as string) ?? pendingFile.extractedDate;
    const extractedType = (overrides.invoiceType as number | null) ?? pendingFile.extractedType; // Código ARCA numérico
    const extractedPointOfSale =
      (overrides.pointOfSale as number) ?? pendingFile.extractedPointOfSale;
    const extractedInvoiceNumber =
      (overrides.invoiceNumber as number) ?? pendingFile.extractedInvoiceNumber;
    const overriddenTotal = (overrides.total as number | undefined) ?? pendingFile.extractedTotal;
    const requestedExpectedId = overrides.expectedInvoiceId as number | undefined;
    const providedEmitterName = overrides.emitterName as string | undefined;
    const categoryKey = overrides.categoryKey as string | undefined;

    if (
      !extractedCuit ||
      !extractedDate ||
      !extractedType ||
      extractedPointOfSale === null ||
      extractedInvoiceNumber === null
    ) {
      return json(
        {
          success: false,
          error: 'Faltan datos obligatorios. Complete todos los campos antes de finalizar.',
          missingFields: {
            cuit: !extractedCuit,
            date: !extractedDate,
            type: !extractedType,
            pointOfSale: extractedPointOfSale === null,
            invoiceNumber: extractedInvoiceNumber === null,
          },
        },
        { status: 400 }
      );
    }

    // Validar CUIT
    if (!validateCUIT(extractedCuit)) {
      return json({ success: false, error: 'CUIT inválido' }, { status: 400 });
    }

    const normalizedCuit = normalizeCUIT(extractedCuit);
    console.info(`✅ CUIT válido: ${normalizedCuit}`);

    // Buscar o crear emisor
    const emitterRepo = new EmitterRepository();
    let emitter = await emitterRepo.findByCUIT(normalizedCuit);

    // Buscar expected antes para obtener nombre si no vino en body
    const expectedInvoiceRepo = new ExpectedInvoiceRepository();
    let expectedInvoice = null as Awaited<ReturnType<typeof expectedInvoiceRepo.findById>> | null;
    if (requestedExpectedId) {
      expectedInvoice = await expectedInvoiceRepo.findById(requestedExpectedId);
    }

    if (!emitter) {
      console.info(`➕ Creando nuevo emisor para ${normalizedCuit}`);
      const cuitNumeric = normalizedCuit.replace(/-/g, '');
      const personType = getPersonType(normalizedCuit);

      const nameToUse =
        providedEmitterName || expectedInvoice?.emitterName || `Emisor ${normalizedCuit}`;

      emitter = await emitterRepo.create({
        cuit: normalizedCuit,
        cuitNumeric: cuitNumeric,
        name: nameToUse,
        aliases: [],
        personType: personType || undefined,
      });
    }

    // Crear factura
    const invoiceRepo = new InvoiceRepository();
    const invoiceType = extractedType; // Ya es number | null (código ARCA)

    // Generar nombre y path del archivo procesado usando nuevo formato
    // Formato: finalized/yyyy-mm/yyyy-mm-dd Alias CUIT TIPO PV-NUM [cat].ext
    const issueDate = new Date(extractedDate);
    const subdir = generateSubdirectory(issueDate); // yyyy-mm
    const processedFileName = generateProcessedFilename(
      issueDate,
      emitter,
      invoiceType,
      extractedPointOfSale,
      extractedInvoiceNumber,
      pendingFile.originalFilename,
      categoryKey // Categoría opcional del usuario (ej: "3f", "sw")
    );

    // Crear directorio si no existe
    const finalizedDir = join(FINALIZED_DIR, subdir);
    if (!existsSync(finalizedDir)) {
      await mkdir(finalizedDir, { recursive: true });
    }

    const processedFilePath = join(finalizedDir, processedFileName);

    // Verificar si archivo destino ya existe
    if (existsSync(processedFilePath)) {
      return json(
        {
          success: false,
          error: `Ya existe una factura procesada con este número: ${processedFileName}`,
        },
        { status: 409 }
      );
    }

    // Copiar archivo a directorio procesado
    console.info(`📁 Copiando archivo a: ${processedFilePath}`);
    await copyFile(pendingFile.filePath, processedFilePath);

    // Buscar expectedInvoice match exacto ANTES de crear factura
    // Resolver expectedInvoice: prioridad a ID provisto; sino buscar match exacto
    if (!expectedInvoice) {
      expectedInvoice = await expectedInvoiceRepo.findExactMatch(
        normalizedCuit,
        invoiceType,
        extractedPointOfSale,
        extractedInvoiceNumber
      );
    }

    console.info(
      expectedInvoice
        ? `✅ Encontrado expectedInvoice match: ${expectedInvoice.id}`
        : `⚠️ No encontrado expectedInvoice match`
    );

    // Antes de crear, intentar consolidar: si ya existe la factura, actualizar links
    let existing = await invoiceRepo.findByInvoiceNumber(
      normalizedCuit,
      invoiceType,
      extractedPointOfSale,
      extractedInvoiceNumber
    );

    let invoice;
    if (existing) {
      console.info(`🔗 Consolidando con factura existente ${existing.id}`);
      // Actualizar archivo procesado y links
      await invoiceRepo.updateProcessedFile(existing.id, processedFilePath);
      invoice = await invoiceRepo.updateLinking(existing.id, {
        expectedInvoiceId: expectedInvoice?.id ?? null,
        pendingFileId: id,
      });
      // También actualizar fecha/total si vinieron overrides
      // Nota: Mantener simple por ahora, el repositorio no tiene update general
    } else {
      // Crear factura en BD con FKs si existe match
      console.info(`💾 Creando factura en BD...`);
      invoice = await invoiceRepo.create({
        emitterCuit: normalizedCuit,
        issueDate: extractedDate,
        invoiceType: invoiceType,
        pointOfSale: extractedPointOfSale,
        invoiceNumber: extractedInvoiceNumber,
        total: overriddenTotal || undefined,
        originalFile: pendingFile.filePath,
        processedFile: processedFilePath,
        fileType: 'PDF_DIGITAL', // TODO: detectar tipo real
        fileHash: pendingFile.fileHash || undefined,
        extractionMethod: 'MANUAL', // Fue corregido manualmente
        extractionConfidence: 100, // 100% porque fue validado manualmente
        requiresReview: false,
        expectedInvoiceId: expectedInvoice?.id || undefined,
        pendingFileId: id,
      });
    }

    // Validar que invoice fue creada/actualizada correctamente
    if (!invoice) {
      console.error('❌ Invoice creation failed or returned null');
      return json({ success: false, error: 'Invoice creation failed' }, { status: 500 });
    }

    // Actualizar pending file: vincular con factura y marcar como processed
    console.info(`🔗 Vinculando pending file ${id} con factura ${invoice.id}`);
    await pendingFileRepo.updateStatus(id, 'processed');

    // Si hay expectedInvoice match, marcar como matched
    if (expectedInvoice) {
      console.info(`📌 Marcando expectedInvoice ${expectedInvoice.id} como matched`);
      await expectedInvoiceRepo.markAsMatched(expectedInvoice.id, id, 95);
    }

    console.info(`✅ [FINALIZE] Completado exitosamente`);

    return json({
      success: true,
      message: 'Factura procesada y guardada correctamente',
      invoice: {
        id: invoice.id,
        emitterCuit: invoice.emitterCuit,
        invoiceType: invoice.invoiceType,
        fullInvoiceNumber: invoice.fullInvoiceNumber,
        total: invoice.total,
        issueDate: invoice.issueDate,
        processedFile: invoice.processedFile,
        linkedToExpectedInvoice: !!expectedInvoice,
      },
      invoiceId: invoice.id,
    });
  } catch (error) {
    console.error('❌ [FINALIZE] Error:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
};
