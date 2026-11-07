/**
 * Contracts for the layer consistency endpoints (#191).
 */

import * as z from 'zod';

export const ConsistencyFieldSchema = z.enum(['category', 'total', 'date', 'type']);
export const ConsistencySourceSchema = z.enum(['expected', 'file']);

export const CopyCategoryBodySchema = z.object({
  source: ConsistencySourceSchema,
});

export const ConsistencyAckKeySchema = z.object({
  field: ConsistencyFieldSchema,
  source: ConsistencySourceSchema,
});

export const ConsistencyAckBodySchema = ConsistencyAckKeySchema.extend({
  note: z.string().trim().max(500, 'La nota admite hasta 500 caracteres').nullish(),
});

export type CopyCategoryBody = z.output<typeof CopyCategoryBodySchema>;
export type ConsistencyAckKey = z.output<typeof ConsistencyAckKeySchema>;
export type ConsistencyAckBody = z.output<typeof ConsistencyAckBodySchema>;
