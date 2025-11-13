/**
 * Comando para procesar facturas
 */

import { Command } from 'commander';
import { FileScanner } from '../../scanner';
import { PDFExtractor } from '../../extractors';
import { EmitterRepository, InvoiceRepository } from '../../database';
import { normalizeCUIT, getPersonType } from '../../validators/cuit';
import { generateProcessedFilename } from '../../utils/file-naming';

export function createProcessCommand(): Command {
  const command = new Command('process');

  command
    .description('Procesa facturas del directorio input')
    .option('-f, --file <path>', 'Procesar un archivo específico')
    .option('-d, --directory <path>', 'Directorio a escanear', './data/input')
    .action(async (options: { file?: string; directory: string }) => {
      console.info('🚀 Procesador de Facturas - Modo Procesamiento\n');

      try {
        if (options.file) {
          // Procesar archivo específico
          await processFile(options.file);
        } else {
          // Procesar directorio completo
          await processDirectory(options.directory);
        }
      } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  return command;
}

/**
 * Procesa un archivo individual
 */
async function processFile(filePath: string): Promise<void> {
  console.info(`📄 Procesando: ${filePath}\n`);

  // Solo procesar PDFs por ahora (OCR no implementado)
  if (!filePath.toLowerCase().endsWith('.pdf')) {
    console.warn('⚠️  Solo PDFs digitales soportados en MVP');
    console.warn('   OCR se implementará en Fase 2');
    return;
  }

  const extractor = new PDFExtractor();
  const emitterRepo = new EmitterRepository();
  const invoiceRepo = new InvoiceRepository();

  // Extraer información
  console.info('🔍 Extrayendo información...');
  const result = await extractor.extract(filePath);

  if (!result.success) {
    console.error('❌ No se pudo extraer información suficiente');
    console.error(`   Confianza: ${result.confidence.toFixed(1)}% (mínimo: 50%)`);
    if (result.errors) {
      result.errors.forEach((err) => console.error(`   - ${err}`));
    }
    return;
  }

  // Mostrar datos extraídos
  console.info('\n📊 Datos extraídos:');
  console.info(`   CUIT: ${result.data.cuit || '❌ No encontrado'}`);
  console.info(`   Fecha: ${result.data.date || '❌ No encontrada'}`);
  console.info(`   Tipo: ${result.data.invoiceType || '❌ No encontrado'}`);
  console.info(
    `   Punto venta: ${result.data.pointOfSale !== undefined ? String(result.data.pointOfSale).padStart(4, '0') : '❌'}`
  );
  console.info(
    `   Número: ${result.data.invoiceNumber !== undefined ? String(result.data.invoiceNumber).padStart(8, '0') : '❌'}`
  );
  console.info(`   Total: $${result.data.total?.toFixed(2) || '❌'}`);
  console.info(`   Confianza: ${result.confidence.toFixed(1)}%\n`);

  // Validar datos mínimos
  if (
    !result.data.cuit ||
    !result.data.date ||
    !result.data.invoiceType ||
    result.data.pointOfSale === undefined ||
    result.data.invoiceNumber === undefined ||
    !result.data.total
  ) {
    console.error('❌ Faltan datos obligatorios para crear la factura');
    return;
  }

  // Normalizar CUIT
  const normalizedCuit = normalizeCUIT(result.data.cuit);

  // Buscar o crear emisor
  let emitter = emitterRepo.findByCUIT(normalizedCuit);

  if (!emitter) {
    console.info(`✨ Creando nuevo emisor: ${normalizedCuit}`);
    emitter = emitterRepo.create({
      cuit: normalizedCuit,
      cuitNumeric: normalizedCuit.replace(/[-\s]/g, ''),
      name: result.data.emitterName || 'Emisor Desconocido',
      personType: getPersonType(normalizedCuit) || undefined,
    });
  }

  // Parsear fecha
  const dateParts = result.data.date.split(/[/-]/);
  const issueDate = new Date(
    parseInt(dateParts[2]!, 10),
    parseInt(dateParts[1]!, 10) - 1,
    parseInt(dateParts[0]!, 10)
  );

  // Verificar si la factura ya existe
  const existing = invoiceRepo.findByInvoiceNumber(
    normalizedCuit,
    result.data.invoiceType,
    result.data.pointOfSale,
    result.data.invoiceNumber
  );

  if (existing) {
    console.warn('⚠️  Esta factura ya fue procesada anteriormente');
    console.info(`   ID: ${existing.id}`);
    return;
  }

  // Generar nombre de archivo procesado
  const processedFilename = generateProcessedFilename(
    emitter,
    result.data.invoiceType,
    result.data.pointOfSale,
    result.data.invoiceNumber,
    filePath
  );

  // Crear factura
  const invoice = invoiceRepo.create({
    emitterCuit: normalizedCuit,
    issueDate,
    invoiceType: result.data.invoiceType,
    pointOfSale: result.data.pointOfSale,
    invoiceNumber: result.data.invoiceNumber,
    total: result.data.total,
    originalFile: filePath,
    processedFile: processedFilename,
    fileType: 'PDF_DIGITAL',
    extractionMethod: 'GENERICO',
    extractionConfidence: result.confidence,
    requiresReview: result.confidence < 80,
  });

  console.info('✅ Factura procesada exitosamente!');
  console.info(`   ID: ${invoice.id}`);
  console.info(`   Comprobante: ${invoice.fullInvoiceNumber}`);
  console.info(`   Archivo: ${processedFilename}`);

  if (invoice.requiresReview) {
    console.warn('⚠️  Marcada para revisión (confianza < 80%)');
  }
}

/**
 * Procesa todos los archivos de un directorio
 */
async function processDirectory(directory: string): Promise<void> {
  const scanner = new FileScanner(directory);

  console.info(`📁 Escaneando: ${directory}\n`);

  const files = scanner.scan();

  if (files.length === 0) {
    console.info('ℹ️  No hay archivos para procesar');
    return;
  }

  console.info(`📋 Encontrados ${files.length} archivo(s):\n`);

  const stats = scanner.getStats();
  console.info('Tipos:');
  for (const [type, count] of Object.entries(stats.byType)) {
    console.info(`  - ${type}: ${count}`);
  }
  console.info('');

  // Procesar solo PDFs por ahora
  const pdfs = files.filter((f) => f.extension === '.pdf');

  if (pdfs.length === 0) {
    console.warn('⚠️  No hay PDFs para procesar');
    console.warn('   OCR para imágenes se implementará en Fase 2');
    return;
  }

  console.info(`🔄 Procesando ${pdfs.length} PDF(s)...\n`);

  for (const file of pdfs) {
    await processFile(file.path);
    console.info(''); // Línea en blanco entre archivos
  }

  console.info('✨ Procesamiento completo!');
}
