/**
 * Zod schemas for API validation.
 * These are server-only contracts for HTTP endpoints.
 */

import { z } from 'zod';

// =============================================================================
// Domain Schemas (reusable validation rules)
// =============================================================================

/**
 * CUIT validation schema.
 * Accepts formats: 20-12345678-9, 20123456789, or already normalized.
 */
export const cuitSchema = z
  .string()
  .transform((val) => val.replace(/[-\s]/g, ''))
  .refine((val) => /^\d{11}$/.test(val), {
    message: 'CUIT debe tener 11 dígitos',
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
export const invoiceNumberSchema = z.number().int().min(1).max(99999999).nullable();

/**
 * Date string schema (YYYY-MM-DD format).
 */
export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha debe tener formato YYYY-MM-DD')
  .or(z.string().datetime())
  .transform((val) => {
    // Normalize datetime to date-only
    if (val.includes('T')) {
      return val.split('T')[0];
    }
    return val;
  });

/**
 * Optional date that accepts empty string as null.
 */
export const optionalDateSchema = z
  .string()
  .transform((val) => (val === '' ? null : val))
  .pipe(dateStringSchema.nullable());

/**
 * Monetary amount schema (positive number).
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

// =============================================================================
// API Endpoint Schemas
// =============================================================================

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
    message: 'Al menos un campo debe ser proporcionado para actualizar',
  });

export type InvoicePatchInput = z.infer<typeof InvoicePatchSchema>;

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
    message: 'Al menos un campo debe ser proporcionado para actualizar',
  });

export type ExpectedInvoicePatchInput = z.infer<typeof ExpectedInvoicePatchSchema>;
