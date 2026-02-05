/**
 * Endpoint para confirmar match entre factura esperada y archivo procesado
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ExpectedInvoiceRepository } from '@server/database/repositories/expected-invoice.js';
import { InvoiceRepository } from '@server/database/repositories/invoice.js';
import { EmitterRepository } from '@server/database/repositories/emitter.js';
import { FileRepository } from '@server/database/repositories/file.js';
import { getPersonType } from '@shared/validators/cuit';
import type { InvoiceType, Currency } from '@shared/types';

export const POST: RequestHandler = async ({ params, request }) => {
  const { id } = params;
  console.info(`\n🔗 [API] POST /api/expected-invoices/${id}/match`);

  try {
    const { fileId, confirmed } = await request.json();

    if (!fileId || confirmed === undefined) {
      return json(
        {
          success: false,
          error: 'Faltan parámetros: fileId y confirmed son requeridos',
        },
        { status: 400 }
      );
    }

    console.info(`   📋 Expected Invoice ID: ${id}`);
    console.info(`   📄 File ID: ${fileId}`);
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
    const expected = await expectedRepo.findById(parseInt(id));

    if (!expected) {
      return json(
        {
          success: false,
          error: 'Factura esperada no encontrada',
        },
        { status: 404 }
      );
    }

    // Obtener el archivo
    const fileRepo = new FileRepository();
    const file = fileRepo.findById(fileId);

    if (!file) {
      return json(
        {
          success: false,
          error: 'Archivo no encontrado',
        },
        { status: 404 }
      );
    }

    console.info(`   💾 Creando factura desde datos del Excel AFIP...`);

    // Crear o buscar emisor
    const emitterRepo = new EmitterRepository();
    let emitter = await emitterRepo.findByCUIT(expected.cuit);

    if (!emitter) {
      console.info(`   ➕ Creando nuevo emisor: ${expected.cuit}`);
      const personType = getPersonType(expected.cuit);

      emitter = emitterRepo.create({
        cuit: expected.cuit, // Ya viene normalizado de expected_invoices
        name: expected.emitterName || `Emisor ${expected.cuit}`,
        aliases: [],
        personType: personType || undefined,
      });
    }

    // Crear la factura con los datos del Excel
    const invoiceRepo = new InvoiceRepository();

    // Verificar que no exista ya
    const existing = await invoiceRepo.findByEmitterAndNumber(
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

    const invoice = await invoiceRepo.create({
      emitterCuit: expected.cuit,
      issueDate: expected.issueDate,
      invoiceType: expected.invoiceType as InvoiceType,
      pointOfSale: expected.pointOfSale,
      invoiceNumber: expected.invoiceNumber,
      total: expected.total || undefined,
      fileId: fileId, // FK a files - fuente de verdad para rutas
      fileType: 'PDF_DIGITAL',
      extractionMethod: 'MANUAL', // Matching confirmado manualmente
      extractionConfidence: 95,
      requiresReview: false,
    });

    console.info(`   ✅ Factura creada - ID: ${invoice.id}`);

    // Actualizar archivo a procesado
    fileRepo.updateStatus(fileId, 'processed');
    console.info(`   🔗 Archivo marcado como procesado`);

    // Marcar expected invoice como matched (el status se actualiza porque ya hay factura vinculada)
    expectedRepo.updateStatus(parseInt(id), 'matched');
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
