/**
 * Scanner de archivos para detectar facturas en un directorio
 */

import { readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import type { DocumentType } from '../utils/types';

export interface ScannedFile {
  path: string;
  name: string;
  extension: string;
  type: DocumentType;
  size: number;
  modifiedAt: Date;
}

/**
 * Extensiones soportadas y su tipo correspondiente
 */
const SUPPORTED_EXTENSIONS: Record<string, DocumentType> = {
  '.pdf': 'PDF_DIGITAL', // Por defecto, luego se detectará si es imagen
  '.jpg': 'IMAGEN',
  '.jpeg': 'IMAGEN',
  '.png': 'IMAGEN',
  '.tif': 'IMAGEN',
  '.tiff': 'IMAGEN',
  '.heif': 'IMAGEN',
  '.heic': 'IMAGEN',
};

export class FileScanner {
  private directory: string;

  constructor(directory: string) {
    this.directory = directory;
  }

  /**
   * Escanea el directorio en busca de archivos de facturas
   * @returns Array de archivos encontrados
   */
  scan(): ScannedFile[] {
    const files: ScannedFile[] = [];

    try {
      const entries = readdirSync(this.directory);

      for (const entry of entries) {
        const fullPath = join(this.directory, entry);
        const stats = statSync(fullPath);

        // Solo procesar archivos (no directorios)
        if (!stats.isFile()) {
          continue;
        }

        const ext = extname(entry).toLowerCase();

        // Verificar si la extensión es soportada
        if (ext in SUPPORTED_EXTENSIONS) {
          files.push({
            path: fullPath,
            name: entry,
            extension: ext,
            type: SUPPORTED_EXTENSIONS[ext]!,
            size: stats.size,
            modifiedAt: stats.mtime,
          });
        }
      }

      // Ordenar por fecha de modificación (más recientes primero)
      files.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
    } catch (error) {
      console.error('Error al escanear directorio:', error);
      throw new Error(`No se pudo escanear el directorio: ${this.directory}`);
    }

    return files;
  }

  /**
   * Verifica si hay archivos pendientes de procesar
   * @returns true si hay archivos
   */
  hasFiles(): boolean {
    return this.scan().length > 0;
  }

  /**
   * Obtiene estadísticas del directorio
   * @returns Estadísticas de archivos por tipo
   */
  getStats(): {
    total: number;
    byType: Record<DocumentType, number>;
    totalSize: number;
  } {
    const files = this.scan();
    const byType: Record<string, number> = {};
    let totalSize = 0;

    for (const file of files) {
      byType[file.type] = (byType[file.type] || 0) + 1;
      totalSize += file.size;
    }

    return {
      total: files.length,
      byType: byType as Record<DocumentType, number>,
      totalSize,
    };
  }
}
