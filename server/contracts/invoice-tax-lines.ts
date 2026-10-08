/**
 * Contracts for the invoice tax breakdown (#190, silver layer).
 *
 * Credit notes are stored with POSITIVE amounts (same as facturas.total);
 * the sign is applied by the gold layer.
 */

import * as z from 'zod';

export const TAX_LINE_CONCEPTS = [
  'NET_TAXED',
  'NET_UNTAXED',
  'EXEMPT',
  'VAT',
  'VAT_PERCEPTION',
  'IIBB_PERCEPTION',
  'OTHER_TAXES',
] as const;

export type TaxLineConcept = (typeof TAX_LINE_CONCEPTS)[number];

/** Fixed list of allowed rates (%) per concept (mandatory for these). */
export const TAX_LINE_RATES: Partial<Record<TaxLineConcept, readonly number[]>> = {
  NET_TAXED: [0, 2.5, 5, 10.5, 21, 27],
  VAT: [2.5, 5, 10.5, 21, 27],
};

/** Concepts with an optional free rate (%): > 0, <= 100, up to 4 decimals. */
export const TAX_LINE_FREE_RATE_CONCEPTS: readonly TaxLineConcept[] = [
  'VAT_PERCEPTION',
  'IIBB_PERCEPTION',
  'OTHER_TAXES',
];

/** Concepts that accept a free-form label (IIBB: jurisdiction). */
export const TAX_LINE_LABEL_CONCEPTS: readonly TaxLineConcept[] = [
  'VAT_PERCEPTION',
  'IIBB_PERCEPTION',
  'OTHER_TAXES',
];

/** Concepts that may repeat (no uniqueness check). */
export const TAX_LINE_REPEATABLE_CONCEPTS: readonly TaxLineConcept[] = [
  'VAT_PERCEPTION',
  'IIBB_PERCEPTION',
  'OTHER_TAXES',
];

/** Max difference (in currency units) between the lines sum and the invoice total. */
export const TAX_LINES_SUM_TOLERANCE = 0.05;

export const TAX_LINES_MAX = 30;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export const TaxLineSchema = z
  .object({
    concept: z.enum(TAX_LINE_CONCEPTS, { error: 'Concepto inválido' }),
    rate: z.number({ error: 'Alícuota inválida' }).finite().nullish(),
    amount: z
      .number({ error: 'Monto inválido' })
      .finite('Monto inválido')
      .gt(0, 'El monto debe ser mayor a cero')
      .transform(round2),
    label: z
      .string()
      .trim()
      .max(100, 'La descripción admite hasta 100 caracteres')
      .nullish()
      .transform((v) => (v ? v : null)),
  })
  .superRefine((line, ctx) => {
    const allowedRates = TAX_LINE_RATES[line.concept];
    if (allowedRates) {
      if (line.rate === null || line.rate === undefined) {
        ctx.addIssue({ code: 'custom', path: ['rate'], message: 'La alícuota es obligatoria' });
      } else if (!allowedRates.includes(line.rate)) {
        ctx.addIssue({
          code: 'custom',
          path: ['rate'],
          message: `Alícuota no permitida (${allowedRates.join(', ')})`,
        });
      }
    } else if (TAX_LINE_FREE_RATE_CONCEPTS.includes(line.concept)) {
      if (line.rate !== null && line.rate !== undefined) {
        const decimals = Math.abs(line.rate * 1e4 - Math.round(line.rate * 1e4)) < 1e-6;
        if (line.rate <= 0 || line.rate > 100) {
          ctx.addIssue({
            code: 'custom',
            path: ['rate'],
            message: 'La alícuota debe ser mayor a 0 y hasta 100',
          });
        } else if (!decimals) {
          ctx.addIssue({
            code: 'custom',
            path: ['rate'],
            message: 'La alícuota admite hasta 4 decimales',
          });
        }
      }
    } else if (line.rate !== null && line.rate !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['rate'],
        message: 'Este concepto no admite alícuota',
      });
    }

    if (line.label && !TAX_LINE_LABEL_CONCEPTS.includes(line.concept)) {
      ctx.addIssue({
        code: 'custom',
        path: ['label'],
        message: 'Este concepto no admite descripción',
      });
    }
  })
  .transform((line) => ({
    concept: line.concept,
    rate: line.rate ?? null,
    amount: line.amount,
    label: line.label,
  }));

export type TaxLineInput = z.input<typeof TaxLineSchema>;
export type TaxLine = z.output<typeof TaxLineSchema>;

export interface TaxLinesSumCheck {
  sum: number;
  /** sum - total, rounded to 2 decimals */
  diff: number;
  ok: boolean;
}

/**
 * Compares the sum of the lines against the invoice total.
 * `ok` is true when |sum - total| <= TAX_LINES_SUM_TOLERANCE.
 */
export function checkTaxLinesSum(
  lines: ReadonlyArray<{ amount: number }>,
  total: number
): TaxLinesSumCheck {
  const sum = round2(lines.reduce((acc, l) => acc + l.amount, 0));
  const diff = round2(sum - total);
  // Small epsilon so that exactly 0.05 is accepted despite float noise
  return { sum, diff, ok: Math.abs(diff) <= TAX_LINES_SUM_TOLERANCE + 1e-9 };
}

function checkDuplicates(lines: TaxLine[], ctx: z.RefinementCtx): void {
  const seen = new Set<string>();
  lines.forEach((line, i) => {
    if (TAX_LINE_REPEATABLE_CONCEPTS.includes(line.concept)) return;
    const key = `${line.concept}:${line.rate ?? ''}`;
    if (seen.has(key)) {
      ctx.addIssue({
        code: 'custom',
        path: ['lines', i],
        message: 'Concepto duplicado (mismo concepto y alícuota)',
      });
    }
    seen.add(key);
  });
}

/**
 * Builds the PUT body schema validated against the invoice's current total.
 * An empty array is valid and means "remove the breakdown".
 * `total` null/undefined: the invoice has no total, so lines are rejected.
 */
export function makeTaxLinesBodySchema(total: number | null | undefined): z.ZodType<TaxLinesBody> {
  return z
    .object({
      lines: z
        .array(TaxLineSchema)
        .max(TAX_LINES_MAX, `Máximo ${TAX_LINES_MAX} líneas de desglose`),
    })
    .superRefine((body, ctx) => {
      if (body.lines.length === 0) return;

      checkDuplicates(body.lines, ctx);

      if (total === null || total === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['lines'],
          message: 'El comprobante no tiene total cargado; cárguelo antes de definir el desglose',
        });
        return;
      }

      const check = checkTaxLinesSum(body.lines, total);
      if (!check.ok) {
        ctx.addIssue({
          code: 'custom',
          path: ['lines'],
          message: `La suma del desglose (${check.sum.toFixed(2)}) no coincide con el total del comprobante (${total.toFixed(2)}); diferencia ${check.diff.toFixed(2)}`,
        });
      }
    });
}

export type TaxLinesBody = { lines: TaxLine[] };
