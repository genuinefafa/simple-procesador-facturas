/**
 * Extractor OCR para imágenes y PDFs escaneados
 *
 * Utiliza Tesseract.js para reconocimiento óptico de caracteres
 * y Sharp para preprocesamiento de imágenes.
 *
 * Soporta: JPG, PNG, TIFF, WEBP, HEIC (via Sharp)
 */

import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import { existsSync, readFileSync } from 'fs';
import { extname, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { ExtractionResult, DocumentKind } from '@shared/types';
import { extractCUITsWithContext } from '@shared/validators/cuit';
import { extractInvoiceTypeWithAFIP, convertLetterToARCACode } from '../utils/afip-codes';
import { pdf } from 'pdf-to-img';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - no type definitions available for heic-convert
import convert from 'heic-convert';

/**
 * Convierte fecha de formato DD/MM/YYYY a ISO (YYYY-MM-DD)
 * @param ddmmyyyy - Fecha en formato DD/MM/YYYY (ej: "23/10/2025")
 * @returns Fecha en formato ISO (ej: "2025-10-23")
 */
function formatToISO(ddmmyyyy: string): string {
  const parts = ddmmyyyy.split('/');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return ddmmyyyy;
  const [day, month, year] = parts;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

// Rutas para Tesseract.js
// En Docker: /app/tessdata/spa.traineddata (descargado durante build)
// En desarrollo local: si no existe, Tesseract descarga del CDN automáticamente
const __fileDir = dirname(fileURLToPath(import.meta.url));
const TESSDATA_PATH = join(__fileDir, '../../tessdata');
const HAS_LOCAL_TESSDATA = existsSync(join(TESSDATA_PATH, 'spa.traineddata'));

// Cuando tesseract.js se bundlea con Vite, el __dirname interno queda incorrecto.
// Se pasa la ruta absoluta explícita para que el worker thread arranque correctamente.
const TESSERACT_WORKER_PATH = join(
  __fileDir,
  '../../node_modules/tesseract.js/src/worker-script/node/index.js'
);
const HAS_TESSERACT_WORKER = existsSync(TESSERACT_WORKER_PATH);

// Configuración de OCR
const OCR_CONFIG = {
  language: 'spa', // Español (facturas argentinas)
  oem: Tesseract.OEM.LSTM_ONLY, // Motor LSTM (más preciso)
  psm: Tesseract.PSM.AUTO, // Detección automática de layout
};

// Extensiones de imagen soportadas
const SUPPORTED_IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.tif',
  '.tiff',
  '.webp',
  '.heic',
  '.heif',
];

export class OCRExtractor {
  private worker: Tesseract.Worker | null = null;

  /**
   * Verifica si un archivo es una imagen soportada
   */
  static isImageFile(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase();
    return SUPPORTED_IMAGE_EXTENSIONS.includes(ext);
  }

  /**
   * Convierte HEIC/HEIF a JPEG
   * Sharp necesita libheif instalado para leer HEIC, que no siempre está disponible.
   * Esta función convierte HEIC a JPEG primero usando heic-convert.
   */
  private async convertHeicToJpeg(filePath: string): Promise<Buffer> {
    try {
      console.info(`   🔄 Convirtiendo HEIC a JPEG...`);
      const inputBuffer = readFileSync(filePath);

      // heic-convert no tiene tipos TypeScript, usamos type assertion
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const outputBuffer = (await convert({
        buffer: inputBuffer,
        format: 'JPEG',
        quality: 1, // Máxima calidad para OCR
      })) as ArrayBuffer;

      console.info(`   ✅ HEIC convertido a JPEG (${outputBuffer.byteLength} bytes)`);
      return Buffer.from(outputBuffer);
    } catch (error) {
      console.error(`   ❌ Error convirtiendo HEIC:`, error);
      throw new Error(
        `No se pudo convertir HEIC a JPEG: ${error instanceof Error ? error.message : 'Error desconocido'}`
      );
    }
  }

  /**
   * Preprocesa una imagen para mejorar el OCR
   * - Convierte a escala de grises
   * - Normaliza contraste
   * - Aplica threshold para binarizar
   * - Redimensiona si es muy pequeña
   */
  private async preprocessImage(filePath: string): Promise<Buffer> {
    const ext = extname(filePath).toLowerCase();

    // Si es HEIC/HEIF, convertir a JPEG primero
    let imageSource: string | Buffer = filePath;
    if (ext === '.heic' || ext === '.heif') {
      imageSource = await this.convertHeicToJpeg(filePath);
    }

    // Leer imagen con Sharp
    let image = sharp(imageSource);

    // Obtener metadata para verificar tamaño
    const metadata = await image.metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    console.info(`   📐 Dimensiones originales: ${width}x${height}`);

    // Si la imagen es muy pequeña, escalar para mejor OCR
    if (width < 1000 || height < 1000) {
      const scale = Math.max(1000 / width, 1000 / height);
      if (scale > 1) {
        image = image.resize({
          width: Math.round(width * scale),
          height: Math.round(height * scale),
          fit: 'inside',
        });
        console.info(`   🔍 Escalando imagen ${scale.toFixed(1)}x para mejor OCR`);
      }
    }

    // Pipeline de preprocesamiento
    const processedBuffer = await image
      .grayscale() // Convertir a escala de grises
      .normalize() // Normalizar histograma (mejorar contraste)
      .sharpen({ sigma: 1.5 }) // Enfocar ligeramente
      .png() // Convertir a PNG para Tesseract
      .toBuffer();

    // Para imágenes con bajo contraste, aplicar threshold
    // Si detectamos que la imagen podría beneficiarse de binarización
    // (esto es heurístico, se puede ajustar)
    if (ext === '.tif' || ext === '.tiff') {
      // TIFFs escaneados suelen beneficiarse de binarización
      return sharp(processedBuffer)
        .threshold(180) // Binarizar con threshold adaptativo
        .png()
        .toBuffer();
    }

    return processedBuffer;
  }

  /**
   * Convierte PDF a imagen para OCR (primera página)
   *
   * Usa pdf-to-img que no requiere dependencias del sistema.
   * Funciona en cualquier plataforma (Linux, macOS, Windows).
   *
   * @param filePath - Ruta al archivo PDF
   * @returns Buffer de la primera página como PNG, o null si falla
   */
  private async pdfToImage(filePath: string): Promise<Buffer | null> {
    try {
      console.info(`   🔄 Convirtiendo PDF a imagen...`);

      // Leer el PDF como buffer
      const pdfBuffer = readFileSync(filePath);

      // Convertir PDF a imágenes (array de páginas)
      const document = await pdf(pdfBuffer, { scale: 2.0 }); // scale 2.0 = mejor resolución para OCR

      // Obtener solo la primera página
      let pageCount = 0;
      for await (const page of document) {
        pageCount++;
        console.info(`   📄 Página 1 convertida (${page.length} bytes)`);
        return page; // Retornar solo la primera página
      }

      if (pageCount === 0) {
        console.warn(`   ⚠️  PDF vacío o sin páginas`);
        return null;
      }

      return null;
    } catch (error) {
      console.error(`   ❌ Error convirtiendo PDF a imagen:`, error);
      return null;
    }
  }

  /**
   * Extrae texto de una imagen usando Tesseract OCR
   * @param filePath - Ruta al archivo de imagen
   * @returns Texto extraído
   */
  async extractText(filePath: string): Promise<string> {
    if (!existsSync(filePath)) {
      throw new Error(`Archivo no encontrado: ${filePath}`);
    }

    const ext = extname(filePath).toLowerCase();
    console.info(`   🔍 Iniciando OCR para archivo: ${filePath}`);
    console.info(`   📄 Extensión detectada: ${ext}`);

    let imageBuffer: Buffer;

    // Si es PDF, necesitamos convertirlo a imagen primero
    if (ext === '.pdf') {
      const pdfImage = await this.pdfToImage(filePath);
      if (!pdfImage) {
        throw new Error('No se pudo convertir PDF a imagen para OCR');
      }
      imageBuffer = pdfImage;
    } else if (SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) {
      // Preprocesar imagen para mejorar OCR
      console.info(`   🎨 Preprocesando imagen...`);
      imageBuffer = await this.preprocessImage(filePath);
    } else {
      throw new Error(`Formato de archivo no soportado para OCR: ${ext}`);
    }

    // Ejecutar OCR con Tesseract
    console.info(`   🔠 Ejecutando Tesseract OCR (idioma: ${OCR_CONFIG.language})...`);

    try {
      const tesseractOptions: Parameters<typeof Tesseract.recognize>[2] = {
        logger: (info) => {
          if (info.status === 'recognizing text') {
            // Solo mostrar progreso cada 25%
            const progress = Math.round((info.progress || 0) * 100);
            if (progress % 25 === 0) {
              console.info(`   📊 Progreso OCR: ${progress}%`);
            }
          }
        },
      };

      if (HAS_LOCAL_TESSDATA) {
        tesseractOptions.langPath = TESSDATA_PATH;
        tesseractOptions.cachePath = TESSDATA_PATH;
        tesseractOptions.gzip = false;
        console.info(`   📂 Usando tessdata local: ${TESSDATA_PATH}`);
      }

      if (HAS_TESSERACT_WORKER) {
        tesseractOptions.workerPath = TESSERACT_WORKER_PATH;
      }

      const result = await Tesseract.recognize(imageBuffer, OCR_CONFIG.language, tesseractOptions);

      const text = result.data.text;
      const confidence = result.data.confidence;

      console.info(`   ✅ OCR completado - Confianza Tesseract: ${confidence.toFixed(1)}%`);
      console.info(`   📝 Caracteres extraídos: ${text.length}`);

      return text;
    } catch (error) {
      console.error(`   ❌ Error en OCR:`, error);
      throw new Error(
        `Error ejecutando OCR: ${error instanceof Error ? error.message : 'Error desconocido'}`
      );
    }
  }

  /**
   * Extrae información de factura de una imagen usando OCR
   * Aplica los mismos patrones regex que PDFExtractor
   * @param filePath - Ruta al archivo de imagen
   * @returns Resultado de extracción
   */
  async extract(filePath: string): Promise<ExtractionResult> {
    try {
      // 1. Extraer texto con OCR
      const text = await this.extractText(filePath);

      // Mostrar preview del texto extraído
      const preview = text.trim().substring(0, 300);
      console.info(
        `   📝 Texto OCR (primeros 300 chars): "${preview}${text.length > 300 ? '...' : ''}"`
      );

      if (!text || text.trim().length < 50) {
        return {
          success: false,
          confidence: 0,
          data: {},
          errors: ['OCR no pudo extraer texto suficiente de la imagen'],
          method: 'OCR',
        };
      }

      // 2. Aplicar patrones regex (mismos que PDFExtractor)

      // Extraer CUIT del EMISOR (no del receptor)
      // Extraer CUIT del EMISOR usando scoring inteligente
      let cuit: string | undefined;

      // Usar scoring inteligente basado en contexto
      const cuitsWithContext = extractCUITsWithContext(text);

      if (cuitsWithContext.length > 0) {
        // Tomar el CUIT con mayor score
        const bestMatch = cuitsWithContext[0]!;
        cuit = bestMatch.cuit;

        console.info(`   💼 CUIT emisor detectado (score: ${bestMatch.score}): ${cuit}`);

        // Mostrar top 3 candidatos si hay múltiples
        if (cuitsWithContext.length > 1) {
          console.info(`   📊 Top ${Math.min(3, cuitsWithContext.length)} candidatos:`);
          cuitsWithContext.slice(0, 3).forEach((c, i: number) => {
            const preview =
              c.contextBefore.slice(-30) + '►' + c.cuit + '◄' + c.contextAfter.slice(0, 30);
            console.info(
              `      ${i + 1}. ${c.cuit} (score: ${c.score}) - "${preview.replace(/\s+/g, ' ')}"`
            );
          });
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
          const day = match[1]!.padStart(2, '0');
          const monthName = match[2]!.toLowerCase();
          const year = match[3]!;
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
          const day = parseInt(parts[0]!, 10);
          const month = parseInt(parts[1]!, 10) - 1; // JS months are 0-indexed
          const year = parseInt(parts[2]!, 10);
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
        const dateStr = match[1]!.replace(/-/g, '/');
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
          if (parts.length === 3 && parts[2]!.length === 2) {
            const yearShort = parseInt(parts[2]!, 10);
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

          // Palabras clave que aumentan score
          if (contextLower.includes('emisi')) score += 70; // Emisión es clave
          if (contextLower.includes('fecha')) score += 60; // "Fecha" es muy relevante
          if (contextLower.includes('razon social') || contextLower.includes('razón social'))
            score += 40;
          if (contextLower.includes('factura')) score += 30;
          if (contextLower.includes('comprobante')) score += 25;

          // Palabras clave que reducen score (pero no eliminan)
          if (contextLower.includes('vto')) score -= 80;
          if (contextLower.includes('vencimiento')) score -= 80;
          if (contextLower.includes('cae')) score -= 80;
          if (contextLower.includes('período') || contextLower.includes('periodo')) score -= 70;
          if (contextLower.includes('desde') || contextLower.includes('hasta')) score -= 60;
          if (contextLower.includes('inicio actividad')) score -= 100;

          // Solo agregar si el score no es demasiado negativo
          if (score < -50) {
            continue; // Skip this date
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

        date = allDates[0]!.date;

        if (allDates.length > 1) {
          console.info(
            `   📅 Múltiples fechas encontradas (${allDates.length}), usando mejor match (score: ${allDates[0]!.score}): ${date}`
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
        /([\d.]+,\d{2})\s*[\d,.]+\s*[\d.]+,\d{2}\s*[\r\n]+\s*PERCEPCIONES/i,
        /Observaciones:\s*[\r\n]+\s*([\d.]+,\d{2})/i,
        // Texto pegado: "TOTAL1.965.244,64" (sin espacio)
        /TOTAL\s*([\d.]+,\d{2})/i,
        /Total[:\s]+\$?\s*([\d.]+,\d{2})/i,
        /Importe Total[:\s]+\$?\s*([\d.]+,\d{2})/i,
        /IMPORTE\s+TOTAL[:\s]*\$?\s*([\d.]+,\d{2})/i, // OCR mayúsculas
        /\$\s*([\d.]+,\d{2})/g, // Fallback: cualquier monto con $
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

      // Heurística inteligente: buscar último valor decimal grande cerca de palabra "total"
      if (!total) {
        console.info(`   🔍 Aplicando heurística para detectar total...`);

        // Buscar todas las líneas con valores decimales (formato argentino)
        const lines = text.split(/[\r\n]+/);
        const decimalValues: Array<{
          value: string;
          numValue: number;
          lineIndex: number;
          line: string;
        }> = [];

        lines.forEach((line, index) => {
          // Buscar valores con formato argentino: 1.234,56 o 234,56
          const matches = line.matchAll(/(?:^|[^\d])(\d{1,3}(?:\.\d{3})*,\d{2})(?:[^\d]|$)/g);
          for (const match of matches) {
            const value = match[1]!;
            const numValue = parseFloat(value.replace(/\./g, '').replace(/,/, '.'));

            // Solo considerar valores mayores a 100 (filtrar decimales pequeños)
            if (numValue > 100) {
              decimalValues.push({ value, numValue, lineIndex: index, line });
            }
          }
        });

        let bestCandidate: (typeof decimalValues)[0] | undefined;
        if (decimalValues.length > 0) {
          console.info(`   📊 Encontrados ${decimalValues.length} valores candidatos > 100`);

          // Buscar el mejor candidato usando heurísticas
          bestCandidate = decimalValues[0]!;
          let bestScore = 0;

          for (const candidate of decimalValues) {
            let score = 0;

            // +50 puntos: aparece en el último 30% del documento
            const relativePosition = candidate.lineIndex / lines.length;
            if (relativePosition > 0.7) {
              score += 50;
            }

            // +40 puntos: la línea contiene palabra similar a "total" (tolerante a OCR)
            const lineLower = candidate.line.toLowerCase();
            if (/tot[ao0]?l|t[o0]t[ao]l|imp[o0]rte/i.test(lineLower)) {
              score += 40;
              console.info(
                `   💰 "${candidate.value}" tiene palabra similar a TOTAL: "${candidate.line.trim()}"`
              );
            }

            // +30 puntos: es el valor más grande
            if (candidate.numValue === Math.max(...decimalValues.map((v) => v.numValue))) {
              score += 30;
            }

            // +10 puntos por cada 1000 pesos (valores grandes son más probables de ser total)
            score += Math.floor(candidate.numValue / 1000) * 10;

            if (score > bestScore) {
              bestScore = score;
              bestCandidate = candidate;
            }
          }

          total = bestCandidate.value;
          console.info(`   ✅ Total detectado con heurística (score: ${bestScore}): ${total}`);
          console.info(`      Línea: "${bestCandidate.line.trim()}"`);
        }
      }

      // Extraer tipo de comprobante (A, B, C, E, M) y tipo de documento (FAC, NCR, NDB)
      // Usa el mapeo de códigos AFIP para mayor precisión
      let invoiceType: string | undefined; // Temporal: letra que se convierte a código ARCA después
      let documentKind: DocumentKind = 'FAC'; // Por defecto es factura

      const afipResult = extractInvoiceTypeWithAFIP(text);
      if (afipResult) {
        invoiceType = afipResult.invoiceType;
        documentKind = afipResult.documentKind;
        console.info(
          `   📋 Tipo detectado (OCR): ${documentKind} ${invoiceType} (método: ${afipResult.method})`
        );
      }

      // Extraer número de comprobante
      let pointOfSale: number | undefined;
      let invoiceNumber: number | undefined;

      const invoicePatterns = [
        // Específicos para facturas argentinas (más restrictivos primero)
        // "NRO. COMPROBANTE:", "NRO.I,:", etc. seguido de 4-8 dígitos
        /NRO[.\s]*(?:COMPROBANTE|I|COMP)?[:\s,]*(\d{4,5})\s*[-–]\s*(\d{6,8})/i,
        /N[uúÚ]mero[:\s]*(?:de\s+)?(?:Comprobante)?[:\s]*(\d{4,5})\s*[-–]\s*(\d{6,8})/i,

        // Con letra y guión: A-00001-00000001
        /([A-C])\s*-\s*(\d{4,5})\s*-\s*(\d{8})/,
        // Con letra sin guión: A0000100000001
        /([A-C])(\d{4,5})(\d{8})/,
        // OCR puede insertar espacios: A - 00001 - 00000001
        /([A-C])\s*[-–]\s*(\d{4,5})\s*[-–]\s*(\d{6,8})/,

        // Sin letra después de "NUMERO:"
        /NUMERO:\s*[\r\n]+.*?(\d{5})(\d{8})/is,
        /NUMERO:\s*[\r\n]+.*?(\d{4})(\d{8})/is,
        /N[uú]mero[:\s]+(\d{4,5})[-–\s]+(\d{6,8})/i,

        // Formato con guión sin letra (más tolerante, sin word boundary estricto)
        /(\d{4,5})\s*[-–]\s*(\d{8})/,
        // Dígitos juntos
        /\b(\d{5})(\d{8})\b/,
        /\b(\d{4})(\d{8})\b/,
      ];

      for (const pattern of invoicePatterns) {
        const match = text.match(pattern);
        if (match) {
          if (match.length === 4 && /[A-C]/.test(match[1]!)) {
            if (!invoiceType) {
              invoiceType = match[1]; // Letra A, B o C
            }
            pointOfSale = parseInt(match[2]!, 10);
            invoiceNumber = parseInt(match[3]!, 10);
            break;
          } else if (match.length >= 3) {
            const lastIdx = match.length - 1;
            pointOfSale = parseInt(match[lastIdx - 1]!, 10);
            invoiceNumber = parseInt(match[lastIdx]!, 10);
            break;
          }
        }
      }

      // 3. Calcular confianza
      const requiredFields = [cuit, date, invoiceType, pointOfSale, invoiceNumber];
      const requiredCount = requiredFields.filter(
        (f) => f !== undefined && f !== null && f !== ''
      ).length;
      const hasTotal = total !== undefined && total !== '';

      // OCR tiene menos confianza base que PDF digital
      const baseConfidence = (requiredCount / 5) * (hasTotal ? 90 : 80);
      const confidence = Math.round(baseConfidence);

      // 4. Parsear total
      let parsedTotal: number | undefined;
      if (total) {
        const normalized = total.replace(/\./g, '').replace(/,/, '.');
        parsedTotal = parseFloat(normalized);
      }

      // 5. Preparar errores/warnings
      const errors: string[] = [];
      if (!cuit) errors.push('CUIT no detectado');
      if (!date) errors.push('Fecha no detectada');
      if (!invoiceType) errors.push('Tipo de comprobante no detectado');
      if (!pointOfSale) errors.push('Punto de venta no detectado');
      if (!invoiceNumber) errors.push('Número de factura no detectado');
      if (!total) errors.push('Total no detectado');

      // Convertir invoiceType de letra a código ARCA (TEMPORAL)
      // TODO: Eliminar cuando extractores lean códigos ARCA nativamente (Issue en M5)
      let invoiceTypeCode: number | null = null;
      if (typeof invoiceType === 'string') {
        invoiceTypeCode = convertLetterToARCACode(invoiceType);
      } else if (typeof invoiceType === 'number') {
        invoiceTypeCode = invoiceType;
      }

      return {
        success: confidence >= 50,
        confidence,
        data: {
          cuit,
          date: date ? formatToISO(date) : undefined,
          total: parsedTotal,
          invoiceType: invoiceTypeCode,
          documentKind,
          pointOfSale,
          invoiceNumber,
        },
        errors: errors.length > 0 ? errors : undefined,
        method: 'OCR',
      };
    } catch (error) {
      console.error(`   ❌ Error en extracción OCR:`, error);
      return {
        success: false,
        confidence: 0,
        data: {},
        errors: [error instanceof Error ? error.message : 'Error desconocido en OCR'],
        method: 'OCR',
      };
    }
  }

  /**
   * Limpia recursos (worker de Tesseract)
   */
  async cleanup(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}
