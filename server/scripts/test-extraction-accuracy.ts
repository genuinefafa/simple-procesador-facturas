/**
 * Script para testear precisión de extracción SIN sobrescribir archivos YML
 * Procesa PDFs y compara con los datos correctos en YML
 */

import { PDFExtractor } from '../extractors/pdf-extractor.js';
import { OCRExtractor } from '../extractors/ocr-extractor.js';
import { readFileSync, readdirSync } from 'fs';
import { join, extname } from 'path';
import { parse as parseYAML } from 'yaml';

const EXAMPLES_DIR = join(process.cwd(), '..', 'examples', 'facturas');

interface YMLData {
  emisor: {
    cuit: string;
    nombre: string;
  };
  factura: {
    tipo: string;
    punto_venta: number;
    numero: number;
    fecha: string;
    total?: number;
  };
}

async function testExtractionAccuracy() {
  console.log('🧪 Test de Precisión de Extracción\n');
  console.log('='.repeat(100));

  const pdfExtractor = new PDFExtractor();
  const ocrExtractor = new OCRExtractor();

  const files = readdirSync(EXAMPLES_DIR)
    .filter((f) => extname(f).toLowerCase() === '.pdf')
    .sort();

  const results: {
    file: string;
    cuitMatch: boolean;
    fechaMatch: boolean;
    tipoMatch: boolean;
    pvMatch: boolean;
    numeroMatch: boolean;
    totalMatch: boolean;
    expected: YMLData;
    detected: any;
  }[] = [];

  for (const file of files) {
    const pdfPath = join(EXAMPLES_DIR, file);
    const ymlPath = pdfPath.replace('.pdf', '.yml');

    console.log(`\n${'='.repeat(100)}`);
    console.log(`📄 ${file}`);
    console.log(`${'='.repeat(100)}`);

    // Leer datos esperados del YML
    let expected: YMLData;
    try {
      const ymlContent = readFileSync(ymlPath, 'utf-8');
      expected = parseYAML(ymlContent) as YMLData;
    } catch (error) {
      console.error(`   ❌ Error leyendo YML: ${error}`);
      continue;
    }

    // Procesar PDF
    let extraction;
    try {
      const text = await pdfExtractor.extractText(pdfPath);
      if (text.trim().length > 100) {
        extraction = await pdfExtractor.extract(pdfPath);
      } else {
        extraction = await ocrExtractor.extract(pdfPath);
      }
    } catch (error) {
      console.error(`   ❌ Error procesando PDF: ${error}`);
      continue;
    }

    const detected = extraction.data;

    // Comparar campos
    const cuitMatch = detected.cuit === expected.emisor.cuit;
    const fechaMatch =
      detected.date && expected.factura.fecha
        ? (() => {
            // Convertir fecha detectada DD/MM/YYYY → YYYY-MM-DD
            const parts = detected.date.split('/');
            if (parts.length === 3) {
              const detectedFormatted = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
              return detectedFormatted === expected.factura.fecha;
            }
            return false;
          })()
        : false;
    const tipoMatch = detected.invoiceType === expected.factura.tipo;
    const pvMatch = detected.pointOfSale === expected.factura.punto_venta;
    const numeroMatch = detected.invoiceNumber === expected.factura.numero;
    const totalMatch =
      detected.total !== undefined && expected.factura.total !== undefined
        ? Math.abs(detected.total - expected.factura.total) < 0.01
        : detected.total === expected.factura.total;

    results.push({
      file,
      cuitMatch,
      fechaMatch,
      tipoMatch,
      pvMatch,
      numeroMatch,
      totalMatch,
      expected,
      detected,
    });

    // Mostrar resultados
    console.log(`\n   📊 Resultados:`);
    console.log(
      `      ${cuitMatch ? '✅' : '❌'} CUIT: ${detected.cuit || 'NO DETECTADO'} ${!cuitMatch ? `(esperado: ${expected.emisor.cuit})` : ''}`
    );
    console.log(
      `      ${fechaMatch ? '✅' : '❌'} Fecha: ${detected.date || 'NO DETECTADO'} ${!fechaMatch ? `(esperado: ${expected.factura.fecha})` : ''}`
    );
    console.log(
      `      ${tipoMatch ? '✅' : '❌'} Tipo: ${detected.invoiceType || 'NO DETECTADO'} ${!tipoMatch ? `(esperado: ${expected.factura.tipo})` : ''}`
    );
    console.log(
      `      ${pvMatch ? '✅' : '❌'} PV: ${detected.pointOfSale !== undefined ? detected.pointOfSale : 'NO DETECTADO'} ${!pvMatch ? `(esperado: ${expected.factura.punto_venta})` : ''}`
    );
    console.log(
      `      ${numeroMatch ? '✅' : '❌'} Número: ${detected.invoiceNumber !== undefined ? detected.invoiceNumber : 'NO DETECTADO'} ${!numeroMatch ? `(esperado: ${expected.factura.numero})` : ''}`
    );
    console.log(
      `      ${totalMatch ? '✅' : '❌'} Total: ${detected.total !== undefined ? detected.total : 'NO DETECTADO'} ${!totalMatch ? `(esperado: ${expected.factura.total})` : ''}`
    );

    const correctCount = [
      cuitMatch,
      fechaMatch,
      tipoMatch,
      pvMatch,
      numeroMatch,
      totalMatch,
    ].filter(Boolean).length;
    console.log(
      `\n   📈 Precisión: ${correctCount}/6 campos correctos (${((correctCount / 6) * 100).toFixed(1)}%)`
    );
  }

  // Estadísticas generales
  console.log(`\n\n${'='.repeat(100)}`);
  console.log('📈 ESTADÍSTICAS GENERALES\n');

  const totalFiles = results.length;
  const cuitAccuracy = (results.filter((r) => r.cuitMatch).length / totalFiles) * 100;
  const fechaAccuracy = (results.filter((r) => r.fechaMatch).length / totalFiles) * 100;
  const tipoAccuracy = (results.filter((r) => r.tipoMatch).length / totalFiles) * 100;
  const pvAccuracy = (results.filter((r) => r.pvMatch).length / totalFiles) * 100;
  const numeroAccuracy = (results.filter((r) => r.numeroMatch).length / totalFiles) * 100;
  const totalAccuracy = (results.filter((r) => r.totalMatch).length / totalFiles) * 100;

  console.log(`   Total archivos: ${totalFiles}`);
  console.log(`\n   📊 Precisión por campo:`);
  console.log(
    `      ${cuitAccuracy === 100 ? '✅' : cuitAccuracy >= 80 ? '🟡' : '❌'} CUIT: ${cuitAccuracy.toFixed(1)}% (${results.filter((r) => r.cuitMatch).length}/${totalFiles})`
  );
  console.log(
    `      ${fechaAccuracy === 100 ? '✅' : fechaAccuracy >= 80 ? '🟡' : '❌'} Fecha: ${fechaAccuracy.toFixed(1)}% (${results.filter((r) => r.fechaMatch).length}/${totalFiles})`
  );
  console.log(
    `      ${tipoAccuracy === 100 ? '✅' : tipoAccuracy >= 80 ? '🟡' : '❌'} Tipo: ${tipoAccuracy.toFixed(1)}% (${results.filter((r) => r.tipoMatch).length}/${totalFiles})`
  );
  console.log(
    `      ${pvAccuracy === 100 ? '✅' : pvAccuracy >= 80 ? '🟡' : '❌'} Punto Venta: ${pvAccuracy.toFixed(1)}% (${results.filter((r) => r.pvMatch).length}/${totalFiles})`
  );
  console.log(
    `      ${numeroAccuracy === 100 ? '✅' : numeroAccuracy >= 80 ? '🟡' : '❌'} Número: ${numeroAccuracy.toFixed(1)}% (${results.filter((r) => r.numeroMatch).length}/${totalFiles})`
  );
  console.log(
    `      ${totalAccuracy === 100 ? '✅' : totalAccuracy >= 80 ? '🟡' : '❌'} Total: ${totalAccuracy.toFixed(1)}% (${results.filter((r) => r.totalMatch).length}/${totalFiles})`
  );

  const perfectMatches = results.filter(
    (r) => r.cuitMatch && r.fechaMatch && r.tipoMatch && r.pvMatch && r.numeroMatch && r.totalMatch
  ).length;
  console.log(
    `\n   🎯 Extractiones perfectas: ${perfectMatches}/${totalFiles} (${((perfectMatches / totalFiles) * 100).toFixed(1)}%)`
  );

  console.log(`\n${'='.repeat(100)}\n`);
}

testExtractionAccuracy().catch((error) => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});
