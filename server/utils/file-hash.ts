/**
 * Utilidades para cálculo de hash SHA-256 de archivos
 *
 * Usa streaming para archivos grandes y provee funciones
 * para verificación de integridad.
 */

import { createReadStream } from 'fs';
import { createHash } from 'crypto';
import { stat } from 'fs/promises';

export interface HashCalculationResult {
  hash: string; // SHA-256 hex string (64 caracteres)
  algorithm: 'sha256';
  fileSize: number;
  calculatedAt: Date;
}

/**
 * Calcula el hash SHA-256 de un archivo usando streaming
 *
 * @param filePath - Ruta absoluta al archivo
 * @returns Resultado con hash, algoritmo, tamaño y timestamp
 * @throws Error si el archivo no existe o no se puede leer
 *
 * @example
 * const result = await calculateFileHash('/path/to/file.pdf');
 * console.log(result.hash); // 'a1b2c3d4...'
 */
export async function calculateFileHash(filePath: string): Promise<HashCalculationResult> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));

    stream.on('end', () => {
      void (async () => {
        try {
          const fileStats = await stat(filePath);
          resolve({
            hash: hash.digest('hex'),
            algorithm: 'sha256',
            fileSize: fileStats.size,
            calculatedAt: new Date(),
          });
        } catch (error) {
          reject(
            new Error(
              `Error obteniendo stats del archivo: ${error instanceof Error ? error.message : String(error)}`
            )
          );
        }
      })();
    });

    stream.on('error', (error) => {
      reject(new Error(`Error leyendo archivo: ${error.message}`));
    });
  });
}

/**
 * Verifica si un archivo coincide con un hash esperado
 *
 * @param filePath - Ruta absoluta al archivo
 * @param expectedHash - Hash SHA-256 esperado (case-insensitive)
 * @returns true si el hash coincide, false si no
 *
 * @example
 * const isValid = await verifyFileHash('/path/to/file.pdf', 'a1b2c3...');
 * if (isValid) console.log('Archivo íntegro');
 */
export async function verifyFileHash(filePath: string, expectedHash: string): Promise<boolean> {
  try {
    const result = await calculateFileHash(filePath);
    // Comparación case-insensitive
    return result.hash.toLowerCase() === expectedHash.toLowerCase();
  } catch (error) {
    console.error(`Error verificando hash de ${filePath}:`, error);
    return false;
  }
}

/**
 * Calcula hashes de múltiples archivos en paralelo
 *
 * @param filePaths - Array de rutas absolutas a archivos
 * @returns Map con ruta del archivo como key y resultado como value
 *
 * @example
 * const hashes = await calculateBatchHashes(['/file1.pdf', '/file2.pdf']);
 * for (const [path, result] of hashes) {
 *   console.log(`${path}: ${result.hash}`);
 * }
 */
export async function calculateBatchHashes(
  filePaths: string[]
): Promise<Map<string, HashCalculationResult>> {
  const results = await Promise.allSettled(
    filePaths.map(async (path) => ({
      path,
      result: await calculateFileHash(path),
    }))
  );

  const hashMap = new Map<string, HashCalculationResult>();

  for (const result of results) {
    if (result.status === 'fulfilled') {
      hashMap.set(result.value.path, result.value.result);
    } else {
      console.warn(`Error calculando hash: ${result.reason}`);
    }
  }

  return hashMap;
}
