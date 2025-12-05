/**
 * Analiza las diferencias entre baseline (commit inicial) y datos corregidos
 * Genera reporte de fallos del sistema de extracción
 */

import { readFileSync, readdirSync } from 'fs';
import { join, extname } from 'path';
import { parse as parseYAML } from 'yaml';

const EXAMPLES_DIR = join(process.cwd(), '..', 'examples', 'facturas');
const BASELINE_COMMIT = 'df2983d';

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
  notas?: string | string[];
}

interface FieldDiff {
  field: string;
  baseline: any;
  corrected: any;
  match: boolean;
  severity: 'critical' | 'major' | 'minor';
  notes?: string;
}

interface FileDiff {
  fileName: string;
  confidence: number;
  fields: FieldDiff[];
  correctFields: number;
  totalFields: number;
  accuracy: number;
  userNotes?: string | string[];
}

async function getBaselineYML(fileName: string): Promise<YMLData | null> {
  try {
    const { execSync } = await import('child_process');
    const ymlPath = `examples/facturas/${fileName}`;
    const content = execSync(`git show ${BASELINE_COMMIT}:${ymlPath}`, {
      encoding: 'utf-8',
    });
    return parseYAML(content) as YMLData;
  } catch (error) {
    console.error(`❌ Error obteniendo baseline para ${fileName}:`, error);
    return null;
  }
}

function getCurrentYML(filePath: string): YMLData | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return parseYAML(content) as YMLData;
  } catch (error) {
    console.error(`❌ Error leyendo ${filePath}:`, error);
    return null;
  }
}

function compareField(
  fieldName: string,
  baseline: any,
  corrected: any
): { match: boolean; severity: 'critical' | 'major' | 'minor' } {
  // Valores no detectados
  if (baseline === undefined || baseline === null || baseline === 0) {
    return { match: false, severity: 'major' };
  }

  // Comparación numérica con tolerancia para totales
  if (typeof baseline === 'number' && typeof corrected === 'number') {
    const diff = Math.abs(baseline - corrected);
    const percentDiff = (diff / Math.max(baseline, corrected)) * 100;

    // Error de órdenes de magnitud (ej: 77.30 vs 77300.30)
    if (percentDiff > 50) {
      return { match: false, severity: 'critical' };
    }

    // Diferencia menor al 1% (ej: redondeos)
    if (percentDiff < 1) {
      return { match: true, severity: 'minor' };
    }

    return { match: false, severity: 'major' };
  }

  // Comparación de strings
  if (typeof baseline === 'string' && typeof corrected === 'string') {
    const match = baseline.toLowerCase().trim() === corrected.toLowerCase().trim();

    // CUIT incorrecto es crítico
    if (fieldName === 'CUIT' && !match) {
      return { match: false, severity: 'critical' };
    }

    // Fecha incorrecta es major
    if (fieldName === 'Fecha' && !match) {
      return { match: false, severity: 'major' };
    }

    return { match, severity: match ? 'minor' : 'major' };
  }

  // Default
  const match = baseline === corrected;
  return { match, severity: match ? 'minor' : 'major' };
}

async function analyzeFile(fileName: string): Promise<FileDiff | null> {
  const baselinePath = fileName.replace('.pdf', '.yml');
  const baseline = await getBaselineYML(baselinePath);
  const corrected = getCurrentYML(join(EXAMPLES_DIR, baselinePath));

  if (!baseline || !corrected) {
    return null;
  }

  // Extraer confianza del comentario en baseline
  const confidence = parseFloat(
    baseline.toString().match(/Confianza de extracción: ([\d.]+)%/)?.[1] || '0'
  );

  const fields: FieldDiff[] = [
    {
      field: 'CUIT',
      baseline: baseline.emisor.cuit,
      corrected: corrected.emisor.cuit,
      ...compareField('CUIT', baseline.emisor.cuit, corrected.emisor.cuit),
    },
    {
      field: 'Tipo',
      baseline: baseline.factura.tipo,
      corrected: corrected.factura.tipo,
      ...compareField('Tipo', baseline.factura.tipo, corrected.factura.tipo),
    },
    {
      field: 'Punto Venta',
      baseline: baseline.factura.punto_venta,
      corrected: corrected.factura.punto_venta,
      ...compareField('Punto Venta', baseline.factura.punto_venta, corrected.factura.punto_venta),
    },
    {
      field: 'Número',
      baseline: baseline.factura.numero,
      corrected: corrected.factura.numero,
      ...compareField('Número', baseline.factura.numero, corrected.factura.numero),
    },
    {
      field: 'Fecha',
      baseline: baseline.factura.fecha,
      corrected: corrected.factura.fecha,
      ...compareField('Fecha', baseline.factura.fecha, corrected.factura.fecha),
    },
    {
      field: 'Total',
      baseline: baseline.factura.total,
      corrected: corrected.factura.total,
      ...compareField('Total', baseline.factura.total, corrected.factura.total),
    },
  ];

  const correctFields = fields.filter((f) => f.match).length;
  const totalFields = fields.length;
  const accuracy = (correctFields / totalFields) * 100;

  return {
    fileName,
    confidence,
    fields,
    correctFields,
    totalFields,
    accuracy,
    userNotes: corrected.notas,
  };
}

