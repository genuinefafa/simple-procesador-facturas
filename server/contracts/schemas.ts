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

// =============================================================================
// Balance Group Schemas
// =============================================================================

/**
 * Schema for POST /api/expected-invoices/:id/balance
 * Adds an expected invoice to the balance group
 */
export const BalanceGroupAddSchema = z.object({
  /** ID of the expected invoice to add to the group */
  expectedId: z.number().int().positive({
    message: 'ID del expected invoice es requerido',
  }),
});

export type BalanceGroupAddInput = z.infer<typeof BalanceGroupAddSchema>;

/**
 * Schema for PATCH /api/expected-invoices/:id/balance
 * Changes the principal of a balance group
 */
export const BalanceGroupSetPrincipalSchema = z.object({
  /** ID of the expected invoice that will become the new principal */
  newPrincipalId: z.number().int().positive({
    message: 'ID del nuevo principal es requerido',
  }),
});

export type BalanceGroupSetPrincipalInput = z.infer<typeof BalanceGroupSetPrincipalSchema>;

/**
 * Balance group member info returned by API
 */
export const BalanceGroupMemberSchema = z.object({
  id: z.number(),
  cuit: z.string(),
  emitterName: z.string().nullable(),
  invoiceType: z.number().nullable(),
  pointOfSale: z.number(),
  invoiceNumber: z.number(),
  total: z.number().nullable(),
  issueDate: z.string(),
  isPrincipal: z.boolean(),
});

export type BalanceGroupMember = z.infer<typeof BalanceGroupMemberSchema>;

/**
 * Balance group response from GET/POST endpoints
 */
export const BalanceGroupResponseSchema = z.object({
  /** ID of the principal (group ID) */
  principalId: z.number(),
  /** All members including principal */
  members: z.array(BalanceGroupMemberSchema),
  /** Sum of all totals */
  total: z.number(),
  /** True if |total| <= $10 */
  isBalanced: z.boolean(),
});

export type BalanceGroupResponse = z.infer<typeof BalanceGroupResponseSchema>;

// =============================================================================
// QR Paste (fallback manual cuando el scanner automático falla)
// =============================================================================

export const QrPasteSchema = z.object({
  qrUrl: z.string().trim().min(1, 'URL requerida').max(2048, 'URL demasiado larga'),
});

export type QrPasteInput = z.infer<typeof QrPasteSchema>;

// =============================================================================
// Emitter Files Rename
// =============================================================================

/**
 * Schema for POST /api/emisores/:id/archivos/rename
 * Triggers a batch rename to canonical paths for the given invoice IDs.
 */
export const EmitterFilesRenameSchema = z.object({
  invoiceIds: z
    .array(z.number().int().positive({ message: 'ID de factura inválido' }))
    .min(1, 'Se requiere al menos un ID de factura'),
});

export type EmitterFilesRenameInput = z.infer<typeof EmitterFilesRenameSchema>;
