/**
 * API Contracts - Zod schemas for runtime validation.
 *
 * Usage in endpoints:
 * ```typescript
 * import { InvoicePatchSchema, formatZodError } from '@server/contracts';
 *
 * const result = InvoicePatchSchema.safeParse(body);
 * if (!result.success) {
 *   return json(formatZodError(result.error), { status: 400 });
 * }
 * // result.data is typed as InvoicePatchInput
 * ```
 */

// Shared schemas
export {
  cuitSchema,
  invoiceTypeSchema,
  pointOfSaleSchema,
  invoiceNumberSchema,
  currencySchema,
  dateStringSchema,
  optionalDateSchema,
  amountSchema,
  categoryIdSchema,
  expectedInvoiceIdSchema,
} from './shared';

export type { Cuit, InvoiceType, Currency } from './shared';

// Invoice schemas
export { InvoicePatchSchema, formatZodError } from './invoice';
export type { InvoicePatchInput } from './invoice';

// Expected invoice schemas
export { ExpectedInvoicePatchSchema } from './expected-invoice';
export type { ExpectedInvoicePatchInput } from './expected-invoice';
