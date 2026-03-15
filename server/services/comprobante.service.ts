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
   *
   * When `balanceGroupOf` is provided, returns only the secundarios of that
   * balance group as full Comprobante objects (with group total/balance info).
   */
  async listAll(options?: { balanceGroupOf?: number }): Promise<{
    comprobantes: Comprobante[];
    groupTotal?: number;
    groupIsBalanced?: boolean;
  }> {
    if (options?.balanceGroupOf != null) {
      return this.listBalanceGroupMembers(options.balanceGroupOf);
    }

    const invoices = await this.invoiceRepo.list();
    const expectedInvoices = await this.expectedRepo.listWithFiles({
      status: ['pending', 'balanced'],
    });
    // Get IDs of principals (those that have secundarios pointing to them)
    const principalIds = await this.expectedRepo.getPrincipalIds();

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
      emitterCache,
      principalIds
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

    return { comprobantes };
  }

  /**
   * Builds Comprobante[] for the secundarios of a balance group.
   * Used to render sub-rows as full comprobantes with editable category, status, etc.
   */
  private async listBalanceGroupMembers(principalId: number): Promise<{
    comprobantes: Comprobante[];
    groupTotal?: number;
    groupIsBalanced?: boolean;
  }> {
    const group = await this.expectedRepo.getBalanceGroup(principalId);
    if (group.length === 0) return { comprobantes: [] };

    // Only secundarios (those pointing to the principal)
    const secundarios = group.filter((inv) => inv.balancedWithId !== null);
    if (secundarios.length === 0) return { comprobantes: [] };

    // Build emitter cache for secundarios
    const uniqueCuits = new Set(
      secundarios.map((inv) => inv.cuit).filter((c): c is string => Boolean(c))
    );
    const emitterCache = new Map<string, string | null>();
    for (const cuit of uniqueCuits) {
      const emitter = this.emitterRepo.findByCUIT(cuit);
      emitterCache.set(cuit, emitter?.displayName || null);
    }

    // Build Comprobante[] for each secundario
    const comprobantes: Comprobante[] = secundarios.map((inv) => {
      const expected: Expected = {
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
        balancedWithId: inv.balancedWithId ?? null,
        isBalanceGroupPrincipal: false,
      };

      return {
        id: `expected:${inv.id}`,
        kind: 'expected' as const,
        final: null,
        expected,
        file: null,
        emitterCuit: inv.cuit,
        emitterName: emitterCache.get(inv.cuit) || inv.emitterName,
        effectiveDate: inv.issueDate,
      };
    });

    // Calculate balance
    const balance = await this.expectedRepo.calculateGroupBalance(principalId);

    return {
      comprobantes,
      groupTotal: balance.total,
      groupIsBalanced: balance.isBalanced,
    };
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
        createdAt: inv.createdAt ? inv.createdAt.toString() : null,
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
    emitterCache: Map<string, string | null>,
    principalIds: Set<number>
  ): Expected[] {
    return expectedInvoices
      .filter((inv) => {
        // Exclude if already linked to an invoice
        if (linkedIds.has(inv.id)) return false;
        // Exclude secundarios from balanced groups - only show the principal
        // A secundario has balancedWithId pointing to someone else
        if (inv.balancedWithId !== null) return false;
        return true;
      })
      .map((inv) => {
        // Only show Scale icon for principals (the ones that "own" the group)
        const isBalanceGroupPrincipal = principalIds.has(inv.id);

        return {
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
          balancedWithId: inv.balancedWithId ?? null,
          isBalanceGroupPrincipal,
        };
      });
  }
}
