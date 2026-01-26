/**
 * Types for InvoiceCard component.
 * Follows Interface Segregation Principle - separate types for different use cases.
 */

/** Emitter information for combobox selection */
export type Emitter = {
  id?: number;
  name: string;
  displayName: string;
  cuit: string;
  cuitNumeric?: string;
  legalName?: string;
  aliases?: string[];
};

/** Category for invoice classification */
export type Category = {
  id: number;
  key: string;
  description: string;
};

/**
 * Base invoice fields - shared between view and create modes
 */
export interface InvoiceFieldsBase {
  cuit: string;
  emitterName?: string | null;
  issueDate: string | null;
  invoiceType: number | null;
  pointOfSale: number | null;
  invoiceNumber: number | null;
  total?: number | null;
  categoryId?: number | null;
}

/**
 * Invoice data for VIEW mode - requires ID (existing invoice)
 */
export interface InvoiceViewData extends InvoiceFieldsBase {
  id: number;
}

/**
 * Invoice data for CREATE mode - ID is optional/absent
 */
export interface InvoiceCreateData extends InvoiceFieldsBase {
  id?: never;
}

/**
 * Union type for invoice prop
 */
export type InvoiceData = InvoiceViewData | InvoiceCreateData;

/**
 * Data structure returned by onsave callback
 */
export interface InvoiceSaveData {
  cuit: string;
  invoiceType: number | null;
  pointOfSale: number | null;
  invoiceNumber: number | null;
  issueDate: string;
  total: number | null;
  categoryId: number | null;
  emitterId?: number;
}

/**
 * Props for InvoiceCard in VIEW mode
 */
export interface InvoiceCardViewProps {
  invoice: InvoiceViewData;
  categories?: Category[];
  mode?: 'view';
  onsave?: (data: InvoiceSaveData) => void;
  ondelete?: () => void;
  saving?: boolean;
}

/**
 * Props for InvoiceCard in CREATE mode
 */
export interface InvoiceCardCreateProps {
  invoice: InvoiceCreateData;
  categories?: Category[];
  mode: 'create';
  onsave?: (data: InvoiceSaveData) => void;
  oncancel?: () => void;
  saving?: boolean;
}

/**
 * Union type for all InvoiceCard props
 */
export type InvoiceCardProps = InvoiceCardViewProps | InvoiceCardCreateProps;
