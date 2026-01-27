/**
 * Zod schemas for Invoice API endpoints.
 * Used for runtime validation at API boundaries.
 */

import { z } from "zod";
import {
  cuitSchema,
  invoiceTypeSchema,
  pointOfSaleSchema,
  invoiceNumberSchema,
  amountSchema,
  categoryIdSchema,
  expectedInvoiceIdSchema,
  optionalDateSchema,
} from "./shared.js";

/**
 * Schema for PATCH /api/invoices/:id
 * All fields are optional - only provided fields are updated.
 */
export const InvoicePatchSchema = z
  .object({
    /** Emitter CUIT (will be validated against emitters table) */
    emitterCuit: cuitSchema.optional(),

    /** Invoice type code */
    invoiceType: invoiceTypeSchema.optional(),

    /** Point of sale number */
    pointOfSale: pointOfSaleSchema.optional(),

    /** Invoice number */
    invoiceNumber: invoiceNumberSchema.optional(),

    /** Issue date (YYYY-MM-DD) */
    issueDate: optionalDateSchema.optional(),

    /** Total amount */
    total: amountSchema.optional(),

    /** Category ID (null to unset) */
    categoryId: categoryIdSchema.optional(),

    /** Link to expected invoice (null to unlink) */
    expectedInvoiceId: expectedInvoiceIdSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Al menos un campo debe ser proporcionado para actualizar",
  });

export type InvoicePatchInput = z.infer<typeof InvoicePatchSchema>;

/**
 * Helper to format Zod errors for API response.
 */
export function formatZodError(error: z.ZodError): {
  error: string;
  details: Record<string, string[]>;
} {
  const details: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_root";
    if (!details[path]) {
      details[path] = [];
    }
    details[path].push(issue.message);
  }

  return {
    error: "Validación fallida",
    details,
  };
}
