/**
 * Tipos TypeScript para Google Sheets
 * Mapeo de las columnas de cada sheet a interfaces tipadas
 */

/**
 * Sheet: "Emisores"
 * Almacena información de los emisores de facturas
 */
export interface EmisoresSheetRow {
  cuit: string; // Formato XX-XXXXXXXX-X
  cuitNumerico: string; // Sin guiones
  nombre: string;
  razonSocial: string;
  aliases: string; // JSON array stringified
  templatePreferido: string;
  tipoPersona: 'FISICA' | 'JURIDICA';
  totalFacturas: number;
  primeraFactura: string; // ISO date
  ultimaFactura: string; // ISO date
}

/**
 * Sheet: "Facturas Procesadas"
 * Almacena todas las facturas extraídas de archivos
 */
export interface FacturasSheetRow {
  id: string;
  emisorCuit: string;
  fechaEmision: string; // DD/MM/YYYY
  tipoComprobante: string; // A/B/C/E/M/X
  puntoVenta: number;
  numeroComprobante: number;
  total: number;
  moneda: string; // ARS/USD/EUR
  archivoDriveId: string; // Google Drive file ID
  archivoLink: string; // Direct link to file in Drive
  tipoArchivo: 'PDF_DIGITAL' | 'PDF_IMAGEN' | 'IMAGEN';
  metodoExtraccion: 'TEMPLATE' | 'GENERICO' | 'MANUAL';
  confianzaExtraccion: number; // 0-100
  validadoManualmente: boolean;
  requiereRevision: boolean;
  fileHash: string;
  procesadoEn: string; // ISO timestamp
}

/**
 * Sheet: "Facturas Esperadas AFIP"
 * Importadas desde Excel AFIP, para matching con archivos procesados
 */
export interface FacturasEsperadasSheetRow {
  id: string;
  loteImportacion: string;
  cuit: string;
  nombreEmisor: string;
  fechaEmision: string; // DD/MM/YYYY
  tipoComprobante: string;
  puntoVenta: number;
  numeroComprobante: number;
  total: number;
  cae: string;
  status: 'pending' | 'matched' | 'discrepancy' | 'manual' | 'ignored';
  idFacturaMatched: string; // ID de la factura en "Facturas Procesadas"
  confianzaMatch: number; // 0-100
  notas: string;
}

/**
 * Sheet: "Logs de Procesamiento"
 * Auditoría de operaciones
 */
export interface LogsSheetRow {
  timestamp: string; // ISO timestamp
  tipoEvento: 'UPLOAD' | 'PROCESS' | 'MATCH' | 'ERROR' | 'IMPORT';
  archivo: string;
  cuit: string;
  status: 'SUCCESS' | 'ERROR' | 'WARNING';
  mensaje: string;
  usuario: string;
}

/**
 * Configuración de Google Sheets
 */
export interface GoogleSheetsConfig {
  spreadsheetId: string;
  sheets: {
    emisores: {
      name: string;
      range: string; // e.g., "Emisores!A:J"
    };
    facturas: {
      name: string;
      range: string; // e.g., "Facturas Procesadas!A:R"
    };
    esperadas: {
      name: string;
      range: string; // e.g., "Facturas Esperadas AFIP!A:M"
    };
    logs: {
      name: string;
      range: string; // e.g., "Logs de Procesamiento!A:G"
    };
  };
}

/**
 * Configuración de Google Drive
 */
export interface GoogleDriveConfig {
  rootFolderId: string; // ID de la carpeta raíz "Facturas"
  folderStructure: {
    originales: string; // Sufijo para carpetas de originales
    procesados: string; // Sufijo para carpetas de procesados
  };
}

/**
 * Headers de las columnas para cada sheet
 */
export const SHEET_HEADERS = {
  emisores: [
    'CUIT',
    'CUIT Numérico',
    'Nombre',
    'Razón Social',
    'Aliases (JSON)',
    'Template Preferido',
    'Tipo Persona',
    'Total Facturas',
    'Primera Factura',
    'Última Factura',
  ],
  facturas: [
    'ID',
    'Emisor CUIT',
    'Fecha Emisión',
    'Tipo',
    'PV',
    'Número',
    'Total',
    'Moneda',
    'Archivo Drive ID',
    'Archivo Link',
    'Tipo Archivo',
    'Método Extracción',
    'Confianza',
    'Validado',
    'Requiere Revisión',
    'Hash',
    'Procesado En',
  ],
  esperadas: [
    'ID',
    'Lote Importación',
    'CUIT',
    'Nombre Emisor',
    'Fecha Emisión',
    'Tipo',
    'PV',
    'Número',
    'Total',
    'CAE',
    'Status',
    'ID Factura Matched',
    'Confianza Match',
    'Notas',
  ],
  logs: ['Timestamp', 'Tipo Evento', 'Archivo', 'CUIT', 'Status', 'Mensaje', 'Usuario'],
} as const;

