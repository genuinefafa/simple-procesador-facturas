/**
 * API endpoint para guardar anotaciones de zonas en facturas
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ZoneAnnotationRepository } from '../../../../../src/database/repositories/zone-annotation.js';
import { InvoiceRepository } from '../../../../../src/database/repositories/invoice.js';

interface ZoneData {
  field: string;
  x: number;
  y: number;
  width: number;
  height: number;
  extractedValue?: string;
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { invoiceId, zones } = body as { invoiceId: number; zones: ZoneData[] };

    if (!invoiceId || !zones || !Array.isArray(zones)) {
      return json(
        { success: false, error: 'Datos inválidos: se requiere invoiceId y zones' },
        { status: 400 }
      );
    }

    const zoneRepo = new ZoneAnnotationRepository();
    const invoiceRepo = new InvoiceRepository();

    // Verificar que la factura existe
    const invoice = invoiceRepo.findById(invoiceId);
    if (!invoice) {
      return json({ success: false, error: 'Factura no encontrada' }, { status: 404 });
    }

    // Eliminar anotaciones previas de esta factura
    zoneRepo.deleteByInvoiceId(invoiceId);

    // Crear nuevas anotaciones
    const savedZones = zones.map((zone) =>
      zoneRepo.create({
        invoiceId,
        field: zone.field,
        x: zone.x,
        y: zone.y,
        width: zone.width,
        height: zone.height,
        extractedValue: zone.extractedValue,
      })
    );

    // Marcar la factura como validada manualmente
    invoiceRepo.markAsValidated(invoiceId);

    return json({
      success: true,
      message: `${savedZones.length} zonas guardadas correctamente`,
      zones: savedZones.map((zone) => ({
        id: zone.id,
        field: zone.field,
        x: zone.x,
        y: zone.y,
        width: zone.width,
        height: zone.height,
      })),
    });
  } catch (error) {
    console.error('Error saving annotations:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
};
