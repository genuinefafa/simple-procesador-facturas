/**
 * Script de reconciliación de archivos
 *
 * Busca archivos faltantes y actualiza las rutas en la DB.
 * Prioridad: 1) Por hash, 2) Por número de comprobante
 *
 * Si encuentra archivos fuera de finalized/, los mueve con el nombre correcto.
 *
 * Uso:
 *   npm run reconcile-files              # Modo dry-run (solo muestra qué haría)
 *   npm run reconcile-files -- --fix     # Aplica los cambios
 */

import { getDb } from '../database/db.js';
import { facturas, files, emisores } from '../database/schema.js';
import { eq } from 'drizzle-orm';
import { existsSync, readdirSync, statSync, renameSync, mkdirSync, copyFileSync } from 'fs';
import { join, basename, dirname } from 'path';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { generateProcessedFilename, generateSubdirectory } from '../utils/file-naming.js';
import type { Emitter } from '@shared/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Subir dos niveles: scripts/ -> server/ -> proyecto/
const DATA_DIR = join(__dirname, '..', '..', 'data');
const FINALIZED_DIR = join(DATA_DIR, 'finalized');
const INPUT_DIR = join(DATA_DIR, 'input');

const isDryRun = !process.argv.includes('--fix');

interface FileInfo {
  path: string; // Ruta relativa a data/
  hash?: string;
}

interface ReconcileResult {
  facturaId: number;
  comprobante: string;
  oldPath: string;
  newPath: string | null;
  method: 'hash' | 'comprobante' | 'not_found';
  action: 'update_path' | 'move_and_update' | 'none';
}

// Calcular hash SHA-256 de un archivo
function calculateHash(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

// Listar todos los archivos en un directorio recursivamente
function listFilesRecursive(dir: string, relativeTo: string = dir): FileInfo[] {
  if (!existsSync(dir)) return [];

  const result: FileInfo[] = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      result.push(...listFilesRecursive(fullPath, relativeTo));
    } else if (/\.(pdf|jpg|jpeg|png|heic)$/i.test(entry)) {
      // Calcular ruta relativa a DATA_DIR
      const relativePath = fullPath.substring(relativeTo.length + 1);
      result.push({ path: relativePath });
    }
  }

  return result;
}

// Extraer número de comprobante de un nombre de archivo
function extractComprobanteFromFilename(filename: string): string | null {
  // Buscar patrón XXXXX-XXXXXXXX (punto venta - número)
  const match = filename.match(/(\d{4,5})-(\d{6,8})/);
  if (match && match[1] && match[2]) {
    return `${match[1].padStart(5, '0')}-${match[2].padStart(8, '0')}`;
  }
  return null;
}