/**
 * Helpers para convertir entre formatos
 */
export class SheetConverters {
  /**
   * Convierte una fila de sheet a objeto tipado
   */
  static rowToEmisores(row: unknown[]): EmisoresSheetRow {
    return {
      cuit: row[0] || '',
      cuitNumerico: row[1] || '',
      nombre: row[2] || '',
      razonSocial: row[3] || '',
      aliases: row[4] || '[]',
      templatePreferido: row[5] || '',
      tipoPersona: (row[6] as 'FISICA' | 'JURIDICA') || 'JURIDICA',
      totalFacturas: Number(row[7]) || 0,
      primeraFactura: row[8] || '',
      ultimaFactura: row[9] || '',
    };
  }

  static rowToFacturas(row: unknown[]): FacturasSheetRow {
    return {
      id: row[0] || '',
      emisorCuit: row[1] || '',
      fechaEmision: row[2] || '',
      tipoComprobante: row[3] || '',
      puntoVenta: Number(row[4]) || 0,
      numeroComprobante: Number(row[5]) || 0,
      total: Number(row[6]) || 0,
      moneda: row[7] || 'ARS',
      archivoDriveId: row[8] || '',
      archivoLink: row[9] || '',
      tipoArchivo: (String(row[10]) || 'PDF_DIGITAL') as 'PDF_DIGITAL' | 'PDF_IMAGEN' | 'IMAGEN',
      metodoExtraccion: (String(row[11]) || 'GENERICO') as 'TEMPLATE' | 'GENERICO' | 'MANUAL',
      confianzaExtraccion: Number(row[12]) || 0,
      validadoManualmente: row[13] === 'TRUE' || row[13] === true,
      requiereRevision: row[14] === 'TRUE' || row[14] === true,
      fileHash: row[15] || '',
      procesadoEn: row[16] || '',
    };
  }

  static rowToEsperadas(row: unknown[]): FacturasEsperadasSheetRow {
    return {
      id: row[0] || '',
      loteImportacion: row[1] || '',
      cuit: row[2] || '',
      nombreEmisor: row[3] || '',
      fechaEmision: row[4] || '',
      tipoComprobante: row[5] || '',
      puntoVenta: Number(row[6]) || 0,
      numeroComprobante: Number(row[7]) || 0,
      total: Number(row[8]) || 0,
      cae: row[9] || '',
      status: (String(row[10]) || 'pending') as
        | 'pending'
        | 'matched'
        | 'discrepancy'
        | 'manual'
        | 'ignored',
      idFacturaMatched: row[11] || '',
      confianzaMatch: Number(row[12]) || 0,
      notas: row[13] || '',
    };
  }

  /**
   * Convierte objeto tipado a array para insertar en sheet
   */
  static emisoresToRow(emisor: EmisoresSheetRow): any[] {
    return [
      emisor.cuit,
      emisor.cuitNumerico,
      emisor.nombre,
      emisor.razonSocial,
      emisor.aliases,
      emisor.templatePreferido,
      emisor.tipoPersona,
      emisor.totalFacturas,
      emisor.primeraFactura,
      emisor.ultimaFactura,
    ];
  }

  static facturasToRow(factura: FacturasSheetRow): any[] {
    return [
      factura.id,
      factura.emisorCuit,
      factura.fechaEmision,
      factura.tipoComprobante,
      factura.puntoVenta,
      factura.numeroComprobante,
      factura.total,
      factura.moneda,
      factura.archivoDriveId,
      factura.archivoLink,
      factura.tipoArchivo,
      factura.metodoExtraccion,
      factura.confianzaExtraccion,
      factura.validadoManualmente,
      factura.requiereRevision,
      factura.fileHash,
      factura.procesadoEn,
    ];
  }

  static esperadasToRow(esperada: FacturasEsperadasSheetRow): any[] {
    return [
      esperada.id,
      esperada.loteImportacion,
      esperada.cuit,
      esperada.nombreEmisor,
      esperada.fechaEmision,
      esperada.tipoComprobante,
      esperada.puntoVenta,
      esperada.numeroComprobante,
      esperada.total,
      esperada.cae,
      esperada.status,
      esperada.idFacturaMatched,
      esperada.confianzaMatch,
      esperada.notas,
    ];
  }

  static logsToRow(log: LogsSheetRow): any[] {
    return [
      log.timestamp,
      log.tipoEvento,
      log.archivo,
      log.cuit,
      log.status,
      log.mensaje,
      log.usuario,
    ];
  }
}
