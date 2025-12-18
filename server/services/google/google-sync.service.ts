/**
 * Servicio de sincronización manual entre SQLite local y Google Sheets + Drive
 * Permite sincronizar datos bajo demanda sin requerir conexión permanente
 */

import { getGoogleIntegrationService } from './google-integration.service.js';
import { EmitterRepository } from '../../database/repositories/emitter.js';
import { InvoiceRepository } from '../../database/repositories/invoice.js';
import { ExpectedInvoiceRepository } from '../../database/repositories/expected-invoice.js';
import { getConfig } from '../../utils/config-loader.js';
import type { InvoiceData } from './google-integration.service.js';
import type { Currency } from '../../utils/types.js';
import { format } from 'date-fns';
import { getARCACodeFromFriendlyType, getFriendlyType } from '../../utils/afip-codes.js';

export type SyncMode = 'sync' | 'push' | 'pull';
export type SheetType = 'emisores' | 'facturas' | 'esperadas' | 'logs';

export interface SyncResult {
  success: boolean;
  sheet: SheetType;
  mode: SyncMode;
  stats: {
    uploaded: number;
    downloaded: number;
    conflicts: number;
    errors: number;
  };
  error?: string;
  details?: string[];
}

/**
 * Servicio de sincronización manual con Google
 */
export class GoogleSyncService {
  private static instance: GoogleSyncService;
  private googleService = getGoogleIntegrationService();
  private emitterRepo = new EmitterRepository();
  private invoiceRepo = new InvoiceRepository();
  private expectedInvoiceRepo = new ExpectedInvoiceRepository();
  private initialized = false;

  private constructor() {}

  public static getInstance(): GoogleSyncService {
    if (!GoogleSyncService.instance) {
      GoogleSyncService.instance = new GoogleSyncService();
    }
    return GoogleSyncService.instance;
  }

  /**
   * Inicializa el servicio de Google
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const config = getConfig();
    if (!config.google?.enabled) {
      throw new Error('Google integration is not enabled in config.json');
    }

    await this.googleService.initialize(config);

    if (!this.googleService.isEnabled()) {
      throw new Error('Failed to initialize Google services');
    }

    this.initialized = true;
  }

  /**
   * Verifica si el servicio está listo
   */
  public isReady(): boolean {
    return this.initialized && this.googleService.isEnabled();
  }

