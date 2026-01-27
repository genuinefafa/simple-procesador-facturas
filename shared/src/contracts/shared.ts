/**
 * Shared Zod schemas for common types across the API.
 * Following Open/Closed principle: extend these schemas for specific use cases.
 */

import { z } from "zod";

/**
 * CUIT validation schema.
 * Accepts formats: 20-12345678-9, 20123456789, or already normalized.
 */
export const cuitSchema = z
  .string()
  .transform((val) => val.replace(/[-\s]/g, ""))
  .refine((val) => /^\d{11}$/.test(val), {
    message: "CUIT debe tener 11 dígitos",
  });

/**
 * Invoice type schema (AFIP códigos de comprobante).
 * Common types: 1=FA, 6=FB, 11=FC, 2=NCA, 3=NDA, etc.
 */
export const invoiceTypeSchema = z.number().int().min(1).max(999).nullable();

/**
 * Point of sale schema (1-9999).
 */
export const pointOfSaleSchema = z.number().int().min(1).max(9999).nullable();

/**
 * Invoice number schema (1-99999999).
 */
export const invoiceNumberSchema = z
  .number()
  .int()
  .min(1)
  .max(99999999)
  .nullable();

/**
 * Currency schema.
 */
export const currencySchema = z.enum(["ARS", "USD", "EUR"]).default("ARS");

/**
 * Date string schema (YYYY-MM-DD format).
 */
export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha debe tener formato YYYY-MM-DD")
  .or(z.string().datetime())
  .transform((val) => {
    // Normalize datetime to date-only
    if (val.includes("T")) {
      return val.split("T")[0];
    }
    return val;
  });

/**
 * Optional date that accepts empty string as null.
 */
export const optionalDateSchema = z
  .string()
  .transform((val) => (val === "" ? null : val))
  .pipe(dateStringSchema.nullable());

/**
 * Monetary amount schema (positive number, 2 decimal places).
 */
export const amountSchema = z.number().nonnegative().nullable();

/**
 * Category ID schema (references categories table).
 */
export const categoryIdSchema = z.number().int().positive().nullable();

/**
 * Expected invoice ID schema.
 */
export const expectedInvoiceIdSchema = z.number().int().positive().nullable();

// Type exports for consumers
// Note: InvoiceType and Currency are exported from @shared/types (domain.ts)
export type Cuit = z.infer<typeof cuitSchema>;
