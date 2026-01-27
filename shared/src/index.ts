/**
 * Shared module - Types, contracts, and validators shared between client and server.
 *
 * @example
 * // Import types
 * import type { Invoice, Currency } from '@shared/types';
 *
 * // Import contracts
 * import { InvoicePatchSchema, formatZodError } from '@shared/contracts';
 *
 * // Import validators
 * import { validateCUIT, normalizeCUIT } from '@shared/validators';
 */

// Re-export everything for convenience
export * from "./types/index.js";
export * from "./contracts/index.js";
export * from "./validators/index.js";