async function generateReport() {
  console.log('📊 Análisis de diferencias Baseline vs Datos Corregidos\n');
  console.log('='.repeat(100));

  const files = readdirSync(EXAMPLES_DIR)
    .filter((f) => extname(f).toLowerCase() === '.pdf')
    .sort();

  const results: FileDiff[] = [];

  for (const file of files) {
    const analysis = await analyzeFile(file);
    if (analysis) {
      results.push(analysis);
    }
  }

  // Reporte por archivo
  console.log('\n📄 ANÁLISIS POR ARCHIVO:\n');

  for (const result of results) {
    console.log(`\n${'─'.repeat(100)}`);
    console.log(`📋 ${result.fileName}`);
    console.log(
      `   Confianza sistema: ${result.confidence}% | Precisión real: ${result.accuracy.toFixed(1)}%`
    );
    console.log(`   Campos correctos: ${result.correctFields}/${result.totalFields}`);

    const errors = result.fields.filter((f) => !f.match);
    if (errors.length > 0) {
      console.log(`\n   ❌ Errores detectados:`);
      errors.forEach((err) => {
        const severity =
          err.severity === 'critical' ? '🔴' : err.severity === 'major' ? '🟡' : '🟢';
        console.log(`      ${severity} ${err.field}:`);
        console.log(`         Detectado: ${JSON.stringify(err.baseline)}`);
        console.log(`         Correcto:  ${JSON.stringify(err.corrected)}`);
      });
    } else {
      console.log(`   ✅ Todos los campos correctos`);
    }

    if (result.userNotes) {
      console.log(`\n   📝 Notas del usuario:`);
      const notes = Array.isArray(result.userNotes) ? result.userNotes : [result.userNotes];
      notes.forEach((note) => console.log(`      - ${note}`));
    }
  }

  // Estadísticas generales
  console.log(`\n\n${'='.repeat(100)}`);
  console.log('📈 ESTADÍSTICAS GENERALES:\n');

  const totalFiles = results.length;
  const perfectFiles = results.filter((r) => r.accuracy === 100).length;
  const goodFiles = results.filter((r) => r.accuracy >= 80 && r.accuracy < 100).length;
  const poorFiles = results.filter((r) => r.accuracy < 80).length;

  console.log(`   📁 Total archivos analizados: ${totalFiles}`);
  console.log(`   ✅ Extracción perfecta (100%): ${perfectFiles} archivos`);
  console.log(`   🟡 Extracción buena (80-99%): ${goodFiles} archivos`);
  console.log(`   ❌ Extracción pobre (<80%): ${poorFiles} archivos\n`);

  // Análisis por campo
  console.log('📊 PRECISIÓN POR CAMPO:\n');
  const fieldStats: { [key: string]: { correct: number; total: number } } = {};

  results.forEach((result) => {
    result.fields.forEach((field) => {
      if (!fieldStats[field.field]) {
        fieldStats[field.field] = { correct: 0, total: 0 };
      }
      fieldStats[field.field].total++;
      if (field.match) {
        fieldStats[field.field].correct++;
      }
    });
  });

  Object.entries(fieldStats)
    .sort((a, b) => {
      const accA = (a[1].correct / a[1].total) * 100;
      const accB = (b[1].correct / b[1].total) * 100;
      return accB - accA;
    })
    .forEach(([field, stats]) => {
      const accuracy = ((stats.correct / stats.total) * 100).toFixed(1);
      const icon = parseFloat(accuracy) >= 80 ? '✅' : parseFloat(accuracy) >= 50 ? '🟡' : '❌';
      console.log(`   ${icon} ${field.padEnd(15)}: ${stats.correct}/${stats.total} (${accuracy}%)`);
    });

  // Problemas críticos encontrados
  console.log(`\n\n${'='.repeat(100)}`);
  console.log('🔴 PROBLEMAS CRÍTICOS DETECTADOS:\n');

  const criticalIssues: { issue: string; count: number; examples: string[] }[] = [];

  results.forEach((result) => {
    result.fields.forEach((field) => {
      if (field.severity === 'critical' && !field.match) {
        const issueKey = field.field;
        let issue = criticalIssues.find((i) => i.issue === issueKey);
        if (!issue) {
          issue = { issue: issueKey, count: 0, examples: [] };
          criticalIssues.push(issue);
        }
        issue.count++;
        issue.examples.push(
          `${result.fileName}: ${JSON.stringify(field.baseline)} → ${JSON.stringify(field.corrected)}`
        );
      }
    });
  });

  if (criticalIssues.length > 0) {
    criticalIssues
      .sort((a, b) => b.count - a.count)
      .forEach((issue) => {
        console.log(`\n   🔴 ${issue.issue} (${issue.count} casos):`);
        issue.examples.forEach((ex) => console.log(`      - ${ex}`));
      });
  } else {
    console.log('   ✅ No se detectaron problemas críticos');
  }

  // Recomendaciones
  console.log(`\n\n${'='.repeat(100)}`);
  console.log('💡 RECOMENDACIONES DE MEJORA:\n');

  const recommendations = [];

  // Analizar patrones de error
  const cuitErrors = results.filter((r) => !r.fields.find((f) => f.field === 'CUIT')?.match).length;
  const totalErrors = results.filter(
    (r) => !r.fields.find((f) => f.field === 'Total')?.match
  ).length;
  const fechaErrors = results.filter(
    (r) => !r.fields.find((f) => f.field === 'Fecha')?.match
  ).length;

  if (cuitErrors > 0) {
    recommendations.push({
      priority: 'ALTA',
      area: 'Detección de CUIT',
      issue: `${cuitErrors}/${totalFiles} archivos con CUIT incorrecto`,
      solution:
        'Mejorar patrones de detección de CUIT. Considerar:\n' +
        '      • Buscar CUIT sin guiones (formato: 30517583231)\n' +
        '      • Priorizar CUIT cerca de "emisor", "razón social"\n' +
        '      • Cuando hay múltiples CUIT, tomar el primero (es el emisor)',
    });
  }

  if (totalErrors > 0) {
    recommendations.push({
      priority: 'ALTA',
      area: 'Detección de Total',
      issue: `${totalErrors}/${totalFiles} archivos con Total incorrecto/faltante`,
      solution:
        'Mejorar detección de importes. Considerar:\n' +
        '      • Formato argentino: coma como separador de miles, punto como decimal\n' +
        '      • Parsear de derecha a izquierda: primer punto/coma es decimal\n' +
        '      • Total suele ser el importe más grande del documento\n' +
        '      • Buscar cerca de palabras: "total", "importe total", tabla al final',
    });
  }

  if (fechaErrors > 0) {
    recommendations.push({
      priority: 'MEDIA',
      area: 'Detección de Fecha',
      issue: `${fechaErrors}/${totalFiles} archivos con Fecha incorrecta`,
      solution:
        'Mejorar scoring de fechas. Considerar:\n' +
        '      • Usar contexto/títulos cercanos (ej: "fecha de emisión")\n' +
        '      • Descartar: "vencimiento", "período", "CAE"\n' +
        '      • Priorizar: "emisión", "fecha y hora"\n' +
        '      • Manejar formatos con espacios: "08 / 02 / 23"',
    });
  }

  recommendations.forEach((rec, i) => {
    console.log(`\n   ${i + 1}. [${rec.priority}] ${rec.area}`);
    console.log(`      Problema: ${rec.issue}`);
    console.log(`      Solución: ${rec.solution}`);
  });

  console.log(`\n${'='.repeat(100)}\n`);
}

// Ejecutar
generateReport().catch((error) => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});
