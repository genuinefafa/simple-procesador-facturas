/**
 * Contracts for /api/issued-invoices (ARCA "Mis Comprobantes Emitidos").
 */

import * as z from 'zod';
import { dateStringSchema } from './schemas.js';

export const IssuedInvoicesQuerySchema = z.object({
  /** Inclusive, YYYY-MM-DD */
  from: dateStringSchema.optional(),
  /** Inclusive, YYYY-MM-DD */
  to: dateStringSchema.optional(),
});

export type IssuedInvoicesQuery = z.infer<typeof IssuedInvoicesQuerySchema>;