  /**
   * Sincroniza una sheet específica
   */
  public async syncSheet(sheet: SheetType, mode: SyncMode): Promise<SyncResult> {
    if (!this.isReady()) {
      await this.initialize();
    }

    console.info(`\n🔄 Iniciando sincronización: ${sheet} (modo: ${mode})`);

    try {
      switch (sheet) {
        case 'emisores':
          return await this.syncEmisores(mode);
        case 'facturas':
          return await this.syncFacturas(mode);
        case 'esperadas':
          return await this.syncEsperadas(mode);
        case 'logs':
          return await this.syncLogs(mode);
        default:
          throw new Error(`Sheet type not supported: ${String(sheet)}`);
      }
    } catch (err) {
      console.error(`❌ Error sincronizando ${sheet}:`, err);
      return {
        success: false,
        sheet,
        mode,
        stats: { uploaded: 0, downloaded: 0, conflicts: 0, errors: 1 },
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  /**
   * Sincroniza la sheet de Emisores
   */
  private async syncEmisores(mode: SyncMode): Promise<SyncResult> {
    const stats = { uploaded: 0, downloaded: 0, conflicts: 0, errors: 0 };
    const details: string[] = [];

    // PUSH: Subir emisores locales a Google
    if (mode === 'push' || mode === 'sync') {
      console.info('📤 Subiendo emisores a Google Sheets...');
      const localEmisores = this.emitterRepo.list();

      for (const emisor of localEmisores) {
        try {
          const existing = await this.googleService.findEmisorByCuit(emisor.cuit);

          if (!existing) {
            // No existe en Google, crearlo
            await this.googleService.createOrUpdateEmisor(emisor.cuit, emisor.name);
            stats.uploaded++;
            details.push(`✅ Subido emisor: ${emisor.cuit} - ${emisor.name}`);
          } else if (mode === 'push') {
            // En modo push, actualizar siempre
            await this.googleService.createOrUpdateEmisor(emisor.cuit, emisor.name);
            stats.uploaded++;
            details.push(`🔄 Actualizado emisor: ${emisor.cuit} - ${emisor.name}`);
          }
        } catch (err) {
          stats.errors++;
          details.push(
            `❌ Error subiendo ${emisor.cuit}: ${err instanceof Error ? err.message : 'Unknown'}`
          );
        }
      }
    }

    // PULL: Bajar emisores de Google a SQLite
    if (mode === 'pull' || mode === 'sync') {
      console.info('📥 Bajando emisores desde Google Sheets...');
      const googleEmisores = await this.googleService.getAllEmisores();

      for (const googleEmisor of googleEmisores) {
        try {
          const existing = this.emitterRepo.findByCUIT(googleEmisor.cuit);

          if (!existing) {
            // No existe localmente, crearlo
            const cuitNumeric = googleEmisor.cuit.replace(/-/g, '');
            this.emitterRepo.create({
              cuit: googleEmisor.cuit,
              cuitNumeric,
              name: googleEmisor.nombre,
              aliases: [],
            });
            stats.downloaded++;
            details.push(`✅ Descargado emisor: ${googleEmisor.cuit} - ${googleEmisor.nombre}`);
          } else if (mode === 'pull') {
            // En modo pull, el emisor ya existe localmente
            // TODO: Agregar método de actualización en EmitterRepository si es necesario
            details.push(`ℹ️  Emisor ya existe: ${googleEmisor.cuit} - ${googleEmisor.nombre}`);
          }
        } catch (err) {
          stats.errors++;
          details.push(
            `❌ Error bajando ${googleEmisor.cuit}: ${err instanceof Error ? err.message : 'Unknown'}`
          );
        }
      }
    }

    return {
      success: stats.errors === 0,
      sheet: 'emisores',
      mode,
      stats,
      details,
    };
  }

  /**
   * Sincroniza la sheet de Facturas Procesadas
   */
  private async syncFacturas(mode: SyncMode): Promise<SyncResult> {
    const stats = { uploaded: 0, downloaded: 0, conflicts: 0, errors: 0 };
    const details: string[] = [];

    // PUSH: Subir facturas locales a Google
    if (mode === 'push' || mode === 'sync') {
      console.info('📤 Subiendo facturas a Google Sheets...');
      const localInvoices = await this.invoiceRepo.list({ limit: 10000 }); // Limitar por performance

      for (const invoice of localInvoices) {
        try {
          // Verificar si ya existe en Google
          const friendlyType = getFriendlyType(invoice.invoiceType);
          if (!friendlyType) {
            console.warn(
              `⚠️  Tipo de comprobante desconocido para factura ${invoice.id}, se omitirá`
            );
            stats.errors++;
            continue;
          }
          const existing = await this.googleService.findExistingInvoice(
            invoice.emitterCuit,
            friendlyType,
            invoice.pointOfSale,
            invoice.invoiceNumber
          );

          if (!existing) {
            // Convertir fecha de Date a DD/MM/YYYY
            const fechaEmision = format(invoice.issueDate, 'dd/MM/yyyy');

            // Mapear método de extracción a valores aceptados por Google
            let metodoExtraccion: 'TEMPLATE' | 'GENERICO' | 'MANUAL' = 'GENERICO';
            if (invoice.extractionMethod === 'TEMPLATE') {
              metodoExtraccion = 'TEMPLATE';
            } else if (invoice.extractionMethod === 'MANUAL') {
              metodoExtraccion = 'MANUAL';
            }

            const invoiceData: InvoiceData = {
              cuit: invoice.emitterCuit,
              fechaEmision,
              tipoComprobante: getFriendlyType(invoice.invoiceType) || 'UNKN', // Convertir número ARCA a friendlyType para Google
              puntoVenta: invoice.pointOfSale,
              numeroComprobante: invoice.invoiceNumber,
              total: invoice.total || 0,
              moneda: invoice.currency || 'ARS',
              tipoArchivo: invoice.fileType || 'PDF_DIGITAL',
              metodoExtraccion,
              confianzaExtraccion: invoice.extractionConfidence || 0,
              validadoManualmente: !invoice.requiresReview,
              requiereRevision: invoice.requiresReview,
              archivoOriginal: invoice.originalFile || '',
            };

            // Nota: saveInvoice también intenta subir archivo a Drive
            // Si el archivo no existe localmente, solo se agregará la fila a Sheets
            const result = await this.googleService.saveInvoice(invoiceData);

            if (result.success) {
              stats.uploaded++;
              details.push(
                `✅ Subida factura: ${invoice.emitterCuit} ${invoice.invoiceType}-${String(invoice.pointOfSale).padStart(5, '0')}-${String(invoice.invoiceNumber).padStart(8, '0')}`
              );
            } else {
              stats.errors++;
              details.push(`❌ Error: ${result.error ?? 'Unknown'}`);
            }
          }
        } catch (err) {
          stats.errors++;
          details.push(
            `❌ Error subiendo factura ${invoice.id}: ${err instanceof Error ? err.message : 'Unknown'}`
          );
        }
      }
    }

    // PULL: Bajar facturas de Google a SQLite
    if (mode === 'pull' || mode === 'sync') {
      console.info('📥 Bajando facturas desde Google Sheets...');
      const googleInvoices = await this.googleService.getAllFacturas();

      for (const googleInvoice of googleInvoices) {
        try {
          // Verificar si ya existe localmente
          // Convertir friendlyType de Google (FACA, FACB) a código ARCA numérico
          const invoiceTypeCode =
            getARCACodeFromFriendlyType(googleInvoice.tipoComprobante) ?? null;

          const existing = await this.invoiceRepo.findByEmitterAndNumber(
            googleInvoice.emisorCuit,
            invoiceTypeCode,
            googleInvoice.puntoVenta,
            googleInvoice.numeroComprobante
          );

          if (!existing) {
            // Convertir fecha de DD/MM/YYYY a YYYY-MM-DD
            const [day, month, year] = googleInvoice.fechaEmision.split('/');
            if (!day || !month || !year) {
              stats.errors++;
              details.push(
                `❌ Fecha inválida para factura ${googleInvoice.id}: ${googleInvoice.fechaEmision}`
              );
              continue;
            }
            const issueDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

            // Crear emisor si no existe
            let emisor = this.emitterRepo.findByCUIT(googleInvoice.emisorCuit);
            if (!emisor) {
              const cuitNumeric = googleInvoice.emisorCuit.replace(/-/g, '');
              emisor = this.emitterRepo.create({
                cuit: googleInvoice.emisorCuit,
                cuitNumeric,
                name: `Emisor ${googleInvoice.emisorCuit}`,
                aliases: [],
              });
            }

            // Crear factura local
            await this.invoiceRepo.create({
              emitterCuit: googleInvoice.emisorCuit,
              issueDate,
              invoiceType: invoiceTypeCode,
              pointOfSale: googleInvoice.puntoVenta,
              invoiceNumber: googleInvoice.numeroComprobante,
              total: googleInvoice.total,
              currency: (googleInvoice.moneda as Currency) || 'ARS',
              originalFile: googleInvoice.archivoLink || '',
              processedFile: googleInvoice.archivoLink || '',
              fileType: googleInvoice.tipoArchivo,
              extractionMethod: googleInvoice.metodoExtraccion,
              extractionConfidence: googleInvoice.confianzaExtraccion,
              requiresReview: googleInvoice.requiereRevision,
            });

            stats.downloaded++;
            details.push(
              `✅ Descargada factura: ${googleInvoice.emisorCuit} ${googleInvoice.tipoComprobante}-${String(googleInvoice.puntoVenta).padStart(5, '0')}-${String(googleInvoice.numeroComprobante).padStart(8, '0')}`
            );
          }
        } catch (err) {
          stats.errors++;
          details.push(
            `❌ Error bajando factura ${googleInvoice.id}: ${err instanceof Error ? err.message : 'Unknown'}`
          );
        }
      }
    }

    return {
      success: stats.errors === 0,
      sheet: 'facturas',
      mode,
      stats,
      details,
    };
  }

  /**
   * Sincroniza la sheet de Facturas Esperadas AFIP
   */
  private async syncEsperadas(mode: SyncMode): Promise<SyncResult> {
    const stats = { uploaded: 0, downloaded: 0, conflicts: 0, errors: 0 };
    const details: string[] = [];

    // PUSH: Subir facturas esperadas locales a Google
    if (mode === 'push' || mode === 'sync') {
      console.info('📤 Subiendo facturas esperadas a Google Sheets...');
      const localExpected = await this.expectedInvoiceRepo.list({ limit: 10000 });

      // Agrupar por lotes para importar eficientemente
      const loteId = `SYNC-${Date.now()}`;

      const esperadasToImport = localExpected
        .map((expected) => {
          // Convertir fecha de YYYY-MM-DD a DD/MM/YYYY
          const [year, month, day] = expected.issueDate.split('-');
          if (!year || !month || !day) {
            return null; // Fecha inválida, se filtrará
          }
          const fechaEmision = `${day}/${month}/${year}`;

          return {
            cuit: expected.cuit,
            nombreEmisor: expected.emitterName || '',
            fechaEmision,
            tipoComprobante: getFriendlyType(expected.invoiceType) || 'UNKN', // Convertir número ARCA a friendlyType para Google
            puntoVenta: expected.pointOfSale,
            numeroComprobante: expected.invoiceNumber,
            total: expected.total || 0,
            cae: expected.cae || '',
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      try {
        if (esperadasToImport.length > 0) {
          await this.googleService.importExpectedInvoices(esperadasToImport, loteId);
          stats.uploaded = esperadasToImport.length;
          details.push(
            `✅ Subidas ${esperadasToImport.length} facturas esperadas (Lote: ${loteId})`
          );
        }
      } catch (err) {
        stats.errors++;
        details.push(
          `❌ Error subiendo facturas esperadas: ${err instanceof Error ? err.message : 'Unknown'}`
        );
      }
    }

    // PULL: Bajar facturas esperadas de Google a SQLite
    if (mode === 'pull' || mode === 'sync') {
      console.info('📥 Bajando facturas esperadas desde Google Sheets...');
      const googleExpected = await this.googleService.getAllEsperadas();

      // Filtrar facturas que no existan localmente
      const newInvoices: Array<{
        cuit: string;
        emitterName?: string;
        issueDate: string;
        invoiceType: number | null; // Código ARCA numérico (puede ser null si no se reconoce)
        pointOfSale: number;
        invoiceNumber: number;
        total?: number;
        cae?: string;
      }> = [];

      for (const googleEsp of googleExpected) {
        try {
          // Verificar si ya existe localmente
          // Convertir friendlyType de Google (FACA, FACB) a código ARCA numérico
          const invoiceTypeCode = getARCACodeFromFriendlyType(googleEsp.tipoComprobante) ?? null;

          const existing = await this.expectedInvoiceRepo.findExactMatch(
            googleEsp.cuit,
            invoiceTypeCode,
            googleEsp.puntoVenta,
            googleEsp.numeroComprobante
          );

          if (!existing) {
            // Convertir fecha de DD/MM/YYYY a YYYY-MM-DD
            const [day, month, year] = googleEsp.fechaEmision.split('/');
            if (!day || !month || !year) {
              stats.errors++;
              details.push(
                `❌ Fecha inválida para esperada ${googleEsp.id}: ${googleEsp.fechaEmision}`
              );
              continue;
            }
            const issueDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

            newInvoices.push({
              cuit: googleEsp.cuit,
              emitterName: googleEsp.nombreEmisor || undefined,
              issueDate,
              invoiceType: invoiceTypeCode,
              pointOfSale: googleEsp.puntoVenta,
              invoiceNumber: googleEsp.numeroComprobante,
              total: googleEsp.total,
              cae: googleEsp.cae || undefined,
            });

            details.push(
              `✅ Preparada esperada: ${googleEsp.cuit} ${googleEsp.tipoComprobante}-${String(googleEsp.puntoVenta).padStart(5, '0')}-${String(googleEsp.numeroComprobante).padStart(8, '0')}`
            );
          }
        } catch (err) {
          stats.errors++;
          details.push(
            `❌ Error bajando esperada ${googleEsp.id}: ${err instanceof Error ? err.message : 'Unknown'}`
          );
        }
      }

      // Crear lote e importar facturas nuevas
      // Filtrar facturas sin tipo (null) antes de importar
      const validInvoices = newInvoices.filter((inv) => inv.invoiceType !== null) as Array<{
        cuit: string;
        emitterName?: string;
        issueDate: string;
        invoiceType: number; // Garantizado que no es null después del filtro
        pointOfSale: number;
        invoiceNumber: number;
        total?: number;
        cae?: string;
      }>;

      if (validInvoices.length > 0) {
        const batch = await this.expectedInvoiceRepo.createBatch({
          filename: `google-sync-${format(new Date(), 'yyyy-MM-dd-HH-mm-ss')}.json`,
          totalRows: googleExpected.length,
          importedRows: 0,
          skippedRows: 0,
          errorRows: 0,
        });

        const result = await this.expectedInvoiceRepo.createManyInvoices(validInvoices, batch.id);
        stats.downloaded = result.created.length + result.updated.length;

        // Actualizar estadísticas del lote
        await this.expectedInvoiceRepo.updateBatch(batch.id, {
          importedRows: result.created.length,
          skippedRows: result.updated.length + result.unchanged.length,
          errorRows: stats.errors,
        });
      }
    }

    return {
      success: stats.errors === 0,
      sheet: 'esperadas',
      mode,
      stats,
      details,
    };
  }

  /**
   * Sincroniza la sheet de Logs
   */
  private async syncLogs(mode: SyncMode): Promise<SyncResult> {
    const stats = { uploaded: 0, downloaded: 0, conflicts: 0, errors: 0 };
    const details: string[] = [];

    // Para logs, típicamente solo subimos (no hay logs en SQLite para bajar)
    if (mode === 'push' || mode === 'sync') {
      console.info('📤 Los logs se agregan automáticamente en tiempo real');
      details.push('ℹ️  Los logs se sincronizan automáticamente al usar otros servicios de Google');
    }

    if (mode === 'pull') {
      console.info('📥 Bajando logs desde Google Sheets...');
      const googleLogs = await this.googleService.getLogs(100);

      stats.downloaded = googleLogs.length;
      details.push(`ℹ️  Consultados ${googleLogs.length} logs recientes desde Google`);
      details.push('⚠️  Los logs no se almacenan en SQLite local');
    }

    return {
      success: true,
      sheet: 'logs',
      mode,
      stats,
      details,
    };
  }
}

/**
 * Helper para obtener instancia singleton
 */
export function getGoogleSyncService(): GoogleSyncService {
  return GoogleSyncService.getInstance();
}
