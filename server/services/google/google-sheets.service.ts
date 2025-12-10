/**
 * Servicio de Google Sheets
 * Maneja operaciones CRUD en Google Sheets
 */

import { google, sheets_v4 } from 'googleapis';
import { getGoogleAuthClient } from './google-auth.service';
import {
  type EmisoresSheetRow,
  type FacturasSheetRow,
  type FacturasEsperadasSheetRow,
  type LogsSheetRow,
  type GoogleSheetsConfig,
  SheetConverters,
  SHEET_HEADERS,
} from './types';

export class GoogleSheetsService {
  private static instance: GoogleSheetsService;
  private sheets: sheets_v4.Sheets | null = null;
  private config: GoogleSheetsConfig | null = null;

  private constructor() {}

  /**
   * Singleton instance
   */
  public static getInstance(): GoogleSheetsService {
    if (!GoogleSheetsService.instance) {
      GoogleSheetsService.instance = new GoogleSheetsService();
    }
    return GoogleSheetsService.instance;
  }

  /**
   * Inicializa el servicio con la configuración
   */
  public async initialize(config: GoogleSheetsConfig): Promise<void> {
    this.config = config;
    const auth = await getGoogleAuthClient();
    this.sheets = google.sheets({ version: 'v4', auth });
    console.info('✅ Google Sheets service initialized');
  }

  /**
   * Verifica si el servicio está inicializado
   */
  private ensureInitialized(): void {
    if (!this.sheets || !this.config) {
      throw new Error('GoogleSheetsService not initialized. Call initialize() first.');
    }
  }

  // ========== EMISORES ==========

  /**
   * Obtiene todos los emisores
   */
  public async getAllEmisores(): Promise<EmisoresSheetRow[]> {
    this.ensureInitialized();

    const response = await this.sheets!.spreadsheets.values.get({
      spreadsheetId: this.config!.spreadsheetId,
      range: this.config!.sheets.emisores.range,
    });

    const rows = response.data.values || [];

    // Saltar header (primera fila)
    return rows.slice(1).map((row) => SheetConverters.rowToEmisores(row));
  }

  /**
   * Busca emisor por CUIT
   */
  public async getEmisorByCuit(cuit: string): Promise<EmisoresSheetRow | null> {
    const emisores = await this.getAllEmisores();
    return (
      emisores.find((e) => e.cuit === cuit || e.cuitNumerico === cuit.replace(/-/g, '')) || null
    );
  }

  /**
   * Agrega un nuevo emisor
   */
  public async addEmisor(emisor: EmisoresSheetRow): Promise<void> {
    this.ensureInitialized();

    const row = SheetConverters.emisoresToRow(emisor);

    await this.sheets!.spreadsheets.values.append({
      spreadsheetId: this.config!.spreadsheetId,
      range: this.config!.sheets.emisores.range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [row],
      },
    });

