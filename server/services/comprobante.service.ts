/**
 * Servicio de consolidación de Comprobantes.
 * Construye el DTO unificado (Comprobante) a partir de las 3 fuentes:
 * facturas finales, expected invoices, y archivos subidos.
 */

import {
  ExpectedInvoiceRepository,
  type IExpectedInvoiceRepository,
} from '../database/repositories/expected-invoice';
import { InvoiceRepository, type IInvoiceRepository } from '../database/repositories/invoice';
import { FileRepository, type IFileRepository } from '../database/repositories/file';
import {
  FileExtractionRepository,
  type IFileExtractionRepository,
} from '../database/repositories/file-extraction';
import { EmitterRepository, type IEmitterRepository } from '../database/repositories/emitter';
import { normalizeToISO } from '../utils/dates';
import type { Final, Expected, FileData, Comprobante } from '@shared/types';

export class ComprobanteService {
  private invoiceRepo: IInvoiceRepository;
  private expectedRepo: IExpectedInvoiceRepository;
  private fileRepo: IFileRepository;
  private extractionRepo: IFileExtractionRepository;
  private emitterRepo: IEmitterRepository;

  constructor(
    invoiceRepo?: IInvoiceRepository,
    expectedRepo?: IExpectedInvoiceRepository,
    fileRepo?: IFileRepository,
    extractionRepo?: IFileExtractionRepository,
    emitterRepo?: IEmitterRepository
  ) {
    this.invoiceRepo = invoiceRepo ?? new InvoiceRepository();
    this.expectedRepo = expectedRepo ?? new ExpectedInvoiceRepository();
    this.fileRepo = fileRepo ?? new FileRepository();
    this.extractionRepo = extractionRepo ?? new FileExtractionRepository();
    this.emitterRepo = emitterRepo ?? new EmitterRepository();
  }

  /**
   * Construye la lista completa de comprobantes consolidados.
   * Une facturas, expected invoices y archivos sin procesar en un solo DTO.
   */
  async listAll(): Promise<Comprobante[]> {
    const invoices = await this.invoiceRepo.list();
    const expectedInvoices = await this.expectedRepo.listWithFiles({
      status: ['pending'],
    });

    const uploadedFiles = this.buildUploadedFiles();

    const emitterCache = this.buildEmitterCache(invoices, expectedInvoices, uploadedFiles);

    const comprobantesMap = new Map<string, Comprobante>();

    // 1) Facturas finales
    const finals = this.buildFinals(invoices, emitterCache);
    for (const f of finals) {
      const comprobanteId = `factura:${f.id}`;
      comprobantesMap.set(comprobanteId, {
        id: comprobanteId,
        kind: 'factura',
        final: f,
        expected: null,
        file: null,
        emitterCuit: f.cuit,
        emitterName: f.emitterName,
        effectiveDate: f.issueDate,
      });
    }

    // 2) Expected invoices no vinculadas a factura
    const expectedIdsLinkedToInvoice = new Set(
      finals.map((f) => f.expectedInvoiceId).filter((id): id is number => id != null)
    );

    const expecteds = this.buildExpecteds(
      expectedInvoices,
      expectedIdsLinkedToInvoice,
      emitterCache
    );

    for (const e of expecteds) {
      const facturaLinked = finals.find((f) => f.expectedInvoiceId === e.id);
      if (facturaLinked) {
        const comprobanteId = `factura:${facturaLinked.id}`;
        const comp = comprobantesMap.get(comprobanteId)!;
        comp.expected = e;
      } else {
        const comprobanteId = `expected:${e.id}`;
        comprobantesMap.set(comprobanteId, {
          id: comprobanteId,
          kind: 'expected',
          final: null,
          expected: e,
          file: null,
          emitterCuit: e.cuit,
          emitterName: e.emitterName,
          effectiveDate: e.issueDate,
        });
      }
    }

    // 3) Archivos subidos no vinculados a factura
    const fileIdsUsedByInvoices = new Set(
      finals.map((f) => f.fileId).filter((id): id is number => id != null)
    );

    for (const p of uploadedFiles) {
      if (fileIdsUsedByInvoices.has(p.id)) continue;

      const comprobanteId = `file:${p.id}`;
      comprobantesMap.set(comprobanteId, {
        id: comprobanteId,
        kind: 'file',
        final: null,
        expected: null,
        file: p,
        emitterCuit: p.extractedCuit,
        emitterName: p.extractedCuit ? emitterCache.get(p.extractedCuit) : undefined,
        effectiveDate: p.uploadDate ?? null,
      });
    }

    // Ordenar: latest first (cada kind ya asignó su effectiveDate)
    const comprobantes = Array.from(comprobantesMap.values());
    comprobantes.sort((a, b) => {
      const dateA = a.effectiveDate;
      const dateB = b.effectiveDate;
      if (dateA && dateB) return new Date(dateB).getTime() - new Date(dateA).getTime();
      if (!dateA && dateB) return 1;
      if (dateA && !dateB) return -1;
      return 0;
    });

    return comprobantes;
  }

