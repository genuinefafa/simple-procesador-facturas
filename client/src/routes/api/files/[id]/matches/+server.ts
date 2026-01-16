/**
 * API endpoint para encontrar matches de expected_invoices para un file
 * Adaptado del endpoint legacy pending-files para usar el nuevo modelo
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { FileRepository } from '@server/database/repositories/file.js';
import { FileExtractionRepository } from '@server/database/repositories/file-extraction.js';
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
 * GET /api/files/:id/matches
 * Buscar expected_invoices que matcheen con el archivo
 */
export const GET: RequestHandler = async ({ params }) => {
  console.info(`🔍 [MATCHES] Buscando matches para file ID ${params.id}...`);

  try {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      return json({ success: false, error: 'ID inválido' }, { status: 400 });
    }

    const fileRepo = new FileRepository();
    const extractionRepo = new FileExtractionRepository();
    const file = fileRepo.findById(id);

    if (!file) {
      return json({ success: false, error: 'Archivo no encontrado' }, { status: 404 });
    }

    // Obtener datos de extracción
    const extraction = extractionRepo.findByFileId(id);

    if (!extraction) {
      console.info('ℹ️  [MATCHES] Sin datos de extracción');
      return json({
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

    // PRIMERO: Verificar si ya existe una expected vinculada a este file
    const linkedExpected = await expectedInvoiceRepo.findByMatchedFileId(id);

    if (linkedExpected) {
      console.info('✅ [MATCHES] Expected vinculada encontrada:', linkedExpected.id);
      return json({
        success: true,
        hasExactMatch: true,
        exactMatch: {
          ...linkedExpected,
          matchScore: 100,
          matchedFields: ['linkedBySystem'],
          totalFieldsCompared: 1,
        },
        candidates: [],
        partialMatches: [],
        ocrConfidence: 100,
        detectedFields: ['linkedBySystem'],
      });
    }

    // Normalizar CUIT si está disponible
    let normalizedCuit: string | undefined;
    if (extraction.extractedCuit && validateCUIT(extraction.extractedCuit)) {
      try {
        normalizedCuit = normalizeCUIT(extraction.extractedCuit);
      } catch {
        console.warn(`⚠️  [MATCHES] CUIT inválido: ${extraction.extractedCuit}`);
      }
    }

    // Normalizar fecha
    const normalizedDate = extraction.extractedDate
      ? normalizeDateToISO(extraction.extractedDate)
      : undefined;

    // Contar campos detectados para calcular confianza OCR
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

    // 1. Buscar match exacto (si tenemos los 4 campos clave)
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

    // 2. Buscar matches parciales
    const searchCriteria = {
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
      partialMatches.length > 0 && partialMatches[0].matchScore >= 75 ? partialMatches[0] : null;

    return json({
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
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
};
