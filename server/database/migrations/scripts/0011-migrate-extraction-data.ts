/**
 * Migración: Copiar datos de extracción a file_extraction_results
 *
 * IMPORTANTE: Usa hash-based matching para evitar errores por IDs reciclados
 *
 * Migra desde DOS fuentes:
 * 1. pending_files con datos de extracción (archivos sin procesar)
 * 2. facturas ya procesadas (reconstruir datos de extracción desde los campos finales)
 *
 * Para cada fuente:
 * - Buscar file correspondiente por file_hash (NO por ID)
 * - Verificar que no exista ya un file_extraction_result para ese file
 * - Crear file_extraction_result con los datos disponibles
 */

import { db } from '../../db.js';
import { pendingFiles, files, fileExtractionResults, facturas } from '../../schema.js';
import { eq, and, isNotNull } from 'drizzle-orm';

async function migrate() {
  console.log('🔄 Iniciando migración de datos de extracción...\n');

  let migratedCount = 0;
  let skippedNoMatch = 0;
  let skippedAlreadyExists = 0;
  let errors = 0;

  // ========================================
  // PARTE 1: Migrar desde pending_files
  // ========================================
  console.log('📦 PARTE 1: Migrando desde pending_files...\n');

  const pendingFilesWithExtraction = await db
    .select({
      id: pendingFiles.id,
      file_hash: pendingFiles.fileHash,
      extracted_cuit: pendingFiles.extractedCuit,
      extracted_date: pendingFiles.extractedDate,
      extracted_total: pendingFiles.extractedTotal,
      extracted_type: pendingFiles.extractedType,
      extracted_point_of_sale: pendingFiles.extractedPointOfSale,
      extracted_invoice_number: pendingFiles.extractedInvoiceNumber,
      extraction_confidence: pendingFiles.extractionConfidence,
      extraction_method: pendingFiles.extractionMethod,
      extraction_errors: pendingFiles.extractionErrors,
    })
    .from(pendingFiles)
    .where(
      and(
        isNotNull(pendingFiles.fileHash), // Debe tener hash
        isNotNull(pendingFiles.extractedCuit) // Debe tener al menos CUIT extraído
      )
    )
    .all();

  console.log(
    `📊 Encontrados ${pendingFilesWithExtraction.length} pending_files con datos de extracción`
  );

  for (const pf of pendingFilesWithExtraction) {
    try {
      // 2. Buscar file correspondiente por hash
      const matchingFile = await db
        .select({ id: files.id, file_hash: files.fileHash })
        .from(files)
        .where(eq(files.fileHash, pf.file_hash!))
        .get();

      if (!matchingFile) {
        console.warn(
          `⚠️  pending_file ${pf.id}: No se encontró file con hash ${pf.file_hash?.slice(0, 8)}...`
        );
        skippedNoMatch++;
        continue;
      }

      // 3. Verificar que no exista ya extraction para ese file
      const existingExtraction = await db
        .select()
        .from(fileExtractionResults)
        .where(eq(fileExtractionResults.fileId, matchingFile.id))
        .get();

      if (existingExtraction) {
        console.log(
          `⏭️  pending_file ${pf.id} → file ${matchingFile.id}: Ya tiene extraction, skip`
        );
        skippedAlreadyExists++;
        continue;
      }

      // 4. Crear file_extraction_result
      await db.insert(fileExtractionResults).values({
        fileId: matchingFile.id,
        extractedCuit: pf.extracted_cuit,
        extractedDate: pf.extracted_date,
        extractedTotal: pf.extracted_total,
        extractedType: pf.extracted_type,
        extractedPointOfSale: pf.extracted_point_of_sale,
        extractedInvoiceNumber: pf.extracted_invoice_number,
        confidence: pf.extraction_confidence,
        method: (pf.extraction_method as 'PDF_TEXT' | 'OCR' | 'MANUAL' | 'HYBRID') || 'MANUAL',
        errors: pf.extraction_errors,
        extractedAt: new Date().toISOString(),
      });

      console.log(
        `✅ pending_file ${pf.id} → file ${matchingFile.id}: Migrado (CUIT: ${pf.extracted_cuit}, conf: ${pf.extraction_confidence}%)`
      );
      migratedCount++;
    } catch (error) {
      console.error(`❌ Error migrando pending_file ${pf.id}:`, error);
      errors++;
    }
  }

  // ========================================
  // PARTE 2: Migrar desde facturas
  // ========================================
  console.log('\n📦 PARTE 2: Migrando desde facturas...\n');

  const facturasWithHash = await db
    .select({
      id: facturas.id,
      file_hash: facturas.fileHash,
      emisor_cuit: facturas.emisorCuit,
      fecha_emision: facturas.fechaEmision,
      tipo_comprobante: facturas.tipoComprobante,
      punto_venta: facturas.puntoVenta,
      numero_comprobante: facturas.numeroComprobante,
      total: facturas.total,
      confianza_extraccion: facturas.confianzaExtraccion,
      metodo_extraccion: facturas.metodoExtraccion,
      procesado_en: facturas.procesadoEn,
    })
    .from(facturas)
    .where(isNotNull(facturas.fileHash))
    .all();

  console.log(`📊 Encontradas ${facturasWithHash.length} facturas con hash`);

  for (const factura of facturasWithHash) {
    try {
      // Buscar file correspondiente por hash
      const matchingFile = await db
        .select({ id: files.id, file_hash: files.fileHash })
        .from(files)
        .where(eq(files.fileHash, factura.file_hash!))
        .get();

      if (!matchingFile) {
        console.warn(
          `⚠️  factura ${factura.id}: No se encontró file con hash ${factura.file_hash?.slice(0, 8)}...`
        );
        skippedNoMatch++;
        continue;
      }

      // Verificar que no exista ya extraction para ese file
      const existingExtraction = await db
        .select()
        .from(fileExtractionResults)
        .where(eq(fileExtractionResults.fileId, matchingFile.id))
        .get();

      if (existingExtraction) {
        // Ya existe (probablemente migrado desde pending_file)
        skippedAlreadyExists++;
        continue;
      }

      // Crear file_extraction_result con los datos de la factura
      // NOTA: Los datos "extraídos" son en realidad los datos finales validados,
      // pero los guardamos como referencia histórica

      // Normalizar método: cambiar MANUAL por OCR (las facturas viejas no usaban MANUAL correctamente)
      let extractionMethod = factura.metodo_extraccion as 'PDF_TEXT' | 'OCR' | 'MANUAL' | 'HYBRID';
      if (extractionMethod === 'MANUAL') {
        extractionMethod = 'OCR'; // Asumir OCR para facturas legacy marcadas como MANUAL
      }

      await db.insert(fileExtractionResults).values({
        fileId: matchingFile.id,
        extractedCuit: factura.emisor_cuit,
        extractedDate: factura.fecha_emision,
        extractedTotal: factura.total,
        extractedType: factura.tipo_comprobante,
        extractedPointOfSale: factura.punto_venta,
        extractedInvoiceNumber: factura.numero_comprobante,
        confidence: factura.confianza_extraccion,
        method: extractionMethod,
        errors: null,
        extractedAt: factura.procesado_en || new Date().toISOString(), // Usar fecha real de procesamiento
      });

      console.log(
        `✅ factura ${factura.id} → file ${matchingFile.id}: Migrado (CUIT: ${factura.emisor_cuit}, conf: ${factura.confianza_extraccion || 'N/A'}%)`
      );
      migratedCount++;
    } catch (error) {
      console.error(`❌ Error migrando factura ${factura.id}:`, error);
      errors++;
    }
  }

  // ========================================
  // RESUMEN FINAL
  // ========================================
  const totalProcessed = pendingFilesWithExtraction.length + facturasWithHash.length;

  console.log('\n📊 Resumen de migración:');
  console.log(`   ✅ Migrados: ${migratedCount}`);
  console.log(`   ⏭️  Ya existían: ${skippedAlreadyExists}`);
  console.log(`   ⚠️  Sin match (hash): ${skippedNoMatch}`);
  console.log(`   ❌ Errores: ${errors}`);
  console.log(`   📈 Total procesados: ${totalProcessed}`);
  console.log(`      - ${pendingFilesWithExtraction.length} pending_files`);
  console.log(`      - ${facturasWithHash.length} facturas`);

  if (skippedNoMatch > 0) {
    console.log(
      '\n⚠️  ADVERTENCIA: Algunos registros no tienen file correspondiente (hash no match)'
    );
    console.log(
      '   Esto puede indicar que esos archivos fueron borrados o nunca se migraron a files'
    );
  }
}

// Ejecutar
migrate()
  .then(() => {
    console.log('\n✅ Migración completada');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error en migración:', error);
    process.exit(1);
  });
