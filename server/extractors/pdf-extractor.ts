/**
 * Extractor de texto de PDFs digitales
 */

import pdf from 'pdf-parse';
import { readFileSync } from 'fs';
import type { ExtractionResult, InvoiceType, DocumentKind } from '../utils/types';
import { extractCUITsWithContext } from '../validators/cuit';
import { extractInvoiceTypeWithAFIP } from '../utils/afip-codes';

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

    // Debug: mostrar primeros caracteres del texto extraído
    console.info(`   📝 Texto extraído (${text.length} chars)`);
    if (text.length < 500) {
      console.info(`   📝 Contenido: ${text.substring(0, 500)}`);
    }

    // Extraer CUIT del EMISOR usando scoring inteligente
    let cuit: string | undefined;

    // Usar scoring inteligente basado en contexto
    const cuitsWithContext = extractCUITsWithContext(text);

    if (cuitsWithContext.length > 0) {
      // Tomar el CUIT con mayor score
      const bestMatch = cuitsWithContext[0];
      cuit = bestMatch.cuit;

      console.info(`   💼 CUIT emisor detectado (score: ${bestMatch.score}): ${cuit}`);

      // Mostrar top 3 candidatos si hay múltiples
      if (cuitsWithContext.length > 1) {
        console.info(`   📊 Top ${Math.min(3, cuitsWithContext.length)} candidatos:`);
        cuitsWithContext.slice(0, 3).forEach((c, i) => {
          const preview =
            c.contextBefore.slice(-30) + '►' + c.cuit + '◄' + c.contextAfter.slice(0, 30);
          console.info(
            `      ${i + 1}. ${c.cuit} (score: ${c.score}) - "${preview.replace(/\s+/g, ' ')}"`
          );
        });
      }
    }

    // Debug: si no hay CUIT, mostrar info útil
    if (!cuit) {
      const possibleCuits = text.match(/\b\d{2}[-\s]?\d{8}[-\s]?\d\b/g);
      if (possibleCuits && possibleCuits.length > 0) {
        console.info(
          `   🔍 Posibles CUITs encontrados (sin validar): ${possibleCuits.slice(0, 3).join(', ')}`
        );
      }
    }

    /**
     * Convierte fechas en formato español a DD/MM/YYYY
     * Ej: "24 de Octubre de 2025" -> "24/10/2025"
     */
    const parseSpanishDate = (dateText: string): string | null => {
      const months: Record<string, string> = {
        enero: '01',
        febrero: '02',
        marzo: '03',
        abril: '04',
        mayo: '05',
        junio: '06',
        julio: '07',
        agosto: '08',
        septiembre: '09',
        octubre: '10',
        noviembre: '11',
        diciembre: '12',
      };

      // "24 de Octubre de 2025" o "24 Octubre 2025"
      const match = dateText.match(/(\d{1,2})\s+(?:de\s+)?([a-záéíóú]+)\s+(?:de\s+)?(\d{4})/i);
      if (match) {
        const day = match[1].padStart(2, '0');
        const monthName = match[2].toLowerCase();
        const year = match[3];
        const month = months[monthName];

        if (month) {
          return `${day}/${month}/${year}`;
        }
      }
      return null;
    };

    /**
     * Parsea una fecha DD/MM/YYYY a Date para comparación
     */
    const parseDateToObject = (dateStr: string): Date | null => {
      const parts = dateStr.split(/[/-]/);
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day);
      }
      return null;
    };

    // Extraer fecha (patrones comunes argentinos)
    // Estrategia: buscar TODAS las fechas y elegir con sistema de scoring (priorizar "emisión")

    // 1. Patrón específico para "Fecha de Emisión:" (puede estar en línea separada)
    const emissionDatePattern =
      /Fecha\s+de\s+Emisi[oó]n:\s*[\r\n]+[^\d]*(\d{2}[/-]\d{2}[/-]\d{4})/gi;
    const emissionMatches = Array.from(text.matchAll(emissionDatePattern));

    const allDates: Array<{
      date: string;
      source: string;
      timestamp: number;
      context: string;
      score: number;
    }> = [];

    // Procesar fechas de emisión con mayor prioridad
    for (const match of emissionMatches) {
      const dateStr = match[1].replace(/-/g, '/');
      const dateObj = parseDateToObject(dateStr);
      if (dateObj) {
        allDates.push({
          date: dateStr,
          source: match[0],
          timestamp: dateObj.getTime(),
          context: 'Fecha de Emisión',
          score: 100, // Máxima prioridad
        });
      }
    }

    // 2. Buscar fechas en formato español
    const spanishDatePattern = /(\d{1,2})\s+(?:de\s+)?([a-záéíóú]+)\s+(?:de\s+)?(\d{4})/gi;
    const spanishMatches = Array.from(text.matchAll(spanishDatePattern));

    for (const match of spanishMatches) {
      const parsed = parseSpanishDate(match[0]);
      if (parsed) {
        const dateObj = parseDateToObject(parsed);
        if (dateObj && !allDates.some((d) => d.date === parsed)) {
          // Obtener contexto para scoring
          const context = text.substring(
            Math.max(0, (match.index || 0) - 70),
            (match.index || 0) + 100
          );

          // Filtrar fechas no deseadas
          const contextLower = context.toLowerCase();
          if (
            contextLower.includes('inicio') ||
            contextLower.includes('actividad') ||
            contextLower.includes('vto') ||
            contextLower.includes('vencimiento') ||
            contextLower.includes('cae') ||
            contextLower.includes('período')
          ) {
            continue; // Skip this date
          }

          allDates.push({
            date: parsed,
            source: match[0],
            timestamp: dateObj.getTime(),
            context,
            score: 50, // Prioridad media para fechas en español
          });
        }
      }
    }

    // 3. Buscar fechas numéricas DD/MM/YYYY y DD/MM/YY
    const datePatterns = [
      /Emisi[oó]n[:\s]+(\d{2}\s*[/-]\s*\d{2}\s*[/-]\s*\d{2,4})/gi, // Emisión (alta prioridad)
      /FECHA[:\s]+(\d{2}\s*[/-]\s*\d{2}\s*[/-]\s*\d{2,4})/gi, // FECHA (alta prioridad)
      /(\d{2}\s*[/-]\s*\d{2}\s*[/-]\s*\d{2,4})\s*[\r\n]+\s*\d{12,13}\b/g, // Fecha antes de número largo
      /(\d{2}\s*[/-]\s*\d{2}\s*[/-]\s*\d{2,4})/g, // Todas las fechas (con/sin espacios)
    ];

    for (const pattern of datePatterns) {
      const matches = Array.from(text.matchAll(pattern));
      for (const match of matches) {
        const extractedDate = match[1] || match[0];
        // Normalizar: remover espacios y usar solo /
        let normalizedDate = extractedDate.replace(/\s+/g, '').replace(/-/g, '/');

        // Convertir año de 2 dígitos a 4 dígitos (YY → YYYY)
        const parts = normalizedDate.split('/');
        if (parts.length === 3 && parts[2].length === 2) {
          const yearShort = parseInt(parts[2], 10);
          // Asumimos que años 00-49 son 2000-2049, 50-99 son 1950-1999
          const yearFull = yearShort <= 49 ? 2000 + yearShort : 1900 + yearShort;
          normalizedDate = `${parts[0]}/${parts[1]}/${yearFull}`;
        }

        const dateObj = parseDateToObject(normalizedDate);
        if (!dateObj || allDates.some((d) => d.date === normalizedDate)) {
          continue;
        }

        // Obtener contexto ampliado para scoring (150 chars antes y después)
        const context = text.substring(
          Math.max(0, (match.index || 0) - 150),
          Math.min(text.length, (match.index || 0) + 150)
        );
        const contextLower = context.toLowerCase();

        // Calcular score basado en contexto
        let score = 30; // Score base

        // Contexto cercano (70 chars antes) para detección precisa
        const contextBefore = context.slice(0, Math.min(150, context.length / 2)).toLowerCase();
        const contextBeforeClose = contextBefore.slice(-70); // Últimos 70 chars antes de la fecha

        // PATRONES ESPECÍFICOS DE ALTA PRIORIDAD (±200 puntos)

        // Detectar "Fecha Vencimiento CAE" o "Fecha de Vencimiento" antes de la fecha
        if (
          /fecha\s*(de\s*)?(vencimiento|vto)/i.test(contextBeforeClose) ||
          /vencimiento\s*cae/i.test(contextBeforeClose) ||
          /fecha\s*vto/i.test(contextBeforeClose)
        ) {
          score -= 200; // Penalización FUERTE para fechas de vencimiento
        }

        // Detectar "Fecha de Emisión" o "Fecha Emisión" antes de la fecha
        if (/fecha\s*(de\s*)?emisi[oó]n/i.test(contextBeforeClose)) {
          score += 200; // Bonus DEFINITIVO para fecha de emisión explícita
        }

        // Detectar solo "Emisión:" antes de la fecha
        if (/emisi[oó]n\s*:/i.test(contextBeforeClose)) {
          score += 150; // Muy probable fecha de emisión
        }

        // Detectar "Fecha:" (sin vencimiento) antes de la fecha
        if (/(?:^|[^a-z])fecha\s*:/i.test(contextBeforeClose)) {
          // Verificar que NO tenga "vencimiento" o "vto" cerca
          if (!/vencimiento|vto/i.test(contextBeforeClose)) {
            score += 120; // Bonus alto para "Fecha:" genérica
          }
        }

        // BONIFICACIONES MODERADAS (10-50 puntos)

        if (contextLower.includes('emisi')) score += 60; // "Emisión" en el contexto general
        if (contextLower.includes('razon social') || contextLower.includes('razón social'))
          score += 40;
        if (contextLower.includes('factura')) score += 30;
        if (contextLower.includes('comprobante')) score += 25;

        // PENALIZACIONES MODERADAS (-50 a -100 puntos)
        // IMPORTANTE: No penalizar demasiado para evitar que TODAS las fechas sean filtradas

        // CAE + fecha = probable vencimiento CAE
        if (contextLower.includes('cae') && !contextLower.includes('emisi')) {
          score -= 80; // Reducido de -120 para evitar sobre-filtrado
        }

        // Otras palabras clave que indican NO es fecha de emisión
        if (contextLower.includes('vencimiento') && !contextLower.includes('fecha de emisi'))
          score -= 70; // Reducido de -100
        if (contextLower.includes('vto') && !contextLower.includes('fecha de emisi')) score -= 70; // Reducido de -100
        if (contextLower.includes('período') || contextLower.includes('periodo')) score -= 60; // Reducido de -80
        if (contextLower.includes('desde') || contextLower.includes('hasta')) score -= 50; // Reducido de -70
        if (contextLower.includes('inicio actividad')) score -= 100; // Reducido de -150

        // NUEVAS HEURÍSTICAS MEJORADAS:

        // Penalizar fechas muy antiguas (probablemente inicio de actividades)
        const now = new Date();
        const yearsDiff = (now.getTime() - dateObj.getTime()) / (1000 * 60 * 60 * 24 * 365);
        if (yearsDiff > 3)
          score -= 100; // Más de 3 años atrás
        else if (yearsDiff > 2) score -= 50; // Más de 2 años atrás

        // Detectar patrón típico de inicio de actividades: IIBB + Fecha + CUIT
        // Buscar números de 10-13 dígitos antes de la fecha (IIBB)
        if (/\d{10,13}\s*[\r\n]+\s*$/.test(context.slice(0, 150))) {
          score -= 80; // Probablemente es inicio de actividades
        }

        // Bonus si aparece cerca de número de factura (ej: "Nº 00128")
        if (/n[°ºo]?\s*\d{4,8}/i.test(contextLower)) {
          score += 40;
        }

        // Bonus si la fecha se repite en el texto (señal de importancia)
        const datePattern = normalizedDate.replace(/\//g, '\\/');
        const occurrences = (text.match(new RegExp(datePattern, 'g')) || []).length;
        if (occurrences > 1) score += (occurrences - 1) * 20; // +20 por cada repetición adicional

        // Solo agregar si el score no es extremadamente negativo
        // Umbral reducido para evitar filtrar todas las fechas
        if (score < -150) {
          continue; // Skip this date solo si es MUY negativo
        }

        allDates.push({
          date: normalizedDate,
          source: extractedDate,
          timestamp: dateObj.getTime(),
          context,
          score,
        });
      }
    }

    // 4. Elegir fecha con mejor score (priorizar emisión sobre más reciente)
    let date: string | undefined;
    if (allDates.length > 0) {
      // Ordenar por score (mayor primero), luego por timestamp (más reciente)
      allDates.sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return b.timestamp - a.timestamp;
      });

      date = allDates[0].date;

      if (allDates.length > 1) {
        console.info(
          `   📅 Múltiples fechas encontradas (${allDates.length}), usando mejor match (score: ${allDates[0].score}): ${date}`
        );
        console.info(
          `      Otras: ${allDates
            .slice(1, 3)
            .map((d) => `${d.date} (score: ${d.score})`)
            .join(', ')}`
        );
      }
    }

    // Extraer total (patrones argentinos con punto para miles y coma para decimales)
    const totalPatterns = [
      /([\d.]+,\d{2})\s*[\d,.]+\s*[\d.]+,\d{2}\s*[\r\n]+\s*PERCEPCIONES/i, // Total antes de PERCEPCIONES (primero de 3 números)
      /Observaciones:\s*[\r\n]+\s*([\d.]+,\d{2})/i, // Total después de Observaciones
      // Texto pegado: "TOTAL1.965.244,64"
      /TOTAL\s*([\d.]+,\d{2})/i,
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

    // Extraer tipo de comprobante (A, B, C, E, M, X) y tipo de documento (FAC, NCR, NDB)
    // Usa el mapeo de códigos AFIP para mayor precisión (ej: "11 - Factura C" → código 11 = FAC C)
    let invoiceType: InvoiceType | undefined;
    let documentKind: DocumentKind = 'FAC'; // Por defecto es factura

    const afipResult = extractInvoiceTypeWithAFIP(text);
    if (afipResult) {
      invoiceType = afipResult.invoiceType;
      documentKind = afipResult.documentKind;
      console.info(
        `   📋 Tipo detectado: ${documentKind} ${invoiceType} (método: ${afipResult.method})`
      );
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
    const requiredCount = requiredFields.filter(
      (f) => f !== undefined && f !== null && f !== ''
    ).length;
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
        documentKind,
        pointOfSale,
        invoiceNumber,
      },
      method: 'PDF_TEXT',
    };
  }
}
