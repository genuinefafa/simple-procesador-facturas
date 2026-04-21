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
