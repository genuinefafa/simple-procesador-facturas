/**
 * Shared validators - Re-exports all validators
 */
export {
  validateCUIT,
  normalizeCUIT,
  formatCUIT,
  extractCUITFromText,
  extractCUITsWithContext,
  getPersonType,
} from "./cuit.js";

export type { CUITWithContext } from "./cuit.js";
