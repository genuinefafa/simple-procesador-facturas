/**
 * API endpoints for balance groups (FAC + NCR that cancel each other)
 *
 * GET    /api/expected-invoices/:id/balance        - Get balance group for this invoice
 * POST   /api/expected-invoices/:id/balance        - Add an invoice to this group
 * PATCH  /api/expected-invoices/:id/balance        - Change the group's principal
 * DELETE /api/expected-invoices/:id/balance        - Dissolve the group (remove all members)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ExpectedInvoiceRepository } from '@server/database/repositories/expected-invoice';
import {
  BalanceGroupAddSchema,
  BalanceGroupSetPrincipalSchema,
  formatZodError,
  type BalanceGroupMember,
  type BalanceGroupResponse,
} from '@server/contracts';

const repo = new ExpectedInvoiceRepository();

/**
 * Maps repository data to API response format
 */
async function buildBalanceGroupResponse(
  principalId: number
): Promise<BalanceGroupResponse | null> {
  const group = await repo.getBalanceGroup(principalId);
  if (group.length === 0) return null;

  // Find the actual principal (the one with balancedWithId = null)
  const principal = group.find((inv) => inv.balancedWithId === null);
  if (!principal) return null;

  const balance = await repo.calculateGroupBalance(principal.id);

  const members: BalanceGroupMember[] = group.map((inv) => ({
    id: inv.id,
    cuit: inv.cuit,
    emitterName: inv.emitterName,
    invoiceType: inv.invoiceType,
    pointOfSale: inv.pointOfSale,
    invoiceNumber: inv.invoiceNumber,
    total: inv.total,
    issueDate: inv.issueDate,
    isPrincipal: inv.balancedWithId === null,
  }));

  return {
    principalId: principal.id,
    members,
    total: balance.total,
    isBalanced: balance.isBalanced,
  };
}

/**
 * GET /api/expected-invoices/:id/balance
 * Get the balance group for this expected invoice.
 * Returns the group if it exists, or null if the invoice has no group.
 */
export const GET: RequestHandler = async ({ params }) => {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return json({ error: 'ID inválido' }, { status: 400 });
  }

  try {
    const invoice = await repo.findById(id);
    if (!invoice) {
      return json({ error: 'Expected invoice no encontrado' }, { status: 404 });
    }

    // Determine the principal ID
    const principalId = invoice.balancedWithId ?? id;

    // Check if this invoice has a group
    const hasGroup = await repo.hasBalanceGroup(principalId);
    if (!hasGroup) {
      return json({ group: null });
    }

    const response = await buildBalanceGroupResponse(principalId);
    return json({ group: response });
  } catch (error) {
    console.error('Error fetching balance group:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Error al obtener grupo de balance' },
      { status: 500 }
    );
  }
};

/**
 * POST /api/expected-invoices/:id/balance
 * Add an expected invoice to this invoice's balance group.
 * This invoice becomes the principal if it wasn't already.
 */
