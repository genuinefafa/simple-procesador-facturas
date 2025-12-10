/**
 * Servicio de integración con Google Sheets + Drive
 * Wrapper principal que coordina todos los servicios de Google
 */

import { GoogleSheetsService } from './google-sheets.service';
import { GoogleDriveService } from './google-drive.service';
import { isGoogleConfigured } from './google-auth.service';
import {
  FacturasSheetRow,
  EmisoresSheetRow,
  FacturasEsperadasSheetRow,
  LogsSheetRow,
  GoogleSheetsConfig,
  GoogleDriveConfig,
} from './types';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Configuración completa de Google
 */
export interface GoogleConfig {
  enabled: boolean;
  credentialsPath: string;
  sheets: GoogleSheetsConfig;
  drive: GoogleDriveConfig;
}

/**
 * Configuración del proyecto
 */
export interface ProjectConfig {
  google?: GoogleConfig;
  [key: string]: unknown;
}

/**
 * Datos normalizados de una factura procesada
 */
export interface InvoiceData {
  cuit: string;
  fechaEmision: string; // DD/MM/YYYY
  tipoComprobante: string;
  puntoVenta: number;
  numeroComprobante: number;
  total: number;
  moneda: string;
  tipoArchivo: 'PDF_DIGITAL' | 'PDF_IMAGEN' | 'IMAGEN';
  metodoExtraccion: 'TEMPLATE' | 'GENERICO' | 'MANUAL';
  confianzaExtraccion: number;
  validadoManualmente: boolean;
  requiereRevision: boolean;
  archivoOriginal: string; // Path local del archivo
}

export interface SaveInvoiceResult {
  success: boolean;
  invoiceId: string;
  driveFileId?: string;
  driveLink?: string;
  error?: string;
}

export class GoogleIntegrationService {
  private static instance: GoogleIntegrationService;
  private sheetsService: GoogleSheetsService;
  private driveService: GoogleDriveService;
  private initialized: boolean = false;
  private config: GoogleConfig | null = null;

  private constructor() {
    this.sheetsService = GoogleSheetsService.getInstance();
    this.driveService = GoogleDriveService.getInstance();
  }

  /**
   * Singleton instance
   */
  public static getInstance(): GoogleIntegrationService {
    if (!GoogleIntegrationService.instance) {
      GoogleIntegrationService.instance = new GoogleIntegrationService();
    }
    return GoogleIntegrationService.instance;
  }

  /**
   * Inicializa el servicio con la configuración del config.json
   */
  public async initialize(config: ProjectConfig): Promise<void> {
    if (!config.google || !config.google.enabled) {
      console.info('ℹ️  Google integration disabled in config');
      return;
    }

    if (!isGoogleConfigured()) {
      console.warn('⚠️  Google credentials not found. Google integration will be disabled.');
      return;
    }

    this.config = config.google;

    try {
      // Inicializar servicios
      await this.sheetsService.initialize(this.config.sheets);
      await this.driveService.initialize(this.config.drive);

      // Verificar estructura de Drive
      await this.driveService.initializeFolderStructure();

      // Inicializar headers de sheets si es necesario
      await this.sheetsService.initializeSheetsWithHeaders();

      this.initialized = true;
      console.info('✅ Google Integration Service initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing Google Integration Service:', error);
      throw error;
    }
  }

  /**
   * Verifica si el servicio está habilitado e inicializado
   */
  public isEnabled(): boolean {
    return this.initialized;
  }

  // ========== OPERACIONES DE FACTURAS ==========

