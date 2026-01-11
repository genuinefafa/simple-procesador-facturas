/**
 * Script de migración: pending_files → files + file_extraction_results
 *
 * Migra todos los registros de pending_files al nuevo modelo:
 * - Crea registro en `files` con metadata del archivo
 * - Crea registro en `file_extraction_results` con datos de extracción (si existen)
 * - Actualiza `facturas.file_id` para facturas que apuntan al pending_file
 * - Actualiza `expected_invoices.matched_file_id` si corresponde
 */

import { db, rawDb } from '../database/db.js';
import { FileRepository } from '../database/repositories/file.js';
import { FileExtractionRepository } from '../database/repositories/file-extraction.js';
import { PendingFileRepository } from '../database/repositories/pending-file.js';
import { expectedInvoices } from '../database/schema.js';
import { eq } from 'drizzle-orm';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Directorio raíz del proyecto (dos niveles arriba de scripts/)
const PROJECT_ROOT = join(__dirname, '..', '..');
const DATA_DIR = join(PROJECT_ROOT, 'data');

console.log('🚀 Iniciando migración: pending_files → files + file_extraction_results\n');
console.log(`📂 Directorio de datos: ${DATA_DIR}\n`);

// Detectar tipo de archivo por extensión
function detectFileType(filePath: string): 'PDF_DIGITAL' | 'PDF_IMAGEN' | 'IMAGEN' | 'HEIC' {
  const ext = filePath.toLowerCase().split('.').pop();

  if (ext === 'heic' || ext === 'heif') return 'HEIC';
  if (ext === 'pdf') return 'PDF_DIGITAL'; // Default, se refinará con OCR si es necesario
  return 'IMAGEN';
}

// Calcular ruta relativa desde data/
function calculateRelativePath(absolutePath: string): string {
  // Si ya es relativa, retornarla tal cual
  if (!absolutePath.startsWith('/')) {
    return absolutePath;
  }

  // Intentar extraer ruta relativa a data/
  if (absolutePath.includes('/data/')) {
    const parts = absolutePath.split('/data/');
    return parts[1] || absolutePath;
  }

  // Fallback: usar el nombre del archivo
  return absolutePath.split('/').pop() || absolutePath;
}

// Verificar si pending tiene datos de extracción
function hasExtractionData(pending: any): boolean {
  return !!(
    pending.extractedCuit ||
    pending.extractedDate ||
    pending.extractedTotal !== null ||
    pending.extractedType !== null ||
    pending.extractedPointOfSale !== null ||
    pending.extractedInvoiceNumber !== null
  );
}

