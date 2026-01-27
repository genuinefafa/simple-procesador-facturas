/**
 * Zod schemas for Expected Invoice API endpoints.
 */

import { z } from "zod";
import { categoryIdSchema, amountSchema } from "./shared.js";

/**
 * Schema for PATCH /api/expected-invoices/:id
 */
export const ExpectedInvoicePatchSchema = z
  .object({
    /** Category ID (null to unset) */
    categoryId: categoryIdSchema.optional(),

    /** Notes/comments */
    notes: z.string().max(1000).nullable().optional(),

    /** Emitter name override */
    emitterName: z.string().max(255).nullable().optional(),

    /** Total amount override */
    total: amountSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Al menos un campo debe ser proporcionado para actualizar",
  });

export type ExpectedInvoicePatchInput = z.infer<
  typeof ExpectedInvoicePatchSchema
>;
