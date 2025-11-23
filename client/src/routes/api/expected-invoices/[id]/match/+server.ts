/**
 * Endpoint para confirmar match entre factura esperada y archivo procesado
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ExpectedInvoiceRepository } from '@server/database/repositories/expected-invoice.js';
import { InvoiceRepository } from '@server/database/repositories/invoice.js';
import { EmitterRepository } from '@server/database/repositories/emitter.js';
import { PendingFileRepository } from '@server/database/repositories/pending-file.js';
import { getPersonType, normalizeCUIT } from '@server/validators/cuit.js';
import type { InvoiceType, Currency } from '@server/utils/types.js';

export const POST: RequestHandler = async ({ params, request }) => {
  const { id } = params;
  console.info(`\n🔗 [API] POST /api/expected-invoices/${id}/match`);

  try {
    const { pendingFileId, confirmed } = await request.json();

    if (!pendingFileId || confirmed === undefined) {
      return json(
        {
          success: false,
          error: 'Faltan parámetros: pendingFileId y confirmed son requeridos',
        },
        { status: 400 }
      );
    }

    console.info(`   📋 Expected Invoice ID: ${id}`);
    console.info(`   📄 Pending File ID: ${pendingFileId}`);
    console.info(`   ✅ Confirmado: ${confirmed}`);

    if (!confirmed) {
      console.info(`   ⏭️  Match rechazado por usuario`);
      return json({
        success: true,
        message: 'Match rechazado',
      });
    }

    // Obtener la factura esperada
    const expectedRepo = new ExpectedInvoiceRepository();
    const expected = expectedRepo.findById(parseInt(id));

    if (!expected) {
      return json(
        {
          success: false,
          error: 'Factura esperada no encontrada',
        },
        { status: 404 }
      );
    }

    // Obtener el archivo pendiente
    const pendingRepo = new PendingFileRepository();
    const pendingFile = pendingRepo.findById(pendingFileId);

    if (!pendingFile) {
      return json(
        {
          success: false,
          error: 'Archivo pendiente no encontrado',
        },
        { status: 404 }
      );
    }

    console.info(`   💾 Creando factura desde datos del Excel AFIP...`);

    // Crear o buscar emisor
    const emitterRepo = new EmitterRepository();
    let emitter = emitterRepo.findByCUIT(expected.cuit);

    if (!emitter) {
      console.info(`   ➕ Creando nuevo emisor: ${expected.cuit}`);
      const cuitNumeric = expected.cuit.replace(/-/g, '');
      const personType = getPersonType(expected.cuit);

      emitter = emitterRepo.create({
        cuit: expected.cuit,
        cuitNumeric: cuitNumeric,
        name: expected.emitterName || `Emisor ${expected.cuit}`,
        aliases: [],
        personType: personType || undefined,
      });
    }

    // Crear la factura con los datos del Excel
    const invoiceRepo = new InvoiceRepository();

    // Verificar que no exista ya
    const existing = invoiceRepo.findByEmitterAndNumber(
      expected.cuit,
      expected.invoiceType as InvoiceType,
      expected.pointOfSale,
      expected.invoiceNumber
    );

    if (existing) {
      console.warn(`   ⚠️  La factura ya existe en BD`);
      return json(
        {
          success: false,
          error: 'Esta factura ya fue procesada anteriormente',
        },
        { status: 409 }
      );
    }

    const invoice = invoiceRepo.create({
      emitterCuit: expected.cuit,
      issueDate: expected.issueDate,
      invoiceType: expected.invoiceType as InvoiceType,
      pointOfSale: expected.pointOfSale,
      invoiceNumber: expected.invoiceNumber,
      total: expected.total || undefined,
      currency: (expected.currency || 'ARS') as Currency,
      originalFile: pendingFile.originalFilename,
      processedFile: pendingFile.originalFilename, // Se renombrará después si es necesario
      fileType: 'PDF_DIGITAL',
      extractionMethod: 'MANUAL', // Matching confirmado manualmente
      extractionConfidence: 95,
      requiresReview: false,
    });

    console.info(`   ✅ Factura creada - ID: ${invoice.id}`);

    // Actualizar pending file
    pendingRepo.linkToInvoice(pendingFileId, invoice.id);
    console.info(`   🔗 Archivo pendiente vinculado a factura`);

    // Marcar expected invoice como matched
    expectedRepo.markAsMatched(parseInt(id), pendingFileId, invoice.id, 100);
    console.info(`   ✅ Factura esperada marcada como matched`);

    return json({
      success: true,
      invoice,
      message: 'Factura creada exitosamente desde Excel AFIP',
    });
  } catch (error) {
    console.error('   ❌ Error al confirmar match:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
};
