/**
 * API endpoint para encontrar matches de expected_invoices para un pending file
 * Soporta matching parcial - no requiere todos los campos
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PendingFileRepository } from '@server/database/repositories/pending-file.js';
import { ExpectedInvoiceRepository } from '@server/database/repositories/expected-invoice.js';
import { normalizeCUIT, validateCUIT } from '@server/validators/cuit.js';

/**
 * Normaliza fecha de formato DD/MM/YYYY o DD-MM-YYYY a YYYY-MM-DD
 */
function normalizeDateToISO(dateStr: string): string | null {
  if (!dateStr) return null;

  // Si ya está en formato YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Formato DD/MM/YYYY o DD-MM-YYYY
  const match = dateStr.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return null;
}

/**
 * GET /api/pending-files/:id/matches
 * Buscar expected_invoices que matcheen con el archivo pendiente
 * Ahora soporta matching parcial con cualquier combinación de campos
 */
export const GET: RequestHandler = async ({ params }) => {
  console.info(`🔍 [MATCHES] Buscando matches para pending file ID ${params.id}...`);

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

    const expectedInvoiceRepo = new ExpectedInvoiceRepository();

    // Normalizar CUIT si está disponible
    let normalizedCuit: string | undefined;
    if (pendingFile.extractedCuit && validateCUIT(pendingFile.extractedCuit)) {
      try {
        normalizedCuit = normalizeCUIT(pendingFile.extractedCuit);
      } catch {
        // CUIT inválido, continuar sin él
        console.warn(`⚠️  [MATCHES] CUIT inválido: ${pendingFile.extractedCuit}`);
      }
    }

    // Normalizar fecha
    const normalizedDate = pendingFile.extractedDate
      ? normalizeDateToISO(pendingFile.extractedDate)
      : undefined;

    // Contar campos detectados para calcular confianza OCR
    const detectedFields: string[] = [];
    if (normalizedCuit) detectedFields.push('cuit');
    if (pendingFile.extractedType) detectedFields.push('invoiceType');
    if (pendingFile.extractedPointOfSale !== null) detectedFields.push('pointOfSale');
    if (pendingFile.extractedInvoiceNumber !== null) detectedFields.push('invoiceNumber');
    if (normalizedDate) detectedFields.push('issueDate');
    if (pendingFile.extractedTotal !== null) detectedFields.push('total');

    const ocrConfidence = Math.round((detectedFields.length / 6) * 100);

    console.info(
      `📊 [MATCHES] Campos detectados: ${detectedFields.join(', ')} (${ocrConfidence}%)`
    );

    // Si no hay ningún campo útil para buscar, retornar vacío
    if (
      !normalizedCuit &&
      pendingFile.extractedPointOfSale === null &&
      pendingFile.extractedInvoiceNumber === null
    ) {
      console.info('⚠️  [MATCHES] Sin campos suficientes para buscar matches');
      return json({
        success: true,
        hasExactMatch: false,
        exactMatch: null,
        candidates: [],
        partialMatches: [],
        ocrConfidence,
        detectedFields,
        message: 'Sin campos suficientes para buscar matches',
      });
    }

    // 1. Buscar match exacto (si tenemos los 4 campos clave)
    let exactMatch = null;
    if (
      normalizedCuit &&
      pendingFile.extractedType &&
      pendingFile.extractedPointOfSale !== null &&
      pendingFile.extractedInvoiceNumber !== null
    ) {
      exactMatch = await expectedInvoiceRepo.findExactMatch(
        normalizedCuit,
        pendingFile.extractedType,
        pendingFile.extractedPointOfSale,
        pendingFile.extractedInvoiceNumber
      );

      if (exactMatch) {
        console.info('✅ [MATCHES] Match exacto encontrado:', exactMatch.id);
        return json({
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

    // 2. Buscar matches parciales con los campos disponibles
    const partialMatches = await expectedInvoiceRepo.findPartialMatches({
      cuit: normalizedCuit,
      invoiceType: pendingFile.extractedType || undefined,
      pointOfSale: pendingFile.extractedPointOfSale ?? undefined,
      invoiceNumber: pendingFile.extractedInvoiceNumber ?? undefined,
      issueDate: normalizedDate || undefined,
      total: pendingFile.extractedTotal ?? undefined,
      limit: 10,
    });

    console.info(`🔍 [MATCHES] ${partialMatches.length} matches parciales encontrados`);

    // El mejor match parcial (si tiene score >= 75%) se considera como "mejor candidato"
    const bestMatch =
      partialMatches.length > 0 && partialMatches[0].matchScore >= 75 ? partialMatches[0] : null;

    return json({
      success: true,
      hasExactMatch: false,
      exactMatch: null,
      bestMatch, // Mejor candidato (>= 75% coincidencia)
      candidates: partialMatches.slice(0, 5), // Top 5 candidatos
      partialMatches, // Todos los matches parciales
      ocrConfidence,
      detectedFields,
    });
  } catch (error) {
    console.error('❌ [MATCHES] Error:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
};
