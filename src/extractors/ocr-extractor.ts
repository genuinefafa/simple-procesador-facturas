/**
 * Extractor OCR para imágenes y PDFs escaneados
 *
 * TODO: Implementar en Fase 2
 * - Integrar Tesseract.js para OCR
 * - Preprocesamiento de imágenes (binarización, denoise)
 * - Extracción por zonas configurables
 * - Detección de orientación
 */

import type { ExtractionResult } from '../utils/types';

export class OCRExtractor {
  /**
   * Extrae texto de una imagen usando OCR
   * @param filePath - Ruta al archivo de imagen
   * @returns Texto extraído
   *
   * TODO: Implementar con Tesseract.js
   */
  async extractText(_filePath: string): Promise<string> {
    throw new Error('OCR no implementado aún. Se implementará en Fase 2.');
  }

  /**
   * Extrae información de factura de una imagen
   * @param filePath - Ruta al archivo de imagen
   * @returns Resultado de extracción
   *
   * TODO: Implementar extracción de campos específicos
   */
  async extract(_filePath: string): Promise<ExtractionResult> {
    return {
      success: false,
      confidence: 0,
      data: {},
      errors: ['OCR no implementado. Se implementará en Fase 2 con Tesseract.js'],
      method: 'GENERICO',
    };
  }
}
