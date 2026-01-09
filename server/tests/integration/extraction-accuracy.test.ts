/**
 * Test de integración: Validación de precisión de extracción
 *
 * Este test valida que la precisión de extracción se mantenga por encima
 * de umbrales mínimos aceptables. Falla si hay regresión.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { PDFExtractor } from '../../extractors/pdf-extractor.js';
import { OCRExtractor } from '../../extractors/ocr-extractor.js';
import type { ExtractionResult } from '../../utils/types.js';
import { readFileSync, readdirSync } from 'fs';
import { join, extname } from 'path';
import { parse as parseYAML } from 'yaml';

const EXAMPLES_DIR = join(process.cwd(), '..', 'examples', 'facturas');

// Umbrales mínimos de precisión aceptables (basados en precisión actual)
// Estos valores sirven para detectar REGRESIONES, no como objetivo final
const ACCURACY_THRESHOLDS = {
  CUIT: 50, // Actual: 50% - TODO: mejorar a 100%
  Fecha: 60, // Actual: 62.5% - TODO: mejorar a 90%+
  Tipo: 60, // Actual: 62.5% (bajó tras migración ARCA, ver Issue #68) - TODO: mejorar a 90%+
  PuntoVenta: 80, // Actual: 87.5% - bueno
  Numero: 80, // Actual: 87.5% - bueno
  Total: 50, // Actual: 50% - TODO: mejorar a 90%+
  Global: 10, // Actual: 12.5% - TODO: mejorar a 60%+
};

interface YMLData {
  emisor: {
    cuit: string;
    nombre: string;
  };
  factura: {
    tipo: number; // Código ARCA numérico (1, 6, 11, etc.)
    punto_venta: number;
    numero: number;
    fecha: string;
    total?: number;
  };
}

interface TestResult {
  file: string;
  cuitMatch: boolean;
  fechaMatch: boolean;
  tipoMatch: boolean;
  pvMatch: boolean;
  numeroMatch: boolean;
  totalMatch: boolean;
  expected: YMLData;
  detected: ExtractionResult;
}

describe('Precisión de Extracción de Datos', () => {
  const pdfExtractor = new PDFExtractor();
  const ocrExtractor = new OCRExtractor();

  const files = readdirSync(EXAMPLES_DIR)
    .filter((f) => extname(f).toLowerCase() === '.pdf')
    .sort();

  const results: TestResult[] = [];

  // Procesar todos los PDFs antes de los tests
  beforeAll(async () => {
    for (const file of files) {
      const pdfPath = join(EXAMPLES_DIR, file);
      const ymlPath = pdfPath.replace('.pdf', '.yml');

      // Leer datos esperados del YML
      let expected: YMLData;
      try {
        const ymlContent = readFileSync(ymlPath, 'utf-8');
        expected = parseYAML(ymlContent) as YMLData;
      } catch (error) {
        console.error(`❌ Error leyendo YML ${file}: ${error}`);
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
        console.error(`❌ Error procesando PDF ${file}: ${error}`);
        continue;
      }

      const detected = extraction.data;

      // Comparar campos
      const cuitMatch = detected.cuit === expected.emisor.cuit;
      // Los extractores ahora retornan fecha en formato ISO (YYYY-MM-DD) directamente
      const fechaMatch =
        detected.date && expected.factura.fecha ? detected.date === expected.factura.fecha : false;
      // YML ahora usa códigos ARCA numéricos directamente
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
    }
  }, 120000); // 2 minutos timeout para procesamiento

  it('debe mantener precisión de CUIT >= 50% (objetivo: 100%)', () => {
    const matches = results.filter((r) => r.cuitMatch).length;
    const accuracy = (matches / results.length) * 100;

    const failedFiles = results.filter((r) => !r.cuitMatch).map((r) => r.file);

    expect(
      accuracy,
      `CUIT: ${accuracy.toFixed(1)}% < ${ACCURACY_THRESHOLDS.CUIT}%. Fallos en: ${failedFiles.join(', ')}`
    ).toBeGreaterThanOrEqual(ACCURACY_THRESHOLDS.CUIT);
  });

  it('debe mantener precisión de Fecha >= 60% (objetivo: 90%)', () => {
    const matches = results.filter((r) => r.fechaMatch).length;
    const accuracy = (matches / results.length) * 100;

    const failedFiles = results.filter((r) => !r.fechaMatch).map((r) => r.file);

    expect(
      accuracy,
      `Fecha: ${accuracy.toFixed(1)}% < ${ACCURACY_THRESHOLDS.Fecha}%. Fallos en: ${failedFiles.join(', ')}`
    ).toBeGreaterThanOrEqual(ACCURACY_THRESHOLDS.Fecha);
  });

  it('debe mantener precisión de Tipo >= 60% (objetivo: 90%)', () => {
    const matches = results.filter((r) => r.tipoMatch).length;
    const accuracy = (matches / results.length) * 100;

    const failedFiles = results.filter((r) => !r.tipoMatch).map((r) => r.file);

    expect(
      accuracy,
      `Tipo: ${accuracy.toFixed(1)}% < ${ACCURACY_THRESHOLDS.Tipo}%. Fallos en: ${failedFiles.join(', ')}`
    ).toBeGreaterThanOrEqual(ACCURACY_THRESHOLDS.Tipo);
  });

  it('debe mantener precisión de Punto de Venta >= 80%', () => {
    const matches = results.filter((r) => r.pvMatch).length;
    const accuracy = (matches / results.length) * 100;

    const failedFiles = results.filter((r) => !r.pvMatch).map((r) => r.file);

    expect(
      accuracy,
      `PV: ${accuracy.toFixed(1)}% < ${ACCURACY_THRESHOLDS.PuntoVenta}%. Fallos en: ${failedFiles.join(', ')}`
    ).toBeGreaterThanOrEqual(ACCURACY_THRESHOLDS.PuntoVenta);
  });

  it('debe mantener precisión de Número >= 80%', () => {
    const matches = results.filter((r) => r.numeroMatch).length;
    const accuracy = (matches / results.length) * 100;

    const failedFiles = results.filter((r) => !r.numeroMatch).map((r) => r.file);

    expect(
      accuracy,
      `Número: ${accuracy.toFixed(1)}% < ${ACCURACY_THRESHOLDS.Numero}%. Fallos en: ${failedFiles.join(', ')}`
    ).toBeGreaterThanOrEqual(ACCURACY_THRESHOLDS.Numero);
  });

  it('debe mantener precisión de Total >= 50% (objetivo: 90%)', () => {
    const matches = results.filter((r) => r.totalMatch).length;
    const accuracy = (matches / results.length) * 100;

    const failedFiles = results.filter((r) => !r.totalMatch).map((r) => r.file);

    expect(
      accuracy,
      `Total: ${accuracy.toFixed(1)}% < ${ACCURACY_THRESHOLDS.Total}%. Fallos en: ${failedFiles.join(', ')}`
    ).toBeGreaterThanOrEqual(ACCURACY_THRESHOLDS.Total);
  });

  it('debe mantener al menos 10% de extractiones perfectas (objetivo: 60%)', () => {
    const perfectMatches = results.filter(
      (r) =>
        r.cuitMatch && r.fechaMatch && r.tipoMatch && r.pvMatch && r.numeroMatch && r.totalMatch
    ).length;
    const accuracy = (perfectMatches / results.length) * 100;

    const failedFiles = results
      .filter(
        (r) =>
          !(
            r.cuitMatch &&
            r.fechaMatch &&
            r.tipoMatch &&
            r.pvMatch &&
            r.numeroMatch &&
            r.totalMatch
          )
      )
      .map((r) => r.file);

    expect(
      accuracy,
      `Global: ${accuracy.toFixed(1)}% < ${ACCURACY_THRESHOLDS.Global}%. Fallos en: ${failedFiles.join(', ')}`
    ).toBeGreaterThanOrEqual(ACCURACY_THRESHOLDS.Global);
  });

  it('debe reportar estadísticas completas', () => {
    const totalFiles = results.length;
    const cuitAccuracy = (results.filter((r) => r.cuitMatch).length / totalFiles) * 100;
    const fechaAccuracy = (results.filter((r) => r.fechaMatch).length / totalFiles) * 100;
    const tipoAccuracy = (results.filter((r) => r.tipoMatch).length / totalFiles) * 100;
    const pvAccuracy = (results.filter((r) => r.pvMatch).length / totalFiles) * 100;
    const numeroAccuracy = (results.filter((r) => r.numeroMatch).length / totalFiles) * 100;
    const totalAccuracy = (results.filter((r) => r.totalMatch).length / totalFiles) * 100;
    const perfectMatches = results.filter(
      (r) =>
        r.cuitMatch && r.fechaMatch && r.tipoMatch && r.pvMatch && r.numeroMatch && r.totalMatch
    ).length;

    console.log('\n📊 ESTADÍSTICAS DE PRECISIÓN:');
    console.log(`   CUIT: ${cuitAccuracy.toFixed(1)}% (umbral: ${ACCURACY_THRESHOLDS.CUIT}%)`);
    console.log(`   Fecha: ${fechaAccuracy.toFixed(1)}% (umbral: ${ACCURACY_THRESHOLDS.Fecha}%)`);
    console.log(`   Tipo: ${tipoAccuracy.toFixed(1)}% (umbral: ${ACCURACY_THRESHOLDS.Tipo}%)`);
    console.log(`   PV: ${pvAccuracy.toFixed(1)}% (umbral: ${ACCURACY_THRESHOLDS.PuntoVenta}%)`);
    console.log(
      `   Número: ${numeroAccuracy.toFixed(1)}% (umbral: ${ACCURACY_THRESHOLDS.Numero}%)`
    );
    console.log(`   Total: ${totalAccuracy.toFixed(1)}% (umbral: ${ACCURACY_THRESHOLDS.Total}%)`);
    console.log(
      `   Perfectas: ${perfectMatches}/${totalFiles} (${((perfectMatches / totalFiles) * 100).toFixed(1)}%)`
    );

    // Este test siempre pasa, solo reporta
    expect(true).toBe(true);
  });
});
