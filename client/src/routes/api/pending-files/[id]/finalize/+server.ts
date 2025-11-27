/**
 * API endpoint para finalizar/procesar un archivo pendiente con datos corregidos
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PendingFileRepository } from '@server/database/repositories/pending-file.js';
import { EmitterRepository } from '@server/database/repositories/emitter.js';
import { InvoiceRepository } from '@server/database/repositories/invoice.js';
import { validateCUIT, normalizeCUIT, getPersonType } from '@server/validators/cuit.js';
import { join, dirname, basename, extname } from 'path';
import { mkdir, rename, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import type { InvoiceType } from '@server/utils/types.js';

const PROCESSED_DIR = join(process.cwd(), '..', 'data', 'processed');

/**
 * POST /api/pending-files/:id/finalize
 * Intentar procesar nuevamente con datos actualizados/corregidos
 * Si OK: crear factura, renombrar archivo, marcar como processed
 */
export const POST: RequestHandler = async ({ params, request }) => {
  console.info(`🎯 [FINALIZE] Finalizando archivo pendiente ID ${params.id}...`);

  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return json({ success: false, error: 'ID inválido' }, { status: 400 });
    }

    const pendingFileRepo = new PendingFileRepository();
    const pendingFile = pendingFileRepo.findById(id);

    if (!pendingFile) {
      return json({ success: false, error: 'Archivo pendiente no encontrado' }, { status: 404 });
    }

    // Si ya está procesado, retornar error
    if (pendingFile.status === 'processed') {
      return json({ success: false, error: 'Este archivo ya fue procesado' }, { status: 400 });
    }

    // Validar datos requeridos
    const {
      extractedCuit,
      extractedDate,
      extractedType,
      extractedPointOfSale,
      extractedInvoiceNumber,
    } = pendingFile;

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
    let emitter = emitterRepo.findByCUIT(normalizedCuit);

    if (!emitter) {
      console.info(`➕ Creando nuevo emisor para ${normalizedCuit}`);
      const cuitNumeric = normalizedCuit.replace(/-/g, '');
      const personType = getPersonType(normalizedCuit);

      emitter = emitterRepo.create({
        cuit: normalizedCuit,
        cuitNumeric: cuitNumeric,
        name: `Emisor ${normalizedCuit}`,
        aliases: [],
        personType: personType || undefined,
      });
    }

    // Crear factura
    const invoiceRepo = new InvoiceRepository();
    const invoiceType = extractedType as InvoiceType;

    // Generar nombre del archivo procesado
    const dateFormatted = extractedDate.replace(/-/g, ''); // YYYYMMDD
    const cuitNumeric = normalizedCuit.replace(/-/g, '');
    const fileExt = extname(pendingFile.originalFilename);
    const processedFileName = `${cuitNumeric}_${dateFormatted}_${invoiceType}-${String(extractedPointOfSale).padStart(4, '0')}-${String(extractedInvoiceNumber).padStart(8, '0')}${fileExt}`;

    // Crear directorio para emisor si no existe
    const emitterDir = join(PROCESSED_DIR, cuitNumeric, extractedDate.substring(0, 4)); // YYYY
    if (!existsSync(emitterDir)) {
      await mkdir(emitterDir, { recursive: true });
    }

    const processedFilePath = join(emitterDir, processedFileName);

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

    // Crear factura en BD
    console.info(`💾 Creando factura en BD...`);
    const invoice = invoiceRepo.create({
      emitterCuit: normalizedCuit,
      issueDate: extractedDate,
      invoiceType: invoiceType,
      pointOfSale: extractedPointOfSale,
      invoiceNumber: extractedInvoiceNumber,
      total: pendingFile.extractedTotal || undefined,
      originalFile: pendingFile.filePath,
      processedFile: processedFilePath,
      fileType: 'PDF_DIGITAL', // TODO: detectar tipo real
      extractionMethod: 'MANUAL', // Fue corregido manualmente
      extractionConfidence: 100, // 100% porque fue validado manualmente
      requiresReview: false,
    });

    // Vincular pending file con factura
    console.info(`🔗 Vinculando pending file ${id} con factura ${invoice.id}`);
    pendingFileRepo.linkToInvoice(id, invoice.id);

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
      },
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
