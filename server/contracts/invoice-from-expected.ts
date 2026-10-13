/**
 * Contract for creating an invoice from an ARCA expected invoice + a file.
 * ARCA is the frame; the only editable part is the detail of "otros tributos".
 */

import * as z from 'zod';
import { TaxLineSchema, TAX_LINES_MAX, TAX_LINE_LABEL_CONCEPTS } from './invoice-tax-lines';

export const CreateInvoiceFromExpectedSchema = z
  .object({
    fileId: z.number().int().positive(),
    categoryId: z.number().int().positive().nullable().optional(),
    otherTaxLines: z.array(TaxLineSchema).max(TAX_LINES_MAX).optional(),
  })
  .refine(
    (body) => (body.otherTaxLines ?? []).every((l) => TAX_LINE_LABEL_CONCEPTS.includes(l.concept)),
    {
      path: ['otherTaxLines'],
      message:
        'El detalle de otros tributos solo admite percepciones de IVA, IIBB u otros tributos',
    }
  );

export type CreateInvoiceFromExpectedInput = z.infer<typeof CreateInvoiceFromExpectedSchema>;
