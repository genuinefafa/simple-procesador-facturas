/**
 * Utilities for API contract handling.
 */

import type { z } from 'zod';

/**
 * Format Zod validation errors for HTTP API response.
 */
export function formatZodError(error: z.ZodError): {
  error: string;
  details: Record<string, string[]>;
} {
  const details: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_root';
    if (!details[path]) {
      details[path] = [];
    }
    details[path].push(issue.message);
  }

  return {
    error: 'Validación fallida',
    details,
  };
}
