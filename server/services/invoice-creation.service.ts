/**
 * Servicio de creación de facturas.
 * Responsabilidad: crear factura + copiar archivo a finalized/ + vincular expected.
 * Extraído del endpoint POST /api/invoices/from-file/[fileId].
 */

import { FileRepository } from '../database/repositories/file';
import { FileExtractionRepository } from '../database/repositories/file-extraction';
import { InvoiceRepository } from '../database/repositories/invoice';
import { ExpectedInvoiceRepository } from '../database/repositories/expected-invoice';
import { EmitterRepository } from '../database/repositories/emitter';
import { CategoryRepository } from '../database/repositories/category';
import { existsSync } from 'fs';
import { copyFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { generateProcessedFilename, generateSubdirectory } from '../utils/file-naming';
import { validateCUIT, normalizeCUIT } from '../validators/cuit';

const PROJECT_ROOT = join(process.cwd(), '..');
const DATA_DIR = join(PROJECT_ROOT, 'data');
const FINALIZED_DIR = join(DATA_DIR, 'finalized');

export interface InvoiceCreationData {
  cuit: string;
  invoiceType: number;
  pointOfSale: number;
  invoiceNumber: number;
  issueDate: string; // YYYY-MM-DD
  total: number;
  currency?: string;
  categoryId?: number;
}

export interface InvoiceCreationOptions {
  source: 'extraction' | 'expected' | 'manual';
  expectedId?: number;
}

export interface InvoiceCreationResult {
  success: boolean;
  invoice?: {
    id: number;
    fullInvoiceNumber: string;
    emitterCuit: string;
    total: number | null;
    issueDate: string;
    filePath: string;
  };
  error?: string;
}

export class InvoiceCreationService {
  private fileRepo: FileRepository;
  private extractionRepo: FileExtractionRepository;
  private invoiceRepo: InvoiceRepository;
  private expectedRepo: ExpectedInvoiceRepository;
  private emitterRepo: EmitterRepository;
  private categoryRepo: CategoryRepository;

  constructor() {
    this.fileRepo = new FileRepository();
    this.extractionRepo = new FileExtractionRepository();
    this.invoiceRepo = new InvoiceRepository();
    this.expectedRepo = new ExpectedInvoiceRepository();
    this.emitterRepo = new EmitterRepository();
    this.categoryRepo = new CategoryRepository();
  }

  /**
   * Crea una factura a partir de un archivo subido.
   * Valida datos, copia archivo a finalized/, crea factura en DB, vincula expected si aplica.
   */
  async createFromFile(
    fileId: number,
    data: InvoiceCreationData,
    options: InvoiceCreationOptions
  ): Promise<InvoiceCreationResult> {
    // 1. Obtener file
    const file = this.fileRepo.findById(fileId);
    if (!file) {
      return { success: false, error: 'Archivo no encontrado' };
    }

    const extraction = this.extractionRepo.findByFileId(fileId);

    // 2. Validar y normalizar CUIT
    if (!validateCUIT(data.cuit)) {
      return { success: false, error: 'CUIT inválido' };
    }
    const normalizedCuit = normalizeCUIT(data.cuit);

    // 3. Buscar emisor (debe existir previamente)
    const emitter = this.emitterRepo.findByCUIT(normalizedCuit);
    if (!emitter) {
      return {
        success: false,
        error: `Emisor con CUIT ${normalizedCuit} no encontrado. Crealo primero en la sección de emisores.`,
      };
    }

    // 4. Resolver categoría
    let categoryId: number | undefined = undefined;
    let categoryKey: string | undefined = undefined;

    if (data.categoryId) {
      categoryId = data.categoryId;
      const cat = await this.categoryRepo.findById(data.categoryId);
      if (cat) {
        categoryKey = cat.key;
      }
    }

    // 5. Generar nombre y copiar archivo
    const issueDate = new Date(data.issueDate);
    const newFilename = generateProcessedFilename(
      issueDate,
      emitter,
      data.invoiceType,
      data.pointOfSale,
      data.invoiceNumber,
      file.originalFilename,
      categoryKey
    );

    const subdir = generateSubdirectory(issueDate);
    const targetDir = join(FINALIZED_DIR, subdir);
    const newPath = join(targetDir, newFilename);
    const newRelativePath = `finalized/${subdir}/${newFilename}`;

    const absoluteSourcePath = file.storagePath.startsWith('/')
      ? file.storagePath
      : join(DATA_DIR, file.storagePath);

    if (!existsSync(absoluteSourcePath)) {
      return { success: false, error: 'Archivo físico no encontrado' };
    }

    await mkdir(targetDir, { recursive: true });
    await copyFile(absoluteSourcePath, newPath);

    // 6. Actualizar file
    this.fileRepo.updatePath(fileId, newRelativePath);
    this.fileRepo.updateStatus(fileId, 'processed');

    // 7. Crear factura
    const invoice = await this.invoiceRepo.create({
      emitterCuit: normalizedCuit,
      issueDate: data.issueDate,
      invoiceType: data.invoiceType,
      pointOfSale: data.pointOfSale,
      invoiceNumber: data.invoiceNumber,
      total: data.total,
      fileId: fileId,
      fileType: file.fileType as 'PDF_DIGITAL' | 'PDF_IMAGEN' | 'IMAGEN',
      extractionMethod: (extraction?.method || 'MANUAL') as 'TEMPLATE' | 'GENERICO' | 'MANUAL',
      extractionConfidence: extraction?.confidence ?? undefined,
      requiresReview: false,
      expectedInvoiceId: options.source === 'expected' ? options.expectedId : undefined,
      categoryId: categoryId,
    });

    // 8. Vincular expected si aplica
    if (options.source === 'expected' && options.expectedId) {
      await this.expectedRepo.updateStatus(options.expectedId, 'matched');
    }

    return {
      success: true,
      invoice: {
        id: invoice.id,
        fullInvoiceNumber: invoice.fullInvoiceNumber,
        emitterCuit: invoice.emitterCuit,
        total: invoice.total,
        issueDate: data.issueDate,
        filePath: newRelativePath,
      },
    };
  }
}
