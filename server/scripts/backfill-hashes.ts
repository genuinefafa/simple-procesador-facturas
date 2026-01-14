/**
 * Script de backfill para generar hashes SHA-256 de archivos existentes
 *
 * Este script:
 * - Conecta a la BD y carga todos los registros de facturas Y files
 * - Filtra los que tienen archivo != NULL
 * - Calcula hash SHA-256 para archivos que no tienen hash
 * - Actualiza la BD con los hashes calculados
 * - Reporta archivos no encontrados (posibles archivos perdidos)
 *
 * Uso:
 *   npm run backfill-hashes
 */

import { InvoiceRepository } from '../database/repositories/invoice.js';
import { FileRepository } from '../database/repositories/file.js';
import { calculateFileHash } from '../utils/file-hash.js';
import { existsSync } from 'fs';

interface BackfillStats {
  total: number;
  alreadyHashed: number;
  hashed: number;
  notFound: number;
  errors: number;
}

async function backfillHashes(): Promise<BackfillStats> {
  console.log('🔐 Iniciando backfill de hashes...\n');

  const invoiceRepo = new InvoiceRepository();
  const fileRepo = new FileRepository();

  const allInvoices = await invoiceRepo.listAllProcessed();
  const allFiles = fileRepo.list();

  const stats: BackfillStats = {
    total: allInvoices.length + allFiles.length,
    alreadyHashed: 0,
    hashed: 0,
    notFound: 0,
    errors: 0,
  };

  console.log(`📊 Total de facturas procesadas: ${allInvoices.length}`);
  console.log(`📊 Total de files: ${allFiles.length}\n`);

  for (let i = 0; i < allInvoices.length; i++) {
    const invoice = allInvoices[i];
    if (!invoice) continue; // Safety check

    // Skip si ya tiene hash
    if (invoice.fileHash) {
      stats.alreadyHashed++;
      continue;
    }

    // El processedFile ya es una ruta absoluta completa
    const filePath = invoice.processedFile;

    // Verificar que existe
    if (!existsSync(filePath)) {
      console.warn(`❌ Archivo no encontrado: ${filePath}`);
      stats.notFound++;
      continue;
    }

    // Calcular hash
    try {
      const hashResult = await calculateFileHash(filePath);
      await invoiceRepo.updateFileHash(invoice.id, hashResult.hash);

      stats.hashed++;

      // Progress cada 10 archivos
      if ((i + 1) % 10 === 0) {
        console.log(`⏳ Progreso: ${i + 1}/${stats.total} (${stats.hashed} hasheados)`);
      }
    } catch (error) {
      console.error(`❌ Error hasheando ${invoice.processedFile}:`, error);
      stats.errors++;
    }
  }

  // Procesar files
  console.log('\n🔄 Procesando files...\n');
  for (let i = 0; i < allFiles.length; i++) {
    const file = allFiles[i];
    if (!file) continue;

    // Skip si ya tiene hash
    if (file.fileHash) {
      stats.alreadyHashed++;
      continue;
    }

    const filePath = file.storagePath;

    // Verificar que existe
    if (!existsSync(filePath)) {
      console.warn(`❌ Archivo no encontrado: ${filePath}`);
      stats.notFound++;
      continue;
    }

    // Calcular hash
    try {
      const hashResult = await calculateFileHash(filePath);
      fileRepo.updateHash(file.id, hashResult.hash);

      stats.hashed++;

      // Progress cada 10 archivos
      if ((i + 1) % 10 === 0) {
        console.log(
          `⏳ Progreso files: ${i + 1}/${allFiles.length} (${stats.hashed} hasheados total)`
        );
      }
    } catch (error) {
      console.error(`❌ Error hasheando ${file.storagePath}:`, error);
      stats.errors++;
    }
  }

  // Reporte final
  console.log('\n📊 Reporte Final:');
  console.log(`   Total procesados: ${stats.total}`);
  console.log(`   ✅ Ya tenían hash: ${stats.alreadyHashed}`);
  console.log(`   🔐 Hasheados ahora: ${stats.hashed}`);
  console.log(`   ❌ No encontrados: ${stats.notFound}`);
  console.log(`   ⚠️  Errores: ${stats.errors}`);

  return stats;
}

backfillHashes()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
