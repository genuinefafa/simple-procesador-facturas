/**
 * Servicio de creación de facturas.
 * Responsabilidad: crear factura + copiar archivo a finalized/ + vincular expected.
 * Extraído del endpoint POST /api/invoices/from-file/[fileId].
 */

import { FileRepository, type IFileRepository } from '../database/repositories/file';
import { InvoiceRepository, type IInvoiceRepository } from '../database/repositories/invoice';
import {
  ExpectedInvoiceRepository,
  type IExpectedInvoiceRepository,
} from '../database/repositories/expected-invoice';
import { EmitterRepository, type IEmitterRepository } from '../database/repositories/emitter';
import { CategoryRepository, type ICategoryRepository } from '../database/repositories/category';
import { InvoiceFileService } from './invoice-file.service';
import { checkLinkConflicts } from './invoice-link-guard';
import { validateCUIT, normalizeCUIT, formatCUIT, getPersonType } from '@shared/validators/cuit';
import { unlink } from 'fs/promises';
import { resolve } from 'path';
import type { Currency } from '@shared/types';
import { buildArcaBreakdown, type BreakdownLine } from '../utils/expected-tax-lines';
import { makeTaxLinesBodySchema } from '../contracts/invoice-tax-lines';
import type { ZodError } from 'zod';

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
  /** 'conflict' when a link invariant would break (#203); the route answers 409 */
  errorCode?: 'conflict' | 'not_found' | 'validation';
  /** Zod error when errorCode is 'validation' (tax breakdown); the route answers 400 */
  validationError?: ZodError;
}

export interface CreateFromExpectedOptions {
  categoryId?: number | null;
  /** Replaces the default single OTHER_TAXES line (detail of "otros tributos") */
  otherTaxLines?: BreakdownLine[];
}

export class InvoiceCreationService {
  private fileRepo: IFileRepository;
  private invoiceRepo: IInvoiceRepository;
  private expectedRepo: IExpectedInvoiceRepository;
  private emitterRepo: IEmitterRepository;
  private categoryRepo: ICategoryRepository;
  private fileService: InvoiceFileService;

  constructor(
    fileRepo?: IFileRepository,
    _extractionRepo?: unknown,
    invoiceRepo?: IInvoiceRepository,
    expectedRepo?: IExpectedInvoiceRepository,
    emitterRepo?: IEmitterRepository,
    categoryRepo?: ICategoryRepository,
    fileService?: InvoiceFileService
  ) {
    this.fileRepo = fileRepo ?? new FileRepository();
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

    // 3b. Link integrity (#203): check before copying to finalized/, which could
    // overwrite the copy of an existing invoice with the same canonical name
    const expectedInvoiceId = options.source === 'expected' ? options.expectedId : undefined;
    const conflict = await checkLinkConflicts(this.invoiceRepo, {
      emitterCuit: emitter.cuit,
      invoiceType: data.invoiceType,
      pointOfSale: data.pointOfSale,
      invoiceNumber: data.invoiceNumber,
      expectedInvoiceId,
      fileId,
    });
    if (conflict) {
      return { success: false, error: conflict, errorCode: 'conflict' };
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
      expectedInvoiceId,
      categoryId: categoryId,
    });

