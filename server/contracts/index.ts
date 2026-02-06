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
} from './schemas.js';

export type {
  InvoicePatchInput,
  ExpectedInvoicePatchInput,
  BalanceGroupAddInput,
  BalanceGroupSetPrincipalInput,
  BalanceGroupMember,
  BalanceGroupResponse,
} from './schemas.js';

// Utilities
export { formatZodError } from './utils.js';
