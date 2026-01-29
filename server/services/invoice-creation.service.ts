/**
 * Servicio de creación de facturas.
 * Responsabilidad: crear factura + copiar archivo a finalized/ + vincular expected.
 * Extraído del endpoint POST /api/invoices/from-file/[fileId].
 */

import { FileRepository, type IFileRepository } from '../database/repositories/file';
import {
  FileExtractionRepository,
  type IFileExtractionRepository,
} from '../database/repositories/file-extraction';
import { InvoiceRepository, type IInvoiceRepository } from '../database/repositories/invoice';
import {
  ExpectedInvoiceRepository,
  type IExpectedInvoiceRepository,
} from '../database/repositories/expected-invoice';
import { EmitterRepository, type IEmitterRepository } from '../database/repositories/emitter';
import { CategoryRepository, type ICategoryRepository } from '../database/repositories/category';
import { InvoiceFileService } from './invoice-file.service';
import { validateCUIT, normalizeCUIT, formatCUIT } from '@shared/validators/cuit';

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
  private fileRepo: IFileRepository;
  private extractionRepo: IFileExtractionRepository;
  private invoiceRepo: IInvoiceRepository;
  private expectedRepo: IExpectedInvoiceRepository;
  private emitterRepo: IEmitterRepository;
  private categoryRepo: ICategoryRepository;
  private fileService: InvoiceFileService;

  constructor(
    fileRepo?: IFileRepository,
    extractionRepo?: IFileExtractionRepository,
    invoiceRepo?: IInvoiceRepository,
    expectedRepo?: IExpectedInvoiceRepository,
    emitterRepo?: IEmitterRepository,
    categoryRepo?: ICategoryRepository,
    fileService?: InvoiceFileService
  ) {
    this.fileRepo = fileRepo ?? new FileRepository();
    this.extractionRepo = extractionRepo ?? new FileExtractionRepository();
    this.invoiceRepo = invoiceRepo ?? new InvoiceRepository();
    this.expectedRepo = expectedRepo ?? new ExpectedInvoiceRepository();
    this.emitterRepo = emitterRepo ?? new EmitterRepository();
    this.categoryRepo = categoryRepo ?? new CategoryRepository();
    this.fileService = fileService ?? new InvoiceFileService(this.fileRepo, this.categoryRepo);
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
    // findByCUIT accepts any format (normalizes internally)
    const emitter = this.emitterRepo.findByCUIT(normalizedCuit);
    if (!emitter) {
      const formattedCuit = formatCUIT(normalizedCuit);
      return {
        success: false,
        error: `Emisor con CUIT ${formattedCuit} no encontrado. Crealo primero en la sección de emisores.`,
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

    // 5. Copiar archivo a finalized/ usando InvoiceFileService
    const copyResult = await this.fileService.copyToFinalized(
      fileId,
      {
        emitterCuit: emitter.cuit,
        invoiceType: data.invoiceType,
        pointOfSale: data.pointOfSale,
        invoiceNumber: data.invoiceNumber,
        issueDate: data.issueDate,
        fileId: fileId,
      },
      emitter,
      categoryKey
    );

    if (!copyResult.success) {
      return { success: false, error: copyResult.error || 'Error copiando archivo' };
    }

    const newRelativePath = copyResult.relativePath!;

    // 7. Crear factura
    // emitterCuit must match emisores.cuit PK format (with dashes)
    const invoice = await this.invoiceRepo.create({
      emitterCuit: emitter.cuit,
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
      this.expectedRepo.updateStatus(options.expectedId, 'matched');
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