  /**
   * Guarda una factura procesada en Google Sheets + Drive
   */
  public async saveInvoice(data: InvoiceData): Promise<SaveInvoiceResult> {
    if (!this.initialized) {
      return { success: false, invoiceId: '', error: 'Google integration not initialized' };
    }

    try {
      // 1. Generar ID único para la factura
      const invoiceId = this.generateInvoiceId(data);

      // 2. Calcular hash del archivo
      const fileHash = await this.calculateFileHash(data.archivoOriginal);

      // 3. Subir archivo a Google Drive
      const uploadResult = await this.driveService.uploadFile({
        fileName: path.basename(data.archivoOriginal),
        filePath: data.archivoOriginal,
        mimeType: this.getMimeType(data.archivoOriginal),
        cuit: data.cuit,
        tipo: 'original',
      });

      // 4. Crear fila para Google Sheets
      const facturaRow: FacturasSheetRow = {
        id: invoiceId,
        emisorCuit: data.cuit,
        fechaEmision: data.fechaEmision,
        tipoComprobante: data.tipoComprobante,
        puntoVenta: data.puntoVenta,
        numeroComprobante: data.numeroComprobante,
        total: data.total,
        moneda: data.moneda,
        archivoDriveId: uploadResult.fileId,
        archivoLink: uploadResult.webViewLink,
        tipoArchivo: data.tipoArchivo,
        metodoExtraccion: data.metodoExtraccion,
        confianzaExtraccion: data.confianzaExtraccion,
        validadoManualmente: data.validadoManualmente,
        requiereRevision: data.requiereRevision,
        fileHash: fileHash,
        procesadoEn: new Date().toISOString(),
      };

      // 5. Guardar en Google Sheets
      await this.sheetsService.addFactura(facturaRow);

      // 6. Log de éxito
      await this.addLog({
        timestamp: new Date().toISOString(),
        tipoEvento: 'PROCESS',
        archivo: path.basename(data.archivoOriginal),
        cuit: data.cuit,
        status: 'SUCCESS',
        mensaje: `Factura ${data.tipoComprobante}-${data.puntoVenta}-${data.numeroComprobante} procesada`,
        usuario: 'system',
      });

      return {
        success: true,
        invoiceId: invoiceId,
        driveFileId: uploadResult.fileId,
        driveLink: uploadResult.webViewLink,
      };
    } catch (error) {
      console.error('Error guardando factura en Google:', error);

      // Log de error
      await this.addLog({
        timestamp: new Date().toISOString(),
        tipoEvento: 'ERROR',
        archivo: path.basename(data.archivoOriginal),
        cuit: data.cuit,
        status: 'ERROR',
        mensaje: `Error: ${String(error)}`,
        usuario: 'system',
      });

      return {
        success: false,
        invoiceId: '',
        error: String(error),
      };
    }
  }

  /**
   * Busca si existe una factura con los mismos datos
   */
  public async findExistingInvoice(
    cuit: string,
    tipo: string,
    puntoVenta: number,
    numero: number
  ): Promise<FacturasSheetRow | null> {
    if (!this.initialized) {
      return null;
    }

    return await this.sheetsService.findFacturaExacta(cuit, tipo, puntoVenta, numero);
  }

  /**
   * Obtiene todas las facturas de un emisor
   */
  public async getInvoicesByEmisor(cuit: string): Promise<FacturasSheetRow[]> {
    if (!this.initialized) {
      return [];
    }

    return await this.sheetsService.getAllFacturas({ emisorCuit: cuit });
  }

  // ========== OPERACIONES DE EMISORES ==========

  /**
   * Obtiene o crea un emisor
   */
  public async getOrCreateEmisor(cuit: string, nombre?: string): Promise<EmisoresSheetRow> {
    if (!this.initialized) {
      throw new Error('Google integration not initialized');
    }

    // Buscar emisor existente
    let emisor = await this.sheetsService.getEmisorByCuit(cuit);

    if (!emisor) {
      // Crear nuevo emisor
      const cuitNumerico = cuit.replace(/-/g, '');
      emisor = {
        cuit,
        cuitNumerico,
        nombre: nombre || '',
        razonSocial: nombre || '',
        aliases: '[]',
        templatePreferido: '',
        tipoPersona: 'JURIDICA',
        totalFacturas: 0,
        primeraFactura: '',
        ultimaFactura: '',
      };

      await this.sheetsService.addEmisor(emisor);
      console.info(`✅ Emisor creado: ${cuit}`);
    }

    return emisor;
  }

  /**
   * Actualiza estadísticas de un emisor
   */
  public async updateEmisorStats(cuit: string): Promise<void> {
    if (!this.initialized) {
      return;
    }

    const facturas = await this.sheetsService.getAllFacturas({ emisorCuit: cuit });

    if (facturas.length === 0) {
      return;
    }

    // Ordenar por fecha
    facturas.sort((a, b) => a.fechaEmision.localeCompare(b.fechaEmision));

    await this.sheetsService.updateEmisor(cuit, {
      totalFacturas: facturas.length,
      primeraFactura: facturas[0].fechaEmision,
      ultimaFactura: facturas[facturas.length - 1].fechaEmision,
    });
  }

  // ========== MATCHING CON FACTURAS ESPERADAS ==========

