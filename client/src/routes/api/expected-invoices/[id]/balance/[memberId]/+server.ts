/**
 * DELETE /api/expected-invoices/:id/balance/:memberId
 * Remove a specific member from a balance group.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ExpectedInvoiceRepository } from '@server/database/repositories/expected-invoice';

const repo = new ExpectedInvoiceRepository();

/**
 * DELETE /api/expected-invoices/:id/balance/:memberId
 * Remove a member from the balance group.
 * The :id is the principal, :memberId is the member to remove.
 */
export const DELETE: RequestHandler = async ({ params }) => {
  const principalId = parseInt(params.id, 10);
  const memberId = parseInt(params.memberId, 10);

  if (isNaN(principalId) || isNaN(memberId)) {
    return json({ error: 'IDs inválidos' }, { status: 400 });
  }

  try {
    // Verify principal exists
    const principal = await repo.findById(principalId);
    if (!principal) {
      return json({ error: 'Expected invoice principal no encontrado' }, { status: 404 });
    }

    // Verify this is actually a principal
    if (principal.balancedWithId !== null) {
      return json(
        {
          error:
            `Este invoice no es el principal del grupo. ` +
            `El principal es ${principal.balancedWithId}.`,
        },
        { status: 400 }
      );
    }

    // Verify member exists and belongs to this group
    const member = await repo.findById(memberId);
    if (!member) {
      return json({ error: `Expected invoice ${memberId} no encontrado` }, { status: 404 });
    }

    if (member.balancedWithId !== principalId) {
      return json(
        { error: `El invoice ${memberId} no pertenece a este grupo de balance` },
        { status: 400 }
      );
    }

    // Can't remove the principal itself via this endpoint
    if (memberId === principalId) {
      return json(
        {
          error:
            'No se puede quitar el principal del grupo. Use DELETE en el grupo para disolverlo.',
        },
        { status: 400 }
      );
    }

    // Remove from group
    await repo.removeFromBalanceGroup(memberId);

    return json({
      success: true,
      message: `Invoice ${memberId} removido del grupo de balance.`,
    });
  } catch (error) {
    console.error('Error removing from balance group:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Error al quitar del grupo' },
      { status: 400 }
    );
  }
};