async function main() {
  const fileRepo = new FileRepository();
  const extractionRepo = new FileExtractionRepository();
  const pendingRepo = new PendingFileRepository();

  try {
    // 1. Obtener todos los pending_files
    console.log('📋 Cargando pending_files...');
    const allPending = await pendingRepo.list({ limit: 10000 });
    console.log(`   ✅ ${allPending.length} pending_files encontrados\n`);

    if (allPending.length === 0) {
      console.log('ℹ️  No hay pending_files para migrar\n');
      return;
    }

    let migrated = 0;
    let withExtraction = 0;
    let filesMissing = 0;
    let errors = 0;
    let skipped = 0;

    // 2. Migrar cada pending_file
    for (const pending of allPending) {
      try {
        console.log(`📄 Migrando pending_file ID ${pending.id}: ${pending.originalFilename}`);

        // Verificar si ya fue migrado (buscar por hash o ID)
        let existingFile = null;
        if (pending.fileHash) {
          existingFile = fileRepo.findByHash(pending.fileHash);
        }

        if (existingFile) {
          console.log(`   ℹ️  Ya migrado (file_id: ${existingFile.id}), saltando...`);
          skipped++;
          console.log('');
          continue;
        }

        // Verificar si el archivo físico existe
        const absolutePath = join(DATA_DIR, pending.filePath);
        const fileExists = existsSync(absolutePath);

        if (!fileExists) {
          console.warn(`   ⚠️  Archivo no encontrado: ${pending.filePath}`);
          filesMissing++;
        }

        // Determinar status basado en pending.status
        const status = pending.status === 'processed' ? 'processed' : 'uploaded';

        // Crear registro en files
        const file = fileRepo.create({
          originalFilename: pending.originalFilename,
          fileType: detectFileType(pending.filePath),
          fileSize: pending.fileSize || null,
          fileHash: pending.fileHash || `migrated-${pending.id}-${Date.now()}`,
          storagePath: calculateRelativePath(pending.filePath),
          status: status,
        });

        console.log(`   ✅ File creado con ID: ${file.id}`);

        // Crear registro en file_extraction_results si hay datos extraídos
        if (hasExtractionData(pending)) {
          const extraction = extractionRepo.create({
            fileId: file.id,
            extractedCuit: pending.extractedCuit || null,
            extractedDate: pending.extractedDate || null,
            extractedTotal: pending.extractedTotal || null,
            extractedType: pending.extractedType || null,
            extractedPointOfSale: pending.extractedPointOfSale || null,
            extractedInvoiceNumber: pending.extractedInvoiceNumber || null,
            confidence: pending.extractionConfidence || null,
            method: pending.extractionMethod || null,
            templateId: null, // pending_files no tiene template_id
            errors: pending.extractionErrors || null,
          });

          console.log(`   ✅ Extraction creada con ID: ${extraction.id}`);
          withExtraction++;
        } else {
          console.log(`   ℹ️  Sin datos de extracción`);
        }

        // Actualizar facturas SOLO si el hash coincide (evitar asociaciones incorrectas)
        // Si pending_file tiene hash, solo actualizar facturas con ese mismo hash
        let facturaUpdates = 0;
        if (pending.fileHash) {
          const updateResult = rawDb
            .prepare(
              `UPDATE facturas
               SET file_id = ?
               WHERE pending_file_id = ?
               AND (file_hash = ? OR file_hash IS NULL)`
            )
            .run(file.id, pending.id, pending.fileHash);

          facturaUpdates = updateResult.changes;
        } else {
          // Sin hash, NO actualizar (muy riesgoso, puede ser un pending antiguo reutilizado)
          console.log(
            `   ⚠️  Pending sin hash, saltando actualización de facturas (evitar asociaciones incorrectas)`
          );
        }

        if (facturaUpdates > 0) {
          console.log(`   ✅ ${facturaUpdates} factura(s) actualizada(s) (hash verified)`);
        }

        // Actualizar expected_invoices que matchean con este pending
        const updateExpected = db
          .update(expectedInvoices)
          .set({ matchedFileId: file.id })
          .where(eq(expectedInvoices.matchedPendingFileId, pending.id))
          .run();

        if (updateExpected.changes > 0) {
          console.log(`   ✅ ${updateExpected.changes} expected_invoice(s) actualizada(s)`);
        }

        migrated++;
        console.log('');
      } catch (error) {
        console.error(`   ❌ Error migrando pending_file ${pending.id}:`, error);
        errors++;
        console.log('');
      }
    }

    // 3. Verificación de integridad
    console.log('\n' + '='.repeat(60));
    console.log('🔍 Verificando integridad de datos...\n');

    // Verificar que todos los pending tienen file
    const orphanPending = rawDb
      .prepare(
        `
        SELECT COUNT(*) as count
        FROM pending_files p
        LEFT JOIN files f ON f.file_hash LIKE 'migrated-' || p.id || '-%'
          OR (p.file_hash IS NOT NULL AND p.file_hash = f.file_hash)
        WHERE f.id IS NULL
      `
      )
      .get() as { count: number };

    // Verificar que facturas con pending_file_id tienen fileId
    const orphanFacturas = rawDb
      .prepare(
        `
        SELECT COUNT(*) as count
        FROM facturas
        WHERE pending_file_id IS NOT NULL AND file_id IS NULL
      `
      )
      .get() as { count: number };

    const totalFacturasWithPending = rawDb
      .prepare(`SELECT COUNT(*) as count FROM facturas WHERE pending_file_id IS NOT NULL`)
      .get() as { count: number };

    console.log(
      `   ${orphanPending.count === 0 ? '✅' : '❌'} Pending files sin file: ${orphanPending.count}`
    );
    console.log(
      `   ${orphanFacturas.count === 0 ? '✅' : '❌'} Facturas con pending_file_id sin file_id: ${orphanFacturas.count}/${totalFacturasWithPending.count}`
    );

    // 4. Resumen final
    console.log('\n' + '='.repeat(60));
    console.log('📊 Resumen de migración:');
    console.log('='.repeat(60));
    console.log(`   Total pending_files: ${allPending.length}`);
    console.log(`   ⏭️  Ya migrados (saltados): ${skipped}`);
    console.log(`   ✅ Migrados exitosamente: ${migrated}`);
    console.log(`   📊 Con datos de extracción: ${withExtraction}`);
    console.log(`   ⚠️  Archivos no encontrados: ${filesMissing}`);
    console.log(`   ❌ Errores: ${errors}`);
    console.log('='.repeat(60));

    if (orphanPending.count > 0) {
      console.log('\n❌ ERROR: Hay pending_files sin migrar');
      console.log('   Revisar manualmente los registros huérfanos\n');
      process.exit(1);
    }

    if (orphanFacturas.count > 0) {
      console.log(`\n⚠️  NOTA: Hay ${orphanFacturas.count} facturas legacy sin file_id`);
      console.log('   Estas son facturas antiguas creadas antes del sistema de files');
      console.log('   Serán migradas en el siguiente script (migrate-invoices-to-files.ts)\n');
    }

    console.log('\n✅ Migración completada exitosamente!\n');
  } catch (error) {
    console.error('\n❌ Error fatal durante la migración:', error);
    process.exit(1);
  }
}

main();
