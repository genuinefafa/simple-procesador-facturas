/**
 * API Contracts - Zod schemas for runtime validation.
 *
 * Usage in endpoints:
 * ```typescript
 * import { InvoicePatchSchema, formatZodError } from '@shared/contracts';
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
} from "./shared.js";

export type { Cuit, InvoiceType, Currency } from "./shared.js";

// Invoice schemas
export { InvoicePatchSchema, formatZodError } from "./invoice.js";
export type { InvoicePatchInput } from "./invoice.js";

// Expected invoice schemas
export { ExpectedInvoicePatchSchema } from "./expected-invoice.js";
export type { ExpectedInvoicePatchInput } from "./expected-invoice.js";
