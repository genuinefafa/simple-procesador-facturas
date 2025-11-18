/**
 * Utilidades para generar archivos YAML de anotación de facturas
 */

import type { Emitter, InvoiceType } from './types';
import { formatDateForFilename } from './file-naming';
import { writeFileSync } from 'fs';
import path from 'path';

/**
 * Interfaz para datos de factura a anotar
 */
export interface InvoiceAnnotation {
  emitter: Emitter;
  invoiceType: InvoiceType;
  pointOfSale: number;
  invoiceNumber: number;
  issueDate: Date;
  total?: number;
  extractionConfidence: number;
}

/**
 * Genera el contenido YAML de anotación de factura
 *
 * @param annotation - Datos de la factura
 * @returns Contenido del archivo YAML
 */
export function generateYAMLContent(annotation: InvoiceAnnotation): string {
  const {
    emitter,
    invoiceType,
    pointOfSale,
    issueDate,
    invoiceNumber,
    total,
    extractionConfidence,
  } = annotation;

  // Encontrar el alias más corto o usar el nombre
  const shortestAlias =
    emitter.aliases.length > 0
      ? emitter.aliases.reduce((prev, curr) => (curr.length < prev.length ? curr : prev))
      : null;

  const lines: string[] = [
    '# Anotación de factura procesada automáticamente',
    `# Confianza de extracción: ${extractionConfidence.toFixed(1)}%`,
    '',
    'emisor:',
    `  cuit: "${emitter.cuit}"`,
    `  nombre: "${emitter.name}"`,
  ];

  if (shortestAlias) {
    lines.push(`  alias: "${shortestAlias}"`);
  }

  if (emitter.aliases.length > 1) {
    lines.push(
      `  # Otros aliases: ${emitter.aliases.filter((a) => a !== shortestAlias).join(', ')}`
    );
  }

  lines.push('');
  lines.push('factura:');
  lines.push(`  tipo: "${invoiceType}"`);
  lines.push(`  punto_venta: ${pointOfSale}`);
  lines.push(`  numero: ${invoiceNumber}`);
  lines.push(`  fecha: "${formatDateForFilename(issueDate)}"`);

  if (total !== undefined) {
    lines.push(`  total: ${total.toFixed(2)}`);
  } else {
    lines.push('  # total: [no detectado]');
  }

  lines.push('');
  lines.push('# Campos opcionales para templates futuros:');
  lines.push('# sugerencia_template: "estandar_horizontal"');
  lines.push('# notas: "Agregar observaciones manuales aquí"');
  lines.push('');

  return lines.join('\n');
}

/**
 * Genera y guarda un archivo YAML de anotación
 *
 * @param originalFilePath - Ruta del archivo original (para generar nombre .yml)
 * @param annotation - Datos de la factura
 * @returns Ruta del archivo YAML generado
 */
export function generateYAMLFile(originalFilePath: string, annotation: InvoiceAnnotation): string {
  const content = generateYAMLContent(annotation);

  // Generar ruta del archivo .yml (mismo nombre pero con extensión .yml)
  const dir = path.dirname(originalFilePath);
  const basename = path.basename(originalFilePath, path.extname(originalFilePath));
  const yamlPath = path.join(dir, `${basename}.yml`);

  // Escribir archivo
  writeFileSync(yamlPath, content, 'utf-8');

  return yamlPath;
}