  private buildUploadedFiles(): FileData[] {
    const uploadedFilesRaw = this.fileRepo.list({ status: 'uploaded' });
    return uploadedFilesRaw.map((file) => {
      const extraction = this.extractionRepo.findByFileId(file.id);
      return {
        id: file.id,
        originalFilename: file.originalFilename,
        filePath: file.storagePath,
        fileHash: file.fileHash ?? null,
        status: file.status,
        uploadDate: normalizeToISO(file.createdAt),
        extractedCuit: extraction?.extractedCuit ?? null,
        extractedDate: normalizeToISO(extraction?.extractedDate) ?? null,
        extractedTotal: extraction?.extractedTotal ?? null,
        extractedType: extraction?.extractedType ?? null,
        extractedPointOfSale: extraction?.extractedPointOfSale ?? null,
        extractedInvoiceNumber: extraction?.extractedInvoiceNumber ?? null,
        categoryId: file.categoryId ?? null,
      };
    });
  }

  private buildEmitterCache(
    invoices: Array<{ emitterCuit: string }>,
    expectedInvoices: Array<{ cuit: string }>,
    uploadedFiles: FileData[]
  ): Map<string, string | null> {
    const uniqueCuits = new Set<string>([
      ...invoices.map((i) => i.emitterCuit).filter((c): c is string => Boolean(c)),
      ...expectedInvoices.map((i) => i.cuit).filter((c): c is string => Boolean(c)),
      ...uploadedFiles.map((p) => p.extractedCuit).filter((c): c is string => Boolean(c)),
    ]);
    const cache = new Map<string, string | null>();
    for (const cuit of uniqueCuits) {
      const emitter = this.emitterRepo.findByCUIT(cuit);
      cache.set(cuit, emitter?.displayName || null);
    }
    return cache;
  }

  private buildFinals(
    invoices: Awaited<ReturnType<InvoiceRepository['list']>>,
    emitterCache: Map<string, string | null>
  ): Final[] {
    return invoices.map((inv) => {
      let filePath: string | undefined;
      let fileHash: string | null = null;
      if (inv.fileId) {
        const file = this.fileRepo.findById(inv.fileId);
        if (file) {
          filePath = file.storagePath;
          fileHash = file.fileHash ?? null;
        }
      }
      return {
        source: 'final',
        id: inv.id,
        cuit: inv.emitterCuit,
        emitterName: emitterCache.get(inv.emitterCuit) || undefined,
        issueDate: normalizeToISO(inv.issueDate),
        processedAt: inv.processedAt ? inv.processedAt.toString() : null,
        invoiceType: inv.invoiceType,
        pointOfSale: inv.pointOfSale,
        invoiceNumber: inv.invoiceNumber,
        total: inv.total ?? null,
        file: filePath,
        fileHash,
        categoryId: inv.categoryId ?? null,
        fileId: inv.fileId ?? null,
        expectedInvoiceId: inv.expectedInvoiceId ?? null,
      };
    });
  }

  private buildExpecteds(
    expectedInvoices: Awaited<ReturnType<ExpectedInvoiceRepository['listWithFiles']>>,
    linkedIds: Set<number>,
    emitterCache: Map<string, string | null>
  ): Expected[] {
    return expectedInvoices
      .filter((inv) => !linkedIds.has(inv.id))
      .map((inv) => ({
        source: 'expected' as const,
        id: inv.id,
        cuit: inv.cuit,
        emitterName: emitterCache.get(inv.cuit) || inv.emitterName,
        issueDate: inv.issueDate,
        invoiceType: inv.invoiceType,
        pointOfSale: inv.pointOfSale,
        invoiceNumber: inv.invoiceNumber,
        total: inv.total,
        status: inv.status,
        categoryId: inv.categoryId ?? null,
      }));
  }
}
