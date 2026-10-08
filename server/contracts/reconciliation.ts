/**
 * Contracts for the invoice vs ARCA reconciliation endpoints (#191).
 */

import * as z from 'zod';
import { periodSchema } from './stats.js';

export const ReconciliationListQuerySchema = z.object({
  period: periodSchema,
});

export const CompleteFromArcaBodySchema = z.object({
  invoiceIds: z
    .array(z.number().int().positive())
    .min(1, 'Indique al menos un comprobante')
    .max(500, 'Máximo 500 comprobantes por operación')
    .transform((ids) => [...new Set(ids)]),
});

export const ArcaFingerprintBodySchema = z.object({
  arcaFingerprint: z.string().min(1, 'Falta la huella de ARCA').max(2000),
});

export const AcceptDifferenceBodySchema = ArcaFingerprintBodySchema.extend({
  note: z.string().trim().max(500, 'La nota admite hasta 500 caracteres').nullish(),
});

export type CompleteFromArcaBody = z.output<typeof CompleteFromArcaBodySchema>;
export type ArcaFingerprintBody = z.output<typeof ArcaFingerprintBodySchema>;
export type AcceptDifferenceBody = z.output<typeof AcceptDifferenceBodySchema>;
