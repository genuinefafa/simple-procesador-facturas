/**
 * Tipos y interfaces compartidas del sistema
 */

// Tipo de documento
export type DocumentType = 'PDF_DIGITAL' | 'PDF_IMAGEN' | 'IMAGEN';

// Estrategia de extracción
export type ExtractionStrategy = 'REGEX' | 'OCR_ZONES' | 'PDF_TEXT' | 'HYBRID';

// Categoría de template
export type TemplateCategory = 'SOFTWARE_COMERCIAL' | 'AFIP_ELECTRONICA' | 'MANUAL' | 'GENERICO';

// Tipo de persona
export type PersonType = 'FISICA' | 'JURIDICA';

// Tipo de comprobante (facturas argentinas)
export type InvoiceType = 'A' | 'B' | 'C' | 'E' | 'M' | 'X';

// Moneda
export type Currency = 'ARS' | 'USD' | 'EUR';

// Método de extracción usado
export type ExtractionMethod = 'TEMPLATE' | 'GENERICO' | 'MANUAL' | 'PDF_TEXT' | 'OCR';

/**
 * Emisor de facturas
 */
export interface Emitter {
  cuit: string; // Formato: XX-XXXXXXXX-X
  cuitNumeric: string; // Sin guiones
  name: string;
  legalName?: string;
  aliases: string[]; // Nombres cortos/alias del emisor
  templateId?: number; // FK a template preferido
  configOverride?: string; // JSON con ajustes específicos
  personType?: PersonType;
  active: boolean;
  firstInvoiceDate?: Date;
  lastInvoiceDate?: Date;
  totalInvoices: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Template de extracción
 */
export interface ExtractionTemplate {
  id: number;
  name: string;
  description?: string;
  category: TemplateCategory;
  documentType: DocumentType;
  strategy: ExtractionStrategy;
  configExtraction: string; // JSON con configuración
  emittersUsing: number;
  invoicesProcessed: number;
  successfulInvoices: number;
  averageConfidence: number;
  successRate: number; // Calculado
  createdFromEmitterCuit?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Factura procesada
 */
export interface Invoice {
  id: number;
  emitterCuit: string;
  templateUsedId?: number;
  issueDate: Date;
  invoiceType: InvoiceType;
  pointOfSale: number;
  invoiceNumber: number;
  fullInvoiceNumber: string; // "A-0001-00000123"
  total: number;
  currency: Currency;
  originalFile: string;
  processedFile: string;
  fileType: DocumentType;
  extractionMethod: ExtractionMethod;
  extractionConfidence?: number;
  manuallyValidated: boolean;
  requiresReview: boolean;
  processedAt: Date;
}

/**
 * Historial de templates por emisor
 */
export interface EmitterTemplateHistory {
  id: number;
  emitterCuit: string;
  templateId: number;
  attempts: number;
  successes: number;
  failures: number;
  successRate: number; // Calculado
  lastAttempt?: Date;
  promotedToPreferred: boolean;
}

/**
 * Resultado de extracción de datos
 */
export interface ExtractionResult {
  success: boolean;
  confidence: number;
  data: {
    cuit?: string;
    emitterName?: string;
    date?: string;
    invoiceType?: InvoiceType;
    pointOfSale?: number;
    invoiceNumber?: number;
    total?: number;
  };
  errors?: string[];
  method: ExtractionMethod;
  templateUsed?: number;
}

/**
 * Configuración de extracción (JSON)
 */
export interface ExtractionConfig {
  type: DocumentType;
  patterns?: Record<string, PatternConfig>;
  zones?: Record<string, ZoneConfig>;
  layout?: string;
  notes?: string;
}

/**
 * Configuración de patrón regex
 */
export interface PatternConfig {
  regex: string;
  flags?: string;
  groups?: string[];
  zona_pagina?: number;
  formato?: string;
  transformacion?: string;
  confianza?: number;
}

/**
 * Configuración de zona OCR
 */
export interface ZoneConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  preproceso?: string[];
  regex_validacion?: string;
  formato_esperado?: string;
  keywords?: string[];
  busqueda?: string;
  confianza_minima?: number;
}