export const POST: RequestHandler = async ({ params, request }) => {
  const principalId = parseInt(params.id, 10);
  if (isNaN(principalId)) {
    return json({ error: 'ID inválido' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validation = BalanceGroupAddSchema.safeParse(body);

    if (!validation.success) {
      return json(formatZodError(validation.error), { status: 400 });
    }

    const { expectedId } = validation.data;

    // Check if principal exists and is not already a secondary
    const principal = await repo.findById(principalId);
    if (!principal) {
      return json({ error: 'Expected invoice principal no encontrado' }, { status: 404 });
    }

    if (principal.balancedWithId !== null) {
      return json(
        {
          error:
            `Este invoice ya pertenece a otro grupo (principal: ${principal.balancedWithId}). ` +
            `Para agregar, use el principal del grupo.`,
        },
        { status: 400 }
      );
    }

    // Check if the invoice to add exists
    const toAdd = await repo.findById(expectedId);
    if (!toAdd) {
      return json({ error: `Expected invoice ${expectedId} no encontrado` }, { status: 404 });
    }

    // Warning if CUITs don't match (but don't block)
    const warnings: string[] = [];
    if (toAdd.cuit !== principal.cuit) {
      warnings.push(
        `Advertencia: Los CUITs no coinciden (${principal.cuit} vs ${toAdd.cuit}). ` +
          `Esto es inusual para comprobantes relacionados.`
      );
    }

    // Add to group
    await repo.addToBalanceGroup(expectedId, principalId);

    // Get updated group
    const response = await buildBalanceGroupResponse(principalId);

    // Add warning about unbalanced total
    if (response && !response.isBalanced) {
      warnings.push(
        `Advertencia: El grupo no está balanceado (total: $${response.total.toFixed(2)}). ` +
          `Se esperaría que la suma sea cercana a $0.`
      );
    }

    return json({
      success: true,
      group: response,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error) {
    console.error('Error adding to balance group:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Error al agregar al grupo de balance' },
      { status: 400 }
    );
  }
};

/**
 * PATCH /api/expected-invoices/:id/balance
 * Change the principal of a balance group.
 * The new principal must be a current member of the group.
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
  const currentPrincipalId = parseInt(params.id, 10);
  if (isNaN(currentPrincipalId)) {
    return json({ error: 'ID inválido' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const validation = BalanceGroupSetPrincipalSchema.safeParse(body);

    if (!validation.success) {
      return json(formatZodError(validation.error), { status: 400 });
    }

    const { newPrincipalId } = validation.data;

    // Verify current principal exists and is actually a principal
    const currentPrincipal = await repo.findById(currentPrincipalId);
    if (!currentPrincipal) {
      return json({ error: 'Expected invoice no encontrado' }, { status: 404 });
    }

    if (currentPrincipal.balancedWithId !== null) {
      return json({ error: 'Este invoice no es el principal del grupo' }, { status: 400 });
    }

    // Verify new principal is a member of this group
    const newPrincipal = await repo.findById(newPrincipalId);
    if (!newPrincipal) {
      return json({ error: `Expected invoice ${newPrincipalId} no encontrado` }, { status: 404 });
    }

    if (newPrincipal.balancedWithId !== currentPrincipalId) {
      return json(
        { error: `El invoice ${newPrincipalId} no es miembro de este grupo` },
        { status: 400 }
      );
    }

    // Change principal
    await repo.setGroupPrincipal(newPrincipalId);

    // Get updated group
    const response = await buildBalanceGroupResponse(newPrincipalId);

    return json({ success: true, group: response });
  } catch (error) {
    console.error('Error changing group principal:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Error al cambiar el principal' },
      { status: 400 }
    );
  }
};

/**
 * DELETE /api/expected-invoices/:id/balance
 * Dissolve the entire balance group (removes all references).
 * Only the principal can dissolve the group.
 */
export const DELETE: RequestHandler = async ({ params }) => {
  const principalId = parseInt(params.id, 10);
  if (isNaN(principalId)) {
    return json({ error: 'ID inválido' }, { status: 400 });
  }

  try {
    const principal = await repo.findById(principalId);
    if (!principal) {
      return json({ error: 'Expected invoice no encontrado' }, { status: 404 });
    }

    if (principal.balancedWithId !== null) {
      return json(
        {
          error:
            'Solo el principal del grupo puede disolverlo. ' +
            `Este invoice pertenece al grupo del principal ${principal.balancedWithId}.`,
        },
        { status: 400 }
      );
    }

    const dissolved = await repo.dissolveBalanceGroup(principalId);

    if (dissolved === 0) {
      return json({ error: 'Este invoice no tiene un grupo de balance' }, { status: 400 });
    }

    return json({
      success: true,
      message: `Grupo disuelto. ${dissolved} invoice(s) liberados.`,
    });
  } catch (error) {
    console.error('Error dissolving balance group:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Error al disolver el grupo' },
      { status: 500 }
    );
  }
};
