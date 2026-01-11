/**
 * Script de migración: facturas legacy → files
 *
 * Migra facturas que tienen archivos físicos pero no file_id:
 * - Busca archivo usando fallback de rutas (finalizedFile, archivoProcesado, archivoOriginal)
 * - Calcula hash SHA-256 del archivo físico
 * - Verifica que coincida con factura.file_hash (si existe)
 * - Crea registro en files o reutiliza si ya existe (deduplicación por hash)
 * - Actualiza factura.file_id SOLO si hash verificado
 *
 * IMPORTANTE: Usa hash como fuente de verdad para evitar asociaciones incorrectas
 */

import { db } from '../database/db.js';
import { FileRepository } from '../database/repositories/file.js';
import { facturas } from '../database/schema.js';
import { isNull, eq } from 'drizzle-orm';
import { existsSync, statSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { calculateFileHash } from '../utils/file-hash.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = join(__dirname, '..', '..');
const DATA_DIR = join(PROJECT_ROOT, 'data');

console.log('🚀 Iniciando migración: facturas legacy → files\n');
console.log(`📂 Directorio de datos: ${DATA_DIR}\n`);

// Detectar tipo de archivo por extensión
function detectFileType(filePath: string): 'PDF_DIGITAL' | 'PDF_IMAGEN' | 'IMAGEN' | 'HEIC' {
  const ext = filePath.toLowerCase().split('.').pop();
  if (ext === 'heic' || ext === 'heif') return 'HEIC';
  if (ext === 'pdf') return 'PDF_DIGITAL';
  return 'IMAGEN';
}

// Calcular ruta relativa desde data/
function calculateRelativePath(absolutePath: string): string {
  if (!absolutePath.startsWith('/')) {
    return absolutePath;
  }

  if (absolutePath.includes('/data/')) {
    const parts = absolutePath.split('/data/');
    return parts[1] || absolutePath;
  }

  return absolutePath.split('/').pop() || absolutePath;
}

// Buscar archivo usando fallback de rutas (igual que en el código actual)
function findInvoiceFile(invoice: any): string | null {
  // Prioridad 1: finalizedFile (ruta relativa)
  if (invoice.finalizedFile) {
    const relativePath = join(DATA_DIR, invoice.finalizedFile);
    if (existsSync(relativePath)) {
      return relativePath;
    }
  }

  // Prioridad 2: archivoProcesado (ruta absoluta)
  if (invoice.archivoProcesado && existsSync(invoice.archivoProcesado)) {
    return invoice.archivoProcesado;
  }

  // Prioridad 3: archivoOriginal (ruta absoluta)
  if (invoice.archivoOriginal && existsSync(invoice.archivoOriginal)) {
    return invoice.archivoOriginal;
  }

  // Prioridad 4: Buscar en finalized/ por patrón
  if (invoice.comprobanteCompleto) {
    // Extraer año de la fecha
    const year = invoice.fechaEmision?.substring(0, 4);
    if (year) {
      const pattern = `${invoice.emisorCuit}_${invoice.fechaEmision.replace(/-/g, '')}_${invoice.comprobanteCompleto.replace(/\//g, '-')}`;
      const searchDir = join(DATA_DIR, 'finalized', year);

      if (existsSync(searchDir)) {
        const { readdirSync } = require('fs');
        const files = readdirSync(searchDir);
        const match = files.find((f: string) => f.includes(pattern));
        if (match) {
          const fullPath = join(searchDir, match);
          if (existsSync(fullPath)) {
            return fullPath;
          }
        }
      }
    }
  }

  return null;
}

async function main() {
  const fileRepo = new FileRepository();

  try {
    // 1. Obtener todas las facturas sin file_id
    console.log('📋 Cargando facturas sin file_id...');
    const invoicesWithoutFile = db.select().from(facturas).where(isNull(facturas.fileId)).all();

    console.log(`   ✅ ${invoicesWithoutFile.length} facturas sin file_id encontradas\n`);

    if (invoicesWithoutFile.length === 0) {
      console.log('ℹ️  No hay facturas para migrar\n');
      return;
    }

    let migrated = 0;
    let hashVerified = 0;
    let noHashInInvoice = 0;
    let hashMismatch = 0;
    let fileNotFound = 0;
    let reutilized = 0;
    let errors = 0;

    // 2. Migrar cada factura
    for (const invoice of invoicesWithoutFile) {
      try {
        console.log(
          `📄 Factura ID ${invoice.id}: ${invoice.comprobanteCompleto} (${invoice.emisorCuit})`
        );

        // Buscar archivo físico
        const filePath = findInvoiceFile(invoice);

        if (!filePath) {
          console.warn(`   ⚠️  Archivo no encontrado (probado fallback completo)`);
          fileNotFound++;
          console.log('');
          continue;
        }

        console.log(`   📁 Archivo encontrado: ${filePath}`);

        // Calcular hash del archivo físico
        const { hash: physicalHash } = await calculateFileHash(filePath);
        console.log(`   🔐 Hash calculado: ${physicalHash.substring(0, 16)}...`);

        // VALIDACIÓN CRÍTICA: Verificar hash si existe en factura
        if (invoice.fileHash) {
          if (invoice.fileHash !== physicalHash) {
            console.error(`   ❌ Hash mismatch!`);
            console.error(`      BD:     ${invoice.fileHash.substring(0, 16)}...`);
            console.error(`      Físico: ${physicalHash.substring(0, 16)}...`);
            console.error(`   ⚠️  Archivo incorrecto o modificado - NO migrar`);
            hashMismatch++;
            console.log('');
            continue;
          }
          console.log(`   ✅ Hash verificado (coincide con BD)`);
          hashVerified++;
        } else {
          console.warn(`   ⚠️  Factura sin hash en BD - confianza baja, usando hash calculado`);
          noHashInInvoice++;
        }

        // Buscar si ya existe file con ese hash (deduplicación)
        let file = fileRepo.findByHash(physicalHash);

        if (file) {
          console.log(`   ♻️  File ya existe (ID: ${file.id}), reutilizando...`);
          reutilized++;
        } else {
          // Crear nuevo file
          const fileSize = statSync(filePath).size;
          const fileName = basename(filePath);

          file = fileRepo.create({
            originalFilename: fileName,
            fileType: invoice.tipoArchivo || detectFileType(filePath),
            fileSize: fileSize,
            fileHash: physicalHash,
            storagePath: calculateRelativePath(filePath),
            status: 'processed', // Ya está asociado a factura
          });

          console.log(`   ✅ File creado con ID: ${file.id}`);
        }

        // Actualizar factura.file_id
        db.update(facturas)
          .set({
            fileId: file.id,
            fileHash: physicalHash, // Sincronizar hash si faltaba
          })
          .where(eq(facturas.id, invoice.id))
          .run();

        console.log(`   ✅ Factura actualizada con file_id: ${file.id}`);
        migrated++;
        console.log('');
      } catch (error) {
        console.error(`   ❌ Error migrando factura ${invoice.id}:`, error);
        errors++;
        console.log('');
      }
    }

    // 3. Verificación de integridad
    console.log('\n' + '='.repeat(60));
    console.log('🔍 Verificando integridad de datos...\n');

    const remainingWithoutFile = db
      .select()
      .from(facturas)
      .where(isNull(facturas.fileId))
      .all().length;

    console.log(
      `   ${remainingWithoutFile === 0 ? '✅' : '⚠️'} Facturas sin file_id: ${remainingWithoutFile}`
    );

    // 4. Resumen final
    console.log('\n' + '='.repeat(60));
    console.log('📊 Resumen de migración:');
    console.log('='.repeat(60));
    console.log(`   Total facturas procesadas: ${invoicesWithoutFile.length}`);
    console.log(`   ✅ Migradas exitosamente: ${migrated}`);
    console.log(`      ├─ 🔐 Hash verificado (BD): ${hashVerified}`);
    console.log(`      ├─ ⚠️  Sin hash en BD: ${noHashInInvoice}`);
    console.log(`      └─ ♻️  Files reutilizados: ${reutilized}`);
    console.log(`   ❌ No migradas:`);
    console.log(`      ├─ 🔐 Hash mismatch: ${hashMismatch}`);
    console.log(`      ├─ 📁 Archivo no encontrado: ${fileNotFound}`);
    console.log(`      └─ ❌ Errores: ${errors}`);
    console.log('='.repeat(60));

    if (hashMismatch > 0) {
      console.log(`\n⚠️  ADVERTENCIA: ${hashMismatch} factura(s) con hash mismatch`);
      console.log('   Estos archivos fueron modificados o reemplazados');
      console.log('   Revisar manualmente antes de asociarlos\n');
    }

    if (fileNotFound > 0) {
      console.log(`\n⚠️  ADVERTENCIA: ${fileNotFound} archivo(s) no encontrado(s)`);
      console.log('   Archivos físicos perdidos o movidos fuera de data/\n');
    }

    console.log('\n✅ Migración completada!\n');
  } catch (error) {
    console.error('\n❌ Error fatal durante la migración:', error);
    process.exit(1);
  }
}

main();
