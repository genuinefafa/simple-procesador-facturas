/**
 * API endpoint para subir archivos de facturas
 * Usa el nuevo modelo files + file_extraction_results
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import {
  getFileRepository,
  getFileExtractionRepository,
  getInvoiceRepository,
  createInvoiceProcessingService,
} from '@server/factories';
import { calculateFileHash } from '@server/utils/file-hash.js';

const UPLOAD_DIR = join(process.cwd(), '..', 'data', 'input');

export const POST: RequestHandler = async ({ request }) => {
  console.info('📤 [UPLOAD] Iniciando subida de archivos...');
  console.info('📤 [UPLOAD] Directorio destino:', UPLOAD_DIR);

  try {
    // Crear directorio si no existe
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
      console.info('📁 [UPLOAD] Directorio creado');
    }

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    console.info(`📤 [UPLOAD] Archivos recibidos: ${files.length}`);

    if (!files || files.length === 0) {
      console.warn('⚠️  [UPLOAD] No se recibieron archivos');
      return json({ success: false, error: 'No se recibieron archivos' }, { status: 400 });
    }

    const uploadedFiles = [];
    const errors = [];
    const fileRepo = getFileRepository();
    const extractionRepo = getFileExtractionRepository();
    const invoiceRepo = getInvoiceRepository();
    const processingService = createInvoiceProcessingService();

    for (const file of files) {
      console.info(`📄 [UPLOAD] Procesando: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`);

      try {
        // Validar extensión
        const ext = file.name.split('.').pop()?.toLowerCase();
        const SUPPORTED_EXTENSIONS = [
          'pdf',
          'jpg',
          'jpeg',
          'png',
          'tif',
          'tiff',
          'webp',
          'heic',
          'heif',
        ];
        if (!ext || !SUPPORTED_EXTENSIONS.includes(ext)) {
          throw new Error(`Tipo no soportado. Formatos aceptados: PDF, JPG, PNG, TIF, WEBP, HEIC`);
        }

        // Validar tamaño (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
          throw new Error(`Archivo muy grande. Máximo 10MB`);
        }

        // Guardar archivo
        const buffer = Buffer.from(await file.arrayBuffer());
        let filePath = join(UPLOAD_DIR, file.name);
        let savedFilename = file.name;

        // Verificar si ya existe y generar nombre único con timestamp si es necesario
        if (existsSync(filePath)) {
          const timestamp = Date.now();
          const extname = file.name.split('.').pop();
          const basename = file.name.substring(
            0,
            file.name.length - (extname ? extname.length + 1 : 0)
          );
          savedFilename = `${basename}.${timestamp}.${extname}`;
          filePath = join(UPLOAD_DIR, savedFilename);
          console.info(`⚠️  [UPLOAD] Archivo ya existe, renombrando a: ${savedFilename}`);
        }

        await writeFile(filePath, buffer);
        console.info(`✅ [UPLOAD] Guardado: ${filePath}`);

        // Calcular hash SHA-256
        let fileHash: string | undefined;
        let hashPreview: string | undefined;
        try {
          const hashResult = await calculateFileHash(filePath);
          fileHash = hashResult.hash;
          hashPreview = fileHash.substring(0, 16);
          console.info(`🔐 [UPLOAD] Hash: ${hashPreview}...`);

          // Verificar duplicados en dos pasos:
          // 1. Buscar en files
          const existingFile = fileRepo.findByHash(fileHash);
          if (existingFile) {
            await unlink(filePath); // Borrar archivo recién subido

            // Verificar si este file ya tiene una factura asociada
            const linkedInvoices = await invoiceRepo.findByFileId(existingFile.id);

            if (linkedInvoices.length > 0) {
              // El file ya tiene factura → reportar la factura
              const linkedInvoice = linkedInvoices[0];
              throw new Error(
                JSON.stringify({
                  type: 'duplicate',
                  duplicateType: 'invoice',
                  duplicateId: linkedInvoice.id,
                  duplicateFilename: existingFile.originalFilename,
                  message: `Archivo duplicado (hash idéntico a factura:${linkedInvoice.id})`,
                })
              );
            } else {
              // File sin factura → reportar el file
              throw new Error(
                JSON.stringify({
                  type: 'duplicate',
                  duplicateType: 'file',
                  duplicateId: existingFile.id,
                  duplicateFilename: existingFile.originalFilename,
                  message: `Archivo duplicado (hash idéntico a file:${existingFile.id})`,
                })
              );
            }
          }
        } catch (error) {
          // Si es error de duplicado, propagar
          if (error instanceof Error && error.message.includes('duplicado')) {
            throw error;
          }
          console.warn(`⚠️  [UPLOAD] Error calculando hash:`, error);
        }

        // Determinar tipo de archivo
        const fileType = ext === 'pdf' ? 'PDF_DIGITAL' : 'IMAGEN'; // Simplificado, luego se puede refinar

        // Calcular ruta relativa desde data/
        const relativePath = `input/${savedFilename}`;

        // Crear registro en files
        const createdFile = fileRepo.create({
          originalFilename: savedFilename,
          fileType: fileType as 'PDF_DIGITAL' | 'PDF_IMAGEN' | 'IMAGEN' | 'HEIC',
          fileSize: file.size,
          fileHash: fileHash!,
          storagePath: relativePath,
          status: 'uploaded',
        });

        console.info(`📝 [UPLOAD] File creado en BD: ID ${createdFile.id}`);

        // Intentar extracción automática usando InvoiceProcessingService
        try {
          console.info(`🔍 [UPLOAD] Iniciando extracción para file ${createdFile.id}...`);
          const processingResult = await processingService.processInvoice(filePath, savedFilename);

          if (processingResult.extractedData) {
            // Guardar resultados de extracción en file_extraction_results
            const method = processingResult.method || 'OCR';
            extractionRepo.create({
              fileId: createdFile.id,
              extractedCuit: processingResult.extractedData.cuit || null,
              extractedDate: processingResult.extractedData.date || null,
              extractedTotal: processingResult.extractedData.total || null,
              extractedType: processingResult.extractedData.invoiceType || null,
              extractedPointOfSale: processingResult.extractedData.pointOfSale || null,
              extractedInvoiceNumber: processingResult.extractedData.invoiceNumber || null,
              confidence: processingResult.confidence || null,
              method: method as
                | 'TEMPLATE'
                | 'GENERICO'
                | 'MANUAL'
                | 'PDF_TEXT'
                | 'OCR'
                | 'PDF_TEXT+OCR',
              errors: processingResult.error || null,
            });
            console.info(
              `✅ [UPLOAD] Extracción completada (conf: ${processingResult.confidence}%, método: ${method})`
            );
          } else {
            console.warn(`⚠️  [UPLOAD] Sin datos extraídos: ${processingResult.error}`);
          }
        } catch (extractionError) {
          console.warn(`⚠️  [UPLOAD] Error en extracción:`, extractionError);
          // No falla el upload si la extracción falla
        }

        uploadedFiles.push({
          fileId: createdFile.id,
          name: savedFilename,
          size: file.size,
          path: filePath,
          hash: fileHash,
          hashPreview,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        console.warn(`⚠️  [UPLOAD] Error con ${file.name}: ${errorMessage}`);

        // Intentar parsear el error como JSON (para duplicados)
        let errorData: any = { message: errorMessage };
        try {
          errorData = JSON.parse(errorMessage);
        } catch {
          // No es JSON, usar mensaje simple
        }

        errors.push({
          name: file.name,
          error: errorData.message || errorMessage,
          ...errorData, // Incluir type, duplicateType, duplicateId, etc.
        });
      }
    }

    const successCount = uploadedFiles.length;
    const errorCount = errors.length;
    const totalCount = successCount + errorCount;

    console.info(`✅ [UPLOAD] Completado: ${successCount}/${totalCount} archivo(s) subido(s)`);

    if (errorCount > 0) {
      console.warn(`⚠️  [UPLOAD] Errores: ${errorCount} archivo(s) fallaron`);
    }

    // Retornar éxito si al menos 1 archivo se subió
    const hasSuccess = successCount > 0;

    return json({
      success: hasSuccess,
      message: hasSuccess
        ? `${successCount} de ${totalCount} archivo(s) subido(s) correctamente`
        : `No se pudo subir ningún archivo`,
      uploadedFiles,
      errors,
      summary: {
        total: totalCount,
        success: successCount,
        failed: errorCount,
      },
    });
  } catch (error) {
    console.error('❌ [UPLOAD] Error:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
};
