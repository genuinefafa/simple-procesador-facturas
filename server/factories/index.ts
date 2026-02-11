/**
 * Factory functions for creating services with dependencies.
 * Use these factories in production code to create properly-wired service instances.
 * For testing, instantiate services directly with mock dependencies.
 */

// Repositories
import { FileRepository } from '../database/repositories/file';
import { FileExtractionRepository } from '../database/repositories/file-extraction';
import { InvoiceRepository } from '../database/repositories/invoice';
import { ExpectedInvoiceRepository } from '../database/repositories/expected-invoice';
import { EmitterRepository } from '../database/repositories/emitter';
import { CategoryRepository } from '../database/repositories/category';

// Services
import { InvoiceCreationService } from '../services/invoice-creation.service';
import { InvoiceFileService } from '../services/invoice-file.service';
import { ComprobanteService } from '../services/comprobante.service';
import { InvoiceProcessingService } from '../services/invoice-processing.service';
import { ExcelImportService } from '../services/excel-import.service';
import { FileExportService } from '../services/file-export.service';

// Extractors are loaded lazily in createInvoiceProcessingService()
// to avoid pulling heavy dependencies (tesseract.js, sharp, pdf-to-img)
// into the module graph at import time.

/**
 * Singleton instances of repositories.
 * Repositories are stateless so sharing instances is safe and reduces memory.
 */
let _fileRepo: FileRepository | null = null;
let _extractionRepo: FileExtractionRepository | null = null;
let _invoiceRepo: InvoiceRepository | null = null;
let _expectedRepo: ExpectedInvoiceRepository | null = null;
let _emitterRepo: EmitterRepository | null = null;
let _categoryRepo: CategoryRepository | null = null;

export function getFileRepository(): FileRepository {
  if (!_fileRepo) _fileRepo = new FileRepository();
  return _fileRepo;
}

export function getFileExtractionRepository(): FileExtractionRepository {
  if (!_extractionRepo) _extractionRepo = new FileExtractionRepository();
  return _extractionRepo;
}

export function getInvoiceRepository(): InvoiceRepository {
  if (!_invoiceRepo) _invoiceRepo = new InvoiceRepository();
  return _invoiceRepo;
}

export function getExpectedInvoiceRepository(): ExpectedInvoiceRepository {
  if (!_expectedRepo) _expectedRepo = new ExpectedInvoiceRepository();
  return _expectedRepo;
}

export function getEmitterRepository(): EmitterRepository {
  if (!_emitterRepo) _emitterRepo = new EmitterRepository();
  return _emitterRepo;
}

export function getCategoryRepository(): CategoryRepository {
  if (!_categoryRepo) _categoryRepo = new CategoryRepository();
  return _categoryRepo;
}

/**
 * Factory for InvoiceFileService
 */
export function createInvoiceFileService(): InvoiceFileService {
  return new InvoiceFileService(getFileRepository(), getCategoryRepository());
}

/**
 * Factory for InvoiceCreationService
 */
export function createInvoiceCreationService(): InvoiceCreationService {
  return new InvoiceCreationService(
    getFileRepository(),
    getFileExtractionRepository(),
    getInvoiceRepository(),
    getExpectedInvoiceRepository(),
    getEmitterRepository(),
    getCategoryRepository(),
    createInvoiceFileService()
  );
}

/**
 * Factory for ComprobanteService
 */
export function createComprobanteService(): ComprobanteService {
  return new ComprobanteService(
    getInvoiceRepository(),
    getExpectedInvoiceRepository(),
    getFileRepository(),
    getFileExtractionRepository(),
    getEmitterRepository()
  );
}

/**
 * Factory for InvoiceProcessingService
 * Lazy-loads extractors to avoid pulling heavy dependencies (tesseract.js, sharp, etc.)
 * into the module graph at import time.
 */
export async function createInvoiceProcessingService(): Promise<InvoiceProcessingService> {
  const [{ PDFExtractor }, { OCRExtractor }, { QRExtractor }] = await Promise.all([
    import('../extractors/pdf-extractor'),
    import('../extractors/ocr-extractor'),
    import('../extractors/qr-extractor'),
  ]);

  return new InvoiceProcessingService(
    new PDFExtractor(),
    new OCRExtractor(),
    new QRExtractor(),
    getEmitterRepository()
  );
}

/**
 * Factory for ExcelImportService
 */
export function createExcelImportService(): ExcelImportService {
  return new ExcelImportService(getExpectedInvoiceRepository(), getEmitterRepository());
}

/**
 * Factory for FileExportService
 */
export function createFileExportService(outputDir?: string): FileExportService {
  return new FileExportService(outputDir, getInvoiceRepository(), getEmitterRepository());
}

/**
 * Reset all singleton instances (useful for testing)
 */
export function resetSingletons(): void {
  _fileRepo = null;
  _extractionRepo = null;
  _invoiceRepo = null;
  _expectedRepo = null;
  _emitterRepo = null;
  _categoryRepo = null;
}
