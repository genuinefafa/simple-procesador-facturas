/**
 * Link integrity guard (#203).
 *
 * Invariants between facturas, files and expected_invoices:
 *   1. A file has at most one invoice.
 *   2. An expected invoice has at most one invoice.
 *   3. No two invoices share emitter + type + POS + number.
 *
 * The DB enforces them with UNIQUE indexes; this guard checks them first so the
 * API can answer 409 with a clear message (and before touching files on disk).
 */

import type { IInvoiceRepository } from '../database/repositories/invoice';

type LinkTarget = Parameters<IInvoiceRepository['findLinkConflicts']>[0];

type LinkConflicts = Awaited<ReturnType<IInvoiceRepository['findLinkConflicts']>>;

/** User-facing message for the first broken invariant, or null if there is none */
export function describeLinkConflicts({
  byNumber,
  byExpected,
  byFile,
}: LinkConflicts): string | null {
  if (byNumber) {
    return `Ya existe un comprobante con el mismo emisor, tipo, punto de venta y número (comprobante #${byNumber.id}).`;
  }
  if (byExpected) {
    return `La factura esperada ya está vinculada al comprobante #${byExpected.id}.`;
  }
  if (byFile) {
    return `El archivo ya está vinculado al comprobante #${byFile.id}.`;
  }
  return null;
}

/**
 * Returns a user-facing message if an invoice with these values would break a
 * link invariant, or null if it can be saved. `excludeId` is the invoice being
 * edited, if any.
 */
export async function checkLinkConflicts(
  invoiceRepo: IInvoiceRepository,
  target: LinkTarget,
  excludeId?: number
): Promise<string | null> {
  return describeLinkConflicts(await invoiceRepo.findLinkConflicts(target, excludeId));
}

/** True if the error comes from a UNIQUE index (race between check and write) */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed');
}

export const UNIQUE_VIOLATION_MESSAGE =
  'El comprobante ya existe o el archivo o la factura esperada ya están vinculados a otro comprobante.';