async function main() {
  console.log('🔍 Reconciliación de archivos\n');
  console.log(
    `   Modo: ${isDryRun ? 'DRY-RUN (solo muestra, no modifica)' : '⚠️  FIX (aplicará cambios)'}`
  );
  console.log('');

  // 1. Indexar todos los archivos disponibles
  console.log('📂 Indexando archivos disponibles...');

  const allFiles: Map<string, FileInfo[]> = new Map(); // hash -> archivos
  const filesByComprobante: Map<string, FileInfo[]> = new Map(); // comprobante -> archivos

  const dirsToScan = [FINALIZED_DIR, INPUT_DIR];

  for (const dir of dirsToScan) {
    if (!existsSync(dir)) {
      console.log(`   ⚠️  ${dir} no existe`);
      continue;
    }

    const dirName = basename(dir);
    const filesInDir = listFilesRecursive(dir, DATA_DIR);

    console.log(`   ${dirName}/: ${filesInDir.length} archivos`);
    const firstFile = filesInDir[0];
    if (firstFile) {
      console.log(`      Ejemplo: ${firstFile.path}`);
    }

    for (const file of filesInDir) {
      const fullPath = join(DATA_DIR, file.path);

      // Calcular hash
      try {
        file.hash = calculateHash(fullPath);

        // Indexar por hash
        if (!allFiles.has(file.hash)) {
          allFiles.set(file.hash, []);
        }
        allFiles.get(file.hash)!.push(file);
      } catch (e) {
        console.warn(`   ⚠️  No se pudo leer: ${file.path}`);
      }

      // Indexar por número de comprobante
      const comprobante = extractComprobanteFromFilename(file.path);
      if (comprobante) {
        if (!filesByComprobante.has(comprobante)) {
          filesByComprobante.set(comprobante, []);
        }
        filesByComprobante.get(comprobante)!.push(file);
      }
    }
  }

  console.log(`   Total indexados: ${allFiles.size} hashes únicos\n`);

  // 2. Buscar facturas con archivos faltantes
  console.log('🔎 Buscando archivos faltantes...\n');

  const results: ReconcileResult[] = [];

  const facturasRaw = db
    .select({
      id: facturas.id,
      fileId: facturas.fileId,
      emisorCuit: facturas.emisorCuit,
      fechaEmision: facturas.fechaEmision,
      tipoComprobante: facturas.tipoComprobante,
      puntoVenta: facturas.puntoVenta,
      numeroComprobante: facturas.numeroComprobante,
    })
    .from(facturas)
    .all();

  const facturasData = facturasRaw.map((f) => ({
    ...f,
    comprobante: `${f.tipoComprobante}-${String(f.puntoVenta).padStart(5, '0')}-${String(f.numeroComprobante).padStart(8, '0')}`,
  }));

  for (const factura of facturasData) {
    if (!factura.fileId) continue;

    const file = getDb().select().from(files).where(eq(files.id, factura.fileId)).get();
    if (!file) continue;

    const currentPath = join(DATA_DIR, file.storagePath);

    // Si el archivo existe, skip
    if (existsSync(currentPath)) continue;

    const result: ReconcileResult = {
      facturaId: factura.id,
      comprobante: factura.comprobante,
      oldPath: file.storagePath,
      newPath: null,
      method: 'not_found',
      action: 'none',
    };

    // Intentar buscar por hash
    if (file.fileHash) {
      const matchingFiles = allFiles.get(file.fileHash);
      const firstMatch = matchingFiles?.[0];
      if (firstMatch) {
        result.newPath = firstMatch.path;
        result.method = 'hash';
      }
    }

    // Si no encontramos por hash, buscar por número de comprobante
    if (!result.newPath) {
      // Extraer PV-NUM del comprobante (ej: "FACA 2090-00118387" -> "02090-00118387")
      const match = factura.comprobante.match(/(\d{4,5})-(\d{6,8})/);
      if (match && match[1] && match[2]) {
        const comprobanteKey = `${match[1].padStart(5, '0')}-${match[2].padStart(8, '0')}`;
        const matchingFiles = filesByComprobante.get(comprobanteKey);
        const firstMatch = matchingFiles?.[0];
        if (firstMatch) {
          result.newPath = firstMatch.path;
          result.method = 'comprobante';
        }
      }
    }

    // Determinar acción
    if (result.newPath) {
      if (result.newPath.startsWith('finalized/')) {
        result.action = 'update_path';
      } else {
        result.action = 'move_and_update';
      }
    }

    results.push(result);
  }

  // 3. Mostrar resultados
  const found = results.filter((r) => r.newPath);
  const notFound = results.filter((r) => !r.newPath);
  const byHash = results.filter((r) => r.method === 'hash');
  const byComprobante = results.filter((r) => r.method === 'comprobante');
  const toMove = results.filter((r) => r.action === 'move_and_update');
  const toUpdate = results.filter((r) => r.action === 'update_path');

  console.log('📊 Resumen:\n');
  console.log(`   Total faltantes: ${results.length}`);
  console.log(`   ✅ Encontrados: ${found.length}`);
  console.log(`      - Por hash: ${byHash.length}`);
  console.log(`      - Por comprobante: ${byComprobante.length}`);
  console.log(`   ❌ No encontrados: ${notFound.length}`);
  console.log('');
  console.log(`   Acciones:`);
  console.log(`      - Actualizar ruta: ${toUpdate.length}`);
  console.log(`      - Mover a finalized/ + actualizar: ${toMove.length}`);
  console.log('');

  if (found.length > 0) {
    console.log('📋 Detalle de archivos encontrados:\n');
    for (const r of found.slice(0, 20)) {
      console.log(`   ${r.comprobante}`);
      console.log(`      Antes: ${r.oldPath}`);
      console.log(`      Ahora: ${r.newPath}`);
      console.log(`      Método: ${r.method}, Acción: ${r.action}`);
      console.log('');
    }
    if (found.length > 20) {
      console.log(`   ... y ${found.length - 20} más\n`);
    }
  }

  if (notFound.length > 0) {
    console.log('❌ Archivos no encontrados:\n');
    for (const r of notFound.slice(0, 10)) {
      console.log(`   ${r.comprobante}: ${r.oldPath}`);
    }
    if (notFound.length > 10) {
      console.log(`   ... y ${notFound.length - 10} más\n`);
    }
  }

  // 4. Aplicar cambios si no es dry-run
  if (!isDryRun && found.length > 0) {
    console.log('🔧 Aplicando cambios...\n');

    for (const r of found) {
      if (!r.newPath) continue;

      const file = db
        .select()
        .from(files)
        .where(
          eq(
            files.id,
            db
              .select({ fileId: facturas.fileId })
              .from(facturas)
              .where(eq(facturas.id, r.facturaId))
              .get()?.fileId || 0
          )
        )
        .get();

      if (!file) continue;

      let finalPath = r.newPath;

      // Si necesita mover a finalized/
      if (r.action === 'move_and_update') {
        // Obtener datos de la factura
        const fact = getDb().select().from(facturas).where(eq(facturas.id, r.facturaId)).get();

        if (fact) {
          const emisorData = db
            .select()
            .from(emisores)
            .where(eq(emisores.cuit, fact.emisorCuit))
            .get();

          if (emisorData) {
            // Construir objeto Emitter para usar generateProcessedFilename
            const emitter: Emitter = {
              cuit: emisorData.cuit,
              name: emisorData.nombre,
              displayName: emisorData.nombre,
              legalName: emisorData.razonSocial ?? undefined,
              aliases: emisorData.aliases ? JSON.parse(emisorData.aliases) : [],
              active: true,
              totalInvoices: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            // Parsear fecha
            const issueDate = new Date(fact.fechaEmision + 'T00:00:00Z');
            const yearMonth = generateSubdirectory(issueDate);

            // Crear directorio destino
            const destDir = join(FINALIZED_DIR, yearMonth);
            if (!existsSync(destDir)) {
              mkdirSync(destDir, { recursive: true });
            }

            // Generar nombre usando la función estándar (usa getShortestName internamente)
            const newName = generateProcessedFilename(
              issueDate,
              emitter,
              fact.tipoComprobante,
              fact.puntoVenta,
              fact.numeroComprobante,
              r.newPath, // Para obtener extensión
              null // categoryKey - no tenemos esta info aquí
            );

            finalPath = `finalized/${yearMonth}/${newName}`;

            // Copiar o mover archivo según origen
            const srcFull = join(DATA_DIR, r.newPath);
            const destFull = join(DATA_DIR, finalPath);

            if (r.newPath.startsWith('input/')) {
              // input/ es inmutable - copiar, no mover
              console.log(`   📋 Copiando: ${r.newPath} → ${finalPath}`);
              copyFileSync(srcFull, destFull);
            } else {
              // Otros directorios - mover
              console.log(`   📦 Moviendo: ${r.newPath} → ${finalPath}`);
              renameSync(srcFull, destFull);
            }
          }
        }
      }

      // Actualizar DB
      getDb().update(files).set({ storagePath: finalPath }).where(eq(files.id, file.id)).run();

      console.log(`   ✅ Actualizado: Factura ${r.facturaId} → ${finalPath}`);
    }

    console.log('\n✨ Reconciliación completada!');
  } else if (isDryRun && found.length > 0) {
    console.log('💡 Ejecutar con --fix para aplicar los cambios:');
    console.log('   npm run reconcile-files -- --fix\n');
  }
}

main().catch(console.error);