    // 8. Vincular expected si aplica — refreshStatus derives 'matched' from linked factura
    if (expectedInvoiceId) {
      await this.expectedRepo.refreshStatus(expectedInvoiceId);
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
  /**
   * Creates an invoice entirely from an ARCA expected invoice plus a file, in
   * one operation: invoice + tax breakdown are written in a single transaction.
   * Validation happens before any file is touched.
   */
  async createFromExpected(
    expectedId: number,
    fileId: number,
    options: CreateFromExpectedOptions = {}
  ): Promise<InvoiceCreationResult> {
    const expected = await this.expectedRepo.findById(expectedId);
    if (!expected) {
      return { success: false, error: 'Factura esperada no encontrada', errorCode: 'not_found' };
    }
    const file = this.fileRepo.findById(fileId);
    if (!file) {
      return { success: false, error: 'Archivo no encontrado', errorCode: 'not_found' };
    }
    if (expected.invoiceType === null) {
      return {
        success: false,
        error: 'La factura esperada no tiene tipo de comprobante',
        errorCode: 'validation',
      };
    }
    const invoiceType = expected.invoiceType;

    const existingEmitter = this.emitterRepo.findByCUIT(expected.cuit);

    // Link integrity (#203): number, expected and file must all be free
    const conflict = await checkLinkConflicts(this.invoiceRepo, {
      emitterCuit: existingEmitter?.cuit ?? expected.cuit,
      invoiceType,
      pointOfSale: expected.pointOfSale,
      invoiceNumber: expected.invoiceNumber,
      expectedInvoiceId: expected.id,
      fileId,
    });
    if (conflict) {
      return { success: false, error: conflict, errorCode: 'conflict' };
    }

    // Breakdown: validated BEFORE touching any file
    const { lines } = buildArcaBreakdown(expected, options.otherTaxLines);
    const parsed = makeTaxLinesBodySchema(expected.total, invoiceType).safeParse({ lines });
    if (!parsed.success) {
      return {
        success: false,
        error: 'Desglose inválido',
        errorCode: 'validation',
        validationError: parsed.error,
      };
    }

    // Emitter: created from ARCA data only once everything validated
    const emitter =
      existingEmitter ??
      this.emitterRepo.create({
        cuit: expected.cuit,
        name: expected.emitterName || `Emisor ${expected.cuit}`,
        aliases: [],
        personType: getPersonType(expected.cuit) || undefined,
      });

    // Category: explicit only (same as createFromFile)
    let categoryId: number | undefined;
    let categoryKey: string | undefined;
    if (options.categoryId) {
      categoryId = options.categoryId;
      const cat = await this.categoryRepo.findById(options.categoryId);
      if (cat) categoryKey = cat.key;
    }

    const issueDate = expected.issueDate;
    const originalPath = file.storagePath;
    const originalStatus = file.status;

    const copyResult = await this.fileService.copyToFinalized(
      fileId,
      {
        emitterCuit: emitter.cuit,
        invoiceType,
        pointOfSale: expected.pointOfSale,
        invoiceNumber: expected.invoiceNumber,
        issueDate,
        fileId,
      },
      emitter,
      categoryKey
    );
    if (!copyResult.success) {
      return { success: false, error: copyResult.error || 'Error copiando archivo' };
    }
    const newRelativePath = copyResult.relativePath!;

    let invoice;
    try {
      invoice = await this.invoiceRepo.createWithTaxLines(
        {
          emitterCuit: emitter.cuit,
          issueDate,
          invoiceType,
          pointOfSale: expected.pointOfSale,
          invoiceNumber: expected.invoiceNumber,
          total: expected.total ?? undefined,
          currency: (expected.currency ?? undefined) as Currency | undefined,
          fileId,
          expectedInvoiceId: expected.id,
          categoryId,
        },
        parsed.data.lines
      );
    } catch (err) {
      await this.rollbackCopy(fileId, originalPath, originalStatus, copyResult);
      throw err;
    }

    await this.expectedRepo.refreshStatus(expectedId);

    return {
      success: true,
      invoice: {
        id: invoice.id,
        fullInvoiceNumber: invoice.fullInvoiceNumber,
        emitterCuit: invoice.emitterCuit,
        total: invoice.total,
        issueDate,
        filePath: newRelativePath,
      },
    };
  }

  /**
   * Best-effort undo of copyToFinalized: restores the file row and deletes the
   * new copy, only when this call created it (new path differs from the original).
   */
  private async rollbackCopy(
    fileId: number,
    originalPath: string,
    originalStatus: string,
    copy: { newPath?: string; oldPath?: string }
  ): Promise<void> {
    try {
      this.fileRepo.updatePath(fileId, originalPath);
      this.fileRepo.updateStatus(fileId, originalStatus === 'processed' ? 'processed' : 'uploaded');
      if (copy.newPath && copy.oldPath && resolve(copy.newPath) !== resolve(copy.oldPath)) {
        await unlink(copy.newPath);
      }
    } catch (rollbackErr) {
      console.error('[InvoiceCreationService] Rollback de copia falló:', rollbackErr);
    }
  }
}
