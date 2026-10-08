/**
 * Server contracts - Zod schemas for API validation.
 *
 * @example
 * import { InvoicePatchSchema, formatZodError } from '@server/contracts';
 */

// Schemas
export {
  // Domain schemas
  cuitSchema,
  invoiceTypeSchema,
  pointOfSaleSchema,
  invoiceNumberSchema,
  dateStringSchema,
  optionalDateSchema,
  amountSchema,
  categoryIdSchema,
  expectedInvoiceIdSchema,
  // API schemas
  InvoicePatchSchema,
  ExpectedInvoicePatchSchema,
  // Balance group schemas
  BalanceGroupAddSchema,
  BalanceGroupSetPrincipalSchema,
  BalanceGroupMemberSchema,
  BalanceGroupResponseSchema,
  QrPasteSchema,
  EmitterFilesRenameSchema,
} from './schemas.js';

export type {
  InvoicePatchInput,
  ExpectedInvoicePatchInput,
  BalanceGroupAddInput,
  BalanceGroupSetPrincipalInput,
  BalanceGroupMember,
  BalanceGroupResponse,
  QrPasteInput,
  EmitterFilesRenameInput,
} from './schemas.js';

// Utilities
export { formatZodError } from './utils.js';

// Stats (dashboard)
export { StatsQuerySchema, periodSchema, periodToRange } from './stats.js';
export type { StatsQueryInput, PeriodRange } from './stats.js';

// Invoice tax breakdown (#190)
export {
  TaxLineSchema,
  makeTaxLinesBodySchema,
  checkTaxLinesSum,
  TAX_LINES_SUM_TOLERANCE,
  TAX_LINE_CONCEPTS,
  TAX_LINE_RATES,
} from './invoice-tax-lines.js';
export type {
  TaxLine,
  TaxLineInput,
  TaxLineConcept,
  TaxLinesBody,
  TaxLinesSumCheck,
} from './invoice-tax-lines.js';