    console.info('✅ Emisor agregado:', emisor.cuit);
  }

  /**
   * Actualiza un emisor existente por CUIT
   */
  public async updateEmisor(cuit: string, updates: Partial<EmisoresSheetRow>): Promise<void> {
    this.ensureInitialized();

    const emisores = await this.getAllEmisores();
    const index = emisores.findIndex(
      (e) => e.cuit === cuit || e.cuitNumerico === cuit.replace(/-/g, '')
    );

    if (index === -1) {
      throw new Error(`Emisor con CUIT ${cuit} no encontrado`);
    }

    const updatedEmisor = { ...emisores[index], ...updates };
    const row = SheetConverters.emisoresToRow(updatedEmisor);

    // +2 porque: +1 para header, +1 para convertir de 0-indexed a 1-indexed
    const rowNumber = index + 2;
    const range = `${this.config!.sheets.emisores.name}!A${rowNumber}:J${rowNumber}`;

    await this.sheets!.spreadsheets.values.update({
      spreadsheetId: this.config!.spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [row],
      },
    });

    console.info('✅ Emisor actualizado:', cuit);
  }

  // ========== FACTURAS PROCESADAS ==========

  /**
   * Obtiene todas las facturas procesadas
   */
  public async getAllFacturas(filters?: {
    emisorCuit?: string;
    fechaDesde?: string;
    fechaHasta?: string;
    limit?: number;
  }): Promise<FacturasSheetRow[]> {
    this.ensureInitialized();

    const response = await this.sheets!.spreadsheets.values.get({
      spreadsheetId: this.config!.spreadsheetId,
      range: this.config!.sheets.facturas.range,
    });

    const rows = response.data.values || [];
    let facturas = rows.slice(1).map((row) => SheetConverters.rowToFacturas(row));

    // Aplicar filtros
    if (filters) {
      if (filters.emisorCuit) {
        facturas = facturas.filter((f) => f.emisorCuit === filters.emisorCuit);
      }
      if (filters.fechaDesde) {
        facturas = facturas.filter((f) => f.fechaEmision >= filters.fechaDesde!);
      }
      if (filters.fechaHasta) {
        facturas = facturas.filter((f) => f.fechaEmision <= filters.fechaHasta!);
      }
      if (filters.limit) {
        facturas = facturas.slice(0, filters.limit);
      }
    }

    return facturas;
  }

  /**
   * Busca factura por ID
   */
  public async getFacturaById(id: string): Promise<FacturasSheetRow | null> {
    const facturas = await this.getAllFacturas();
    return facturas.find((f) => f.id === id) || null;
  }

  /**
   * Busca factura exacta por CUIT + tipo + PV + número
   */
  public async findFacturaExacta(
    cuit: string,
    tipo: string,
    puntoVenta: number,
    numero: number
  ): Promise<FacturasSheetRow | null> {
    const facturas = await this.getAllFacturas({ emisorCuit: cuit });
    return (
      facturas.find(
        (f) =>
          f.emisorCuit === cuit &&
          f.tipoComprobante === tipo &&
          f.puntoVenta === puntoVenta &&
          f.numeroComprobante === numero
      ) || null
    );
  }

  /**
   * Agrega una nueva factura procesada
   */
  public async addFactura(factura: FacturasSheetRow): Promise<void> {
    this.ensureInitialized();

    const row = SheetConverters.facturasToRow(factura);

    await this.sheets!.spreadsheets.values.append({
      spreadsheetId: this.config!.spreadsheetId,
      range: this.config!.sheets.facturas.range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [row],
      },
    });

    console.info('✅ Factura agregada:', factura.id);
  }

  /**
   * Actualiza una factura existente por ID
   */
  public async updateFactura(id: string, updates: Partial<FacturasSheetRow>): Promise<void> {
    this.ensureInitialized();

    const facturas = await this.getAllFacturas();
    const index = facturas.findIndex((f) => f.id === id);

    if (index === -1) {
      throw new Error(`Factura con ID ${id} no encontrada`);
    }

    const updatedFactura = { ...facturas[index], ...updates };
    const row = SheetConverters.facturasToRow(updatedFactura);

    const rowNumber = index + 2;
    const range = `${this.config!.sheets.facturas.name}!A${rowNumber}:R${rowNumber}`;

    await this.sheets!.spreadsheets.values.update({
      spreadsheetId: this.config!.spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [row],
      },
    });

    console.info('✅ Factura actualizada:', id);
  }

  // ========== FACTURAS ESPERADAS AFIP ==========

  /**
   * Obtiene todas las facturas esperadas
   */
  public async getAllEsperadas(filters?: {
    cuit?: string;
    status?: string;
    limit?: number;
  }): Promise<FacturasEsperadasSheetRow[]> {
    this.ensureInitialized();

    const response = await this.sheets!.spreadsheets.values.get({
      spreadsheetId: this.config!.spreadsheetId,
      range: this.config!.sheets.esperadas.range,
    });

    const rows = response.data.values || [];
    let esperadas = rows.slice(1).map((row) => SheetConverters.rowToEsperadas(row));

    // Aplicar filtros
    if (filters) {
      if (filters.cuit) {
        esperadas = esperadas.filter((e) => e.cuit === filters.cuit);
      }
      if (filters.status) {
        esperadas = esperadas.filter((e) => e.status === filters.status);
      }
      if (filters.limit) {
        esperadas = esperadas.slice(0, filters.limit);
      }
    }

    return esperadas;
  }

  /**
   * Busca factura esperada exacta por CUIT + tipo + PV + número
   */
  public async findEsperadaExacta(
    cuit: string,
    tipo: string,
    puntoVenta: number,
    numero: number
  ): Promise<FacturasEsperadasSheetRow | null> {
    const esperadas = await this.getAllEsperadas({ cuit });
    return (
      esperadas.find(
        (e) =>
          e.cuit === cuit &&
          e.tipoComprobante === tipo &&
          e.puntoVenta === puntoVenta &&
          e.numeroComprobante === numero
      ) || null
    );
  }

  /**
   * Busca candidatos para matching (CUIT + rango de fecha y total)
   */
  public async findEsperadasCandidatas(
    cuit: string,
    fecha: string, // DD/MM/YYYY
    total: number,
    toleranceDays: number = 7,
    tolerancePercent: number = 10
  ): Promise<FacturasEsperadasSheetRow[]> {
    const esperadas = await this.getAllEsperadas({ cuit, status: 'pending' });

    // Filtrar por rango de fecha y total
    return esperadas.filter((e) => {
      // Comparar fechas (simplificado - asumir formato DD/MM/YYYY)
      const [d1, m1, y1] = fecha.split('/').map(Number);
      const [d2, m2, y2] = e.fechaEmision.split('/').map(Number);
      const date1 = new Date(y1, m1 - 1, d1);
      const date2 = new Date(y2, m2 - 1, d2);

      const daysDiff = Math.abs((date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24));

      // Comparar totales
      const totalDiff = Math.abs(e.total - total);
      const totalPercent = (totalDiff / total) * 100;

      return daysDiff <= toleranceDays && totalPercent <= tolerancePercent;
    });
  }

  /**
   * Agrega facturas esperadas (batch import desde Excel)
   */
  public async addEsperadasBatch(esperadas: FacturasEsperadasSheetRow[]): Promise<void> {
    this.ensureInitialized();

    const rows = esperadas.map((e) => SheetConverters.esperadasToRow(e));

    await this.sheets!.spreadsheets.values.append({
      spreadsheetId: this.config!.spreadsheetId,
      range: this.config!.sheets.esperadas.range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: rows,
      },
    });

    console.info(`✅ ${esperadas.length} facturas esperadas agregadas`);
  }

  /**
   * Actualiza una factura esperada por ID
   */
  public async updateEsperada(
    id: string,
    updates: Partial<FacturasEsperadasSheetRow>
  ): Promise<void> {
    this.ensureInitialized();

    const esperadas = await this.getAllEsperadas();
    const index = esperadas.findIndex((e) => e.id === id);

    if (index === -1) {
      throw new Error(`Factura esperada con ID ${id} no encontrada`);
    }

    const updatedEsperada = { ...esperadas[index], ...updates };
    const row = SheetConverters.esperadasToRow(updatedEsperada);

    const rowNumber = index + 2;
    const range = `${this.config!.sheets.esperadas.name}!A${rowNumber}:N${rowNumber}`;

    await this.sheets!.spreadsheets.values.update({
      spreadsheetId: this.config!.spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [row],
      },
    });

    console.info('✅ Factura esperada actualizada:', id);
  }

  // ========== LOGS ==========

  /**
   * Agrega un log de procesamiento
   */
  public async addLog(log: LogsSheetRow): Promise<void> {
    this.ensureInitialized();

    const row = SheetConverters.logsToRow(log);

    await this.sheets!.spreadsheets.values.append({
      spreadsheetId: this.config!.spreadsheetId,
      range: this.config!.sheets.logs.range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [row],
      },
    });
  }

  /**
   * Obtiene logs recientes
   */
  public async getLogs(limit: number = 100): Promise<LogsSheetRow[]> {
    this.ensureInitialized();

    const response = await this.sheets!.spreadsheets.values.get({
      spreadsheetId: this.config!.spreadsheetId,
      range: this.config!.sheets.logs.range,
    });

    const rows = response.data.values || [];

    // Saltar header y tomar últimos N
    return rows
      .slice(1)
      .slice(-limit)
      .map((row) => ({
        timestamp: String(row[0] || ''),
        tipoEvento: String(row[1] || '') as LogsSheetRow['tipoEvento'],
        archivo: String(row[2] || ''),
        cuit: String(row[3] || ''),
        status: String(row[4] || '') as LogsSheetRow['status'],
        mensaje: String(row[5] || ''),
        usuario: String(row[6] || ''),
      }));
  }

  // ========== UTILIDADES ==========

  /**
   * Inicializa las sheets con headers si están vacías
   */
  public async initializeSheetsWithHeaders(): Promise<void> {
    this.ensureInitialized();

    const sheets = [
      { name: this.config!.sheets.emisores.name, headers: SHEET_HEADERS.emisores },
      { name: this.config!.sheets.facturas.name, headers: SHEET_HEADERS.facturas },
      { name: this.config!.sheets.esperadas.name, headers: SHEET_HEADERS.esperadas },
      { name: this.config!.sheets.logs.name, headers: SHEET_HEADERS.logs },
    ];

    for (const sheet of sheets) {
      try {
        // Verificar si ya tiene datos
        const response = await this.sheets!.spreadsheets.values.get({
          spreadsheetId: this.config!.spreadsheetId,
          range: `${sheet.name}!A1:Z1`,
        });

        if (!response.data.values || response.data.values.length === 0) {
          // Agregar headers
          await this.sheets!.spreadsheets.values.update({
            spreadsheetId: this.config!.spreadsheetId,
            range: `${sheet.name}!A1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
              values: [sheet.headers],
            },
          });

          console.info(`✅ Headers agregados a sheet: ${sheet.name}`);
        }
      } catch (error) {
        console.warn(`⚠️  Error inicializando sheet ${sheet.name}:`, error);
      }
    }
  }

  /**
   * Obtiene estadísticas generales
   */
  public async getStats(): Promise<{
    totalEmisores: number;
    totalFacturas: number;
    totalEsperadas: number;
    esperadasPendientes: number;
    esperadasMatched: number;
  }> {
    const [emisores, facturas, esperadas] = await Promise.all([
      this.getAllEmisores(),
      this.getAllFacturas(),
      this.getAllEsperadas(),
    ]);

    return {
      totalEmisores: emisores.length,
      totalFacturas: facturas.length,
      totalEsperadas: esperadas.length,
      esperadasPendientes: esperadas.filter((e) => e.status === 'pending').length,
      esperadasMatched: esperadas.filter((e) => e.status === 'matched').length,
    };
  }
}

/**
 * Helper para obtener la instancia del servicio
 */
export function getGoogleSheetsService(): GoogleSheetsService {
  return GoogleSheetsService.getInstance();
}
