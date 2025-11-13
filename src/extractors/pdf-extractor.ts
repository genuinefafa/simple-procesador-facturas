/**
 * Extractor de texto de PDFs digitales
 */

import pdf from 'pdf-parse';
import { readFileSync } from 'fs';
import type { ExtractionResult } from '../utils/types';
import { extractCUITFromText } from '../validators/cuit';

export class PDFExtractor {
  /**
   * Extrae texto de un PDF digital
   * @param filePath - Ruta al archivo PDF
   * @returns Texto extraído
   */
  async extractText(filePath: string): Promise<string> {
    try {
      const dataBuffer = readFileSync(filePath);
      const data = await pdf(dataBuffer);
      return data.text;
    } catch (error) {
      console.error('Error al extraer texto de PDF:', error);
      throw new Error(`No se pudo extraer texto del PDF: ${filePath}`);
    }
  }

  /**
   * Extrae información de factura de un PDF
   * @param filePath - Ruta al archivo PDF
   * @returns Resultado de extracción
   */
  async extract(filePath: string): Promise<ExtractionResult> {
    const text = await this.extractText(filePath);

    // Extraer CUIT
    const cuits = extractCUITFromText(text);
    const cuit = cuits[0] || undefined;

    // Extraer fecha (patrones comunes)
    const datePatterns = [
      /Fecha[:\s]*(\d{2}[/-]\d{2}[/-]\d{4})/i,
      /Emisión[:\s]*(\d{2}[/-]\d{2}[/-]\d{4})/i,
      /(\d{2}[/-]\d{2}[/-]\d{4})/,
    ];

    let date: string | undefined;
    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        date = match[1];
        break;
      }
    }

    // Extraer total (patrones comunes)
    const totalPatterns = [
      /Total[:\s]*\$?\s*([\d,.]+)/i,
      /Importe Total[:\s]*\$?\s*([\d,.]+)/i,
      /TOTAL[:\s]*\$?\s*([\d,.]+)/,
    ];

    let total: string | undefined;
    for (const pattern of totalPatterns) {
      const match = text.match(pattern);
      if (match) {
        total = match[1];
        break;
      }
    }

    // Extraer número de comprobante
    const invoicePattern = /([A-C])\s*-?\s*(\d{4})\s*-?\s*(\d{8})/;
    const invoiceMatch = text.match(invoicePattern);

    let invoiceType: 'A' | 'B' | 'C' | undefined;
    let pointOfSale: number | undefined;
    let invoiceNumber: number | undefined;

    if (invoiceMatch) {
      invoiceType = invoiceMatch[1] as 'A' | 'B' | 'C';
      pointOfSale = parseInt(invoiceMatch[2]!, 10);
      invoiceNumber = parseInt(invoiceMatch[3]!, 10);
    }

    // Calcular confianza basada en campos extraídos
    const fieldsExtracted = [cuit, date, total, invoiceType].filter(Boolean).length;
    const confidence = (fieldsExtracted / 4) * 100;

    return {
      success: confidence > 50,
      confidence,
      data: {
        cuit,
        date,
        total: total ? parseFloat(total.replace(/,/g, '')) : undefined,
        invoiceType,
        pointOfSale,
        invoiceNumber,
      },
      method: 'GENERICO',
    };
  }
}
