/**
 * Shared types - Re-exports all domain types
 */
export type {
  DocumentType,
  ExtractionStrategy,
  TemplateCategory,
  PersonType,
  InvoiceType,
  Currency,
  ExtractionMethod,
  DocumentKind,
  Emitter,
  ExtractionTemplate,
  Invoice,
  EmitterTemplateHistory,
  ExtractionResult,
  ExtractionConfig,
  PatternConfig,
  ZoneConfig,
} from "./domain.js";

// Comprobante types (UI/API DTOs)
export type {
  Final,
  Expected,
  FileData,
  Match,
  Comprobante,
} from "./comprobante.js";
