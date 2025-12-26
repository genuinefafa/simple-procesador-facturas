/**
 * Script para generar archivos YML baseline con los datos extraídos actualmente
 * Procesa todos los PDFs de examples/facturas/ y genera .yml al lado de cada uno
 */

import { PDFExtractor } from '../extractors/pdf-extractor.js';
import { OCRExtractor } from '../extractors/ocr-extractor.js';
import { generateYAMLFile, type InvoiceAnnotation } from '../utils/yaml-generator.js';
import { normalizeCUIT, validateCUIT, getPersonType } from '../validators/cuit.js';
import { readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import type { InvoiceType } from '../utils/types.js';

const EXAMPLES_DIR = join(process.cwd(), '..', 'examples', 'facturas');

async function generateBaselineYMLs() {
  console.log('🚀 Generando archivos YML baseline...\n');

  const pdfExtractor = new PDFExtractor();
  const ocrExtractor = new OCRExtractor();

  // Leer todos los PDFs en examples/facturas/
  const files = readdirSync(EXAMPLES_DIR).filter((f) => {
    const fullPath = join(EXAMPLES_DIR, f);
    return statSync(fullPath).isFile() && extname(f).toLowerCase() === '.pdf';
  });

  console.log(`📂 Encontrados ${files.length} archivos PDF\n`);

  let processedCount = 0;
  let errorCount = 0;

  for (const file of files) {
    const filePath = join(EXAMPLES_DIR, file);
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📄 Procesando: ${file}`);
    console.log(`${'='.repeat(80)}`);

    try {
      // 1. Detectar tipo de PDF (digital vs escaneado)
      let text = '';
      let extraction;
      let usedMethod = 'PDF_TEXT';

      try {
        text = await pdfExtractor.extractText(filePath);
        console.log(`   📝 Texto extraído: ${text.trim().length} caracteres`);
      } catch (error) {
        console.warn(`   ⚠️  Error extrayendo texto:`, error);
      }

      // 2. Intentar extracción con PDF
      if (text.trim().length > 100) {
        console.log(`   📄 Usando PDFExtractor (PDF digital)...`);
        extraction = await pdfExtractor.extract(filePath);
        usedMethod = 'PDF_TEXT';

        // Si la confianza es baja, intentar OCR también
        if (extraction.confidence < 50 || !extraction.data.cuit) {
          console.log(
            `   🔄 Confianza baja (${extraction.confidence}%) o CUIT no detectado, intentando OCR...`
          );
          try {
            const ocrExtraction = await ocrExtractor.extract(filePath);
            if (ocrExtraction.confidence > extraction.confidence) {
              console.log(`   ✅ OCR mejoró los resultados`);
              extraction = ocrExtraction;
              usedMethod = 'OCR';
            }
          } catch (ocrError) {
            console.warn(`   ⚠️  OCR falló:`, ocrError);
          }
        }
      } else {
        console.log(`   📷 Usando OCRExtractor (PDF escaneado o poco texto)...`);
        extraction = await ocrExtractor.extract(filePath);
        usedMethod = 'OCR';
      }

      console.log(`\n   📊 Método usado: ${usedMethod}`);
      console.log(`   📊 Confianza: ${extraction.confidence}%`);
      console.log(`   📊 Éxito: ${extraction.success}`);

      const data = extraction.data;

      // 3. Mostrar datos extraídos
      console.log(`\n   📋 Datos extraídos:`);
      console.log(`      CUIT: ${data.cuit || '❌ NO DETECTADO'}`);
      console.log(`      Fecha: ${data.date || '❌ NO DETECTADO'}`);
      console.log(`      Total: ${data.total !== undefined ? data.total : '❌ NO DETECTADO'}`);
      console.log(`      Tipo: ${data.invoiceType || '❌ NO DETECTADO'}`);
      console.log(
        `      Punto Venta: ${data.pointOfSale !== undefined ? data.pointOfSale : '❌ NO DETECTADO'}`
      );
      console.log(
        `      Número: ${data.invoiceNumber !== undefined ? data.invoiceNumber : '❌ NO DETECTADO'}`
      );

      // 4. Validar y normalizar CUIT
      let normalizedCuit = data.cuit || '';
      if (data.cuit && validateCUIT(data.cuit)) {
        normalizedCuit = normalizeCUIT(data.cuit);
        console.log(`   ✅ CUIT válido: ${normalizedCuit}`);
      } else {
        console.warn(`   ⚠️  CUIT inválido o no detectado: ${data.cuit || 'N/A'}`);
        // Usar un CUIT placeholder si no se detectó
        normalizedCuit = data.cuit || '00-00000000-0';
      }

      // 5. Parsear fecha
      let issueDate = new Date();
      if (data.date) {
        try {
          // Intentar parsear DD/MM/YYYY o DD-MM-YYYY
          if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(data.date)) {
            const [day, month, year] = data.date.split(/[/-]/);
            issueDate = new Date(parseInt(year!), parseInt(month!) - 1, parseInt(day!));
          } else {
            issueDate = new Date(data.date);
          }
          console.log(`   ✅ Fecha parseada: ${issueDate.toISOString().split('T')[0]}`);
        } catch (error) {
          console.warn(`   ⚠️  Error parseando fecha, usando fecha actual`);
        }
      }

      // 6. Crear anotación
      const annotation: InvoiceAnnotation = {
        emitter: {
          active: true,
          cuit: normalizedCuit,
          cuitNumeric: normalizedCuit.replace(/-/g, ''),
          name: `Emisor ${normalizedCuit}`,
          displayName: `Emisor ${normalizedCuit}`,
          aliases: [],
          personType: getPersonType(normalizedCuit) || undefined,
          createdAt: new Date(),
          updatedAt: new Date(),
          totalInvoices: 0,
        },
        invoiceType: (data.invoiceType || 'A') as InvoiceType,
        pointOfSale: data.pointOfSale ?? 0,
        invoiceNumber: data.invoiceNumber ?? 0,
        issueDate,
        total: data.total,
        extractionConfidence: extraction.confidence,
      };

      // 7. Generar archivo YML
      const ymlPath = generateYAMLFile(filePath, annotation);
      console.log(`   ✅ YML generado: ${ymlPath}`);

      processedCount++;
    } catch (error) {
      console.error(`   ❌ Error procesando ${file}:`);
      console.error(error);
      errorCount++;
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 Resumen:`);
  console.log(`   ✅ Procesados exitosamente: ${processedCount}`);
  console.log(`   ❌ Errores: ${errorCount}`);
  console.log(`   📝 Total archivos: ${files.length}`);
  console.log(`${'='.repeat(80)}\n`);
}

// Ejecutar
generateBaselineYMLs().catch((error) => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});