  /**
   * Busca match exacto en facturas esperadas
   */
  public async findExpectedInvoiceMatch(
    cuit: string,
    tipo: string,
    puntoVenta: number,
    numero: number
  ): Promise<FacturasEsperadasSheetRow | null> {
    if (!this.initialized) {
      return null;
    }

    return await this.sheetsService.findEsperadaExacta(cuit, tipo, puntoVenta, numero);
  }

  /**
   * Busca candidatos para matching
   */
  public async findExpectedInvoiceCandidates(
    cuit: string,
    fecha: string,
    total: number
  ): Promise<FacturasEsperadasSheetRow[]> {
    if (!this.initialized) {
      return [];
    }

    return await this.sheetsService.findEsperadasCandidatas(cuit, fecha, total);
  }

  /**
   * Marca una factura esperada como matched
   */
  public async markExpectedInvoiceAsMatched(
    expectedInvoiceId: string,
    matchedInvoiceId: string,
    confidence: number
  ): Promise<void> {
    if (!this.initialized) {
      return;
    }

    await this.sheetsService.updateEsperada(expectedInvoiceId, {
      status: 'matched',
      idFacturaMatched: matchedInvoiceId,
      confianzaMatch: confidence,
    });
  }

  // ========== IMPORTACIÓN DE EXCEL AFIP ==========

  /**
   * Importa facturas esperadas desde un array de datos
   */
  public async importExpectedInvoices(
    invoices: Array<{
      cuit: string;
      nombreEmisor: string;
      fechaEmision: string;
      tipoComprobante: string;
      puntoVenta: number;
      numeroComprobante: number;
      total: number;
      cae?: string;
    }>,
    loteId: string
  ): Promise<void> {
    if (!this.initialized) {
      throw new Error('Google integration not initialized');
    }

    const esperadas: FacturasEsperadasSheetRow[] = invoices.map((inv) => ({
      id: `ESP-${loteId}-${inv.cuit}-${inv.tipoComprobante}-${inv.puntoVenta}-${inv.numeroComprobante}`,
      loteImportacion: loteId,
      cuit: inv.cuit,
      nombreEmisor: inv.nombreEmisor,
      fechaEmision: inv.fechaEmision,
      tipoComprobante: inv.tipoComprobante,
      puntoVenta: inv.puntoVenta,
      numeroComprobante: inv.numeroComprobante,
      total: inv.total,
      cae: inv.cae || '',
      status: 'pending',
      idFacturaMatched: '',
      confianzaMatch: 0,
      notas: '',
    }));

    await this.sheetsService.addEsperadasBatch(esperadas);

    // Log
    await this.addLog({
      timestamp: new Date().toISOString(),
      tipoEvento: 'IMPORT',
      archivo: `Lote ${loteId}`,
      cuit: '',
      status: 'SUCCESS',
      mensaje: `${invoices.length} facturas esperadas importadas`,
      usuario: 'system',
    });
  }

  // ========== LOGS ==========

  /**
   * Agrega un log
   */
  public async addLog(log: LogsSheetRow): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      await this.sheetsService.addLog(log);
    } catch (error) {
      console.error('Error agregando log:', error);
    }
  }

  /**
   * Obtiene logs recientes
   */
  public async getLogs(limit: number = 100): Promise<LogsSheetRow[]> {
    if (!this.initialized) {
      return [];
    }

    return await this.sheetsService.getLogs(limit);
  }

  // ========== ESTADÍSTICAS ==========

  /**
   * Obtiene estadísticas generales
   */
  public async getStats(): Promise<{
    totalEmisores: number;
    totalFacturas: number;
    totalEsperadas: number;
    esperadasPendientes: number;
    esperadasMatched: number;
  } | null> {
    if (!this.initialized) {
      return null;
    }

    return await this.sheetsService.getStats();
  }

  // ========== UTILIDADES PRIVADAS ==========

  /**
   * Genera un ID único para una factura
   */
  private generateInvoiceId(data: InvoiceData): string {
    return `FAC-${data.cuit}-${data.tipoComprobante}-${data.puntoVenta.toString().padStart(4, '0')}-${data.numeroComprobante.toString().padStart(8, '0')}`;
  }

  /**
   * Calcula el hash SHA256 de un archivo
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Obtiene el MIME type de un archivo
   */
  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();

    const mimeTypes: { [key: string]: string } = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.tiff': 'image/tiff',
      '.tif': 'image/tiff',
      '.webp': 'image/webp',
      '.heic': 'image/heic',
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }
}

/**
 * Helper para obtener la instancia del servicio
 */
export function getGoogleIntegrationService(): GoogleIntegrationService {
  return GoogleIntegrationService.getInstance();
}
