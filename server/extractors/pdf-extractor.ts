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

    // Extraer fecha (patrones comunes argentinos)
    const datePatterns = [
      /FECHA:\s*[\r\n]+[^\d]*(\d{2}[/-]\d{2}[/-]\d{4})/i, // FECHA: seguida de fecha
      /(\d{2}[/-]\d{2}[/-]\d{4})\s*[\r\n]+\s*\d{12,13}\b/, // Fecha justo antes del número de 12-13 dígitos
      /Fecha[:\s]+(\d{2}[/-]\d{2}[/-]\d{4})/i,
      /Emisión[:\s]+(\d{2}[/-]\d{2}[/-]\d{4})/i,
    ];

    let date: string | undefined;
    for (const pattern of datePatterns) {
      const matches = Array.from(text.matchAll(new RegExp(pattern, 'gi')));
      for (const match of matches) {
        const extractedDate = match[1] || match[0];
        // Evitar fechas de "Inicio de Actividades"
        const context = text.substring(
          Math.max(0, (match.index || 0) - 50),
          (match.index || 0) + 80
        );
        if (
          !context.toLowerCase().includes('inicio') &&
          !context.toLowerCase().includes('actividad')
        ) {
          date = extractedDate;
          break;
        }
      }
      if (date) break;
    }

    // Extraer total (patrones argentinos con punto para miles y coma para decimales)
    const totalPatterns = [
      /([\d.]+,\d{2})\s*[\d,.]+\s*[\d.]+,\d{2}\s*[\r\n]+\s*PERCEPCIONES/i, // Total antes de PERCEPCIONES (primero de 3 números)
      /Observaciones:\s*[\r\n]+\s*([\d.]+,\d{2})/i, // Total después de Observaciones
      /TOTAL\s+([\d.]+,\d{2})\s*[\r\n]/i, // TOTAL seguido directamente del total
      /Total[:\s]+\$?\s*([\d.]+,\d{2})/i,
      /Importe Total[:\s]+\$?\s*([\d.]+,\d{2})/i,
    ];

    let total: string | undefined;
    for (const pattern of totalPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        total = match[1];
        // Verificar que el total sea razonable (más de 100)
        const testValue = parseFloat(match[1].replace(/\./g, '').replace(/,/, '.'));
        if (testValue > 100) {
          break;
        }
      }
    }

    // Extraer tipo de comprobante (A, B, C)
    let invoiceType: 'A' | 'B' | 'C' | undefined;
    const typePatterns = [
      /CODIGO:\s*[\r\n]+\s*-?\s*[\r\n]+\s*([A-C])\s*[\r\n]/i, // CODIGO: seguido de letra en otra línea
      /Factura\s+([A-C])\s/i,
      /Tipo\s+([A-C])\s/i,
      /\b([A-C])\s+-?\s+\d{4,5}\s*-?\s*\d{8}/, // Letra seguida de números
    ];

    for (const pattern of typePatterns) {
      const match = text.match(pattern);
      if (match) {
        invoiceType = match[1] as 'A' | 'B' | 'C';
        break;
      }
    }

    // Extraer número de comprobante (soporta múltiples formatos)
    let pointOfSale: number | undefined;
    let invoiceNumber: number | undefined;

    const invoicePatterns = [
      // Con letra y guión: A-00001-00000001 o A-0001-00000001
      /([A-C])\s*-\s*(\d{4,5})\s*-\s*(\d{8})/,
      // Con letra sin guión: A0000100000001 (letra + 4 o 5 + 8 dígitos)
      /([A-C])(\d{4,5})(\d{8})/,
      // Sin letra, solo dígitos después de "NUMERO:" - formato 13 dígitos (5+8)
      /NUMERO:\s*[\r\n]+.*?(\d{5})(\d{8})/is,
      // Sin letra, solo dígitos después de "NUMERO:" - formato 12 dígitos (4+8)
      /NUMERO:\s*[\r\n]+.*?(\d{4})(\d{8})/is,
      // Formato con guión sin letra: 00001-00000001
      /\b(\d{4,5})\s*-\s*(\d{8})\b/,
      // 13 dígitos juntos: 0000100000001
      /\b(\d{5})(\d{8})\b/,
      // 12 dígitos juntos: 000100000001
      /\b(\d{4})(\d{8})\b/,
    ];

    for (const pattern of invoicePatterns) {
      const match = text.match(pattern);
      if (match) {
        // Si el patrón captura 3 grupos (letra, pto venta, número)
        if (match.length === 4 && /[A-C]/.test(match[1]!)) {
          if (!invoiceType) {
            invoiceType = match[1] as 'A' | 'B' | 'C';
          }
          pointOfSale = parseInt(match[2]!, 10);
          invoiceNumber = parseInt(match[3]!, 10);
          break;
        }
        // Si el patrón captura 2 grupos (pto venta, número)
        else if (match.length >= 3) {
          const lastIdx = match.length - 1;
          pointOfSale = parseInt(match[lastIdx - 1]!, 10);
          invoiceNumber = parseInt(match[lastIdx]!, 10);
          break;
        }
      }
    }

    // Calcular confianza basada en campos extraídos
    // 5 campos obligatorios: CUIT, fecha, tipo, punto de venta, número
    // Total es opcional pero suma si está
    const requiredFields = [cuit, date, invoiceType, pointOfSale, invoiceNumber];
    const requiredCount = requiredFields.filter((f) => f !== undefined && f !== null && f !== '').length;
    const hasTotal = total !== undefined && total !== '';
    // Confianza: 100% = 5 campos requeridos + total
    // Sin total, máximo 90%
    const baseConfidence = (requiredCount / 5) * (hasTotal ? 100 : 90);
    const confidence = Math.round(baseConfidence);

    // Parsear total (formato argentino: punto para miles, coma para decimales)
    let parsedTotal: number | undefined;
    if (total) {
      // Convertir formato argentino (144.615,00) a formato JS (144615.00)
      const normalized = total.replace(/\./g, '').replace(/,/, '.');
      parsedTotal = parseFloat(normalized);
    }

    return {
      success: confidence > 50,
      confidence,
      data: {
        cuit,
        date,
        total: parsedTotal,
        invoiceType,
        pointOfSale,
        invoiceNumber,
      },
      method: 'GENERICO',
    };
  }
}
