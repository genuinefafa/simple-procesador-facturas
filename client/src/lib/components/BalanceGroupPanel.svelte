<script lang="ts">
  import { Scale, Plus, X, Check, AlertTriangle, Star } from '$lib/components/icons';
  import Button from './ui/Button.svelte';
  import { formatCurrency, formatInvoiceLabel, formatDateShort } from '$lib/formatters';
  import type { BalanceGroup } from '$lib/services/ComprobanteService';

  type Props = {
    /** ID of the expected invoice being viewed */
    expectedId: number;
    /** Current balance group (null if no group exists) */
    group: BalanceGroup | null;
    /** Loading state */
    loading?: boolean;
    /** Callback to open the search dialog for adding members */
    onadd?: () => void;
    /** Callback when a member should be removed */
    onremove?: (memberId: number) => void;
    /** Callback to change the principal */
    onsetprincipal?: (memberId: number) => void;
    /** Callback to dissolve the entire group */
    ondissolve?: () => void;
    /** Callback when clicking on a member to navigate to it */
    onmemberclick?: (memberId: number) => void;
  };

  let {
    expectedId,
    group,
    loading = false,
    onadd,
    onremove,
    onsetprincipal,
    ondissolve,
    onmemberclick,
  }: Props = $props();

  const isBalanced = $derived(group?.isBalanced ?? false);
  const hasGroup = $derived(group !== null && group.members.length > 1);
  const totalDisplay = $derived(group ? formatCurrency(group.total) : '$0,00');

  // Current invoice's role in the group
  const isPrincipal = $derived(
    group?.members.find((m) => m.id === expectedId)?.isPrincipal ?? false
  );
</script>

<section class="balance-group-panel">
  <header class="panel-header">
    <Scale size={16} />
    <span class="panel-title">Grupo de Balance</span>
    {#if hasGroup}
      {#if isBalanced}
        <span class="badge badge-balanced">
          <Check size={12} />
          Balanceado
        </span>
      {:else}
        <span class="badge badge-unbalanced">
          <AlertTriangle size={12} />
          Desbalanceado
        </span>
      {/if}
    {/if}
  </header>

  <div class="panel-content">
    {#if loading}
      <p class="loading-text">Cargando...</p>
    {:else if !hasGroup}
      <p class="empty-text">
        Este comprobante no pertenece a un grupo de balance. Los grupos de balance se usan para
        vincular facturas con sus notas de crédito cuando ambas fueron anuladas y no se tiene el
        archivo PDF.
      </p>
      <div class="panel-actions">
        <Button size="sm" variant="secondary" onclick={onadd}>
          <Plus size={14} />
          Crear grupo
        </Button>
      </div>
    {:else if group}
      <table class="balance-table">
        <tbody>
          {#each group.members as member (member.id)}
            {@const isCurrent = member.id === expectedId}
            {@const isClickable = !isCurrent && onmemberclick}
            <tr
              class="member-row"
              class:current={isCurrent}
              class:clickable={isClickable}
              onclick={() => isClickable && onmemberclick?.(member.id)}
              onkeydown={(e) => isClickable && e.key === 'Enter' && onmemberclick?.(member.id)}
              tabindex={isClickable ? 0 : -1}
              role={isClickable ? 'button' : undefined}
            >
              <td class="col-label">
                {formatInvoiceLabel(member.invoiceType, member.pointOfSale, member.invoiceNumber)}
              </td>
              <td class="col-date">{formatDateShort(member.issueDate)}</td>
              <td
                class="col-total"
                class:positive={member.total && member.total > 0}
                class:negative={member.total && member.total < 0}
              >
                {formatCurrency(member.total)}
              </td>
              <td class="col-status">
                {#if member.isPrincipal}
                  <span class="principal-badge" title="Principal del grupo">
                    <Star size={12} />
                  </span>
                {:else if isPrincipal && !isCurrent}
                  <button
                    type="button"
                    class="action-btn set-principal-btn"
                    title="Hacer principal"
                    onclick={(e) => {
                      e.stopPropagation();
                      onsetprincipal?.(member.id);
                    }}
                  >
                    <Star size={12} />
                  </button>
                {/if}
              </td>
              <td class="col-actions">
                {#if isPrincipal && !isCurrent}
                  <button
                    type="button"
                    class="action-btn remove-btn"
                    title="Quitar del grupo"
                    onclick={(e) => {
                      e.stopPropagation();
                      onremove?.(member.id);
                    }}
                  >
                    <X size={12} />
                  </button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td class="col-label total-label">Total</td>
            <td class="col-date"></td>
            <td
              class="col-total total-value"
              class:balanced={isBalanced}
              class:unbalanced={!isBalanced}
            >
              {totalDisplay}
            </td>
            <td class="col-status"></td>
            <td class="col-actions">
              <button
                type="button"
                class="action-btn add-btn"
                title="Agregar al grupo"
                onclick={onadd}
              >
                <Plus size={12} />
              </button>
              {#if isPrincipal}
                <button
                  type="button"
                  class="action-btn dissolve-btn"
                  title="Disolver grupo"
                  onclick={ondissolve}
                >
                  <X size={12} />
                </button>
              {/if}
            </td>
          </tr>
        </tfoot>
      </table>
    {/if}
  </div>
</section>

<style>
  .balance-group-panel {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    padding: var(--spacing-2) var(--spacing-3);
    background: var(--color-surface-alt);
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text-secondary);
  }

  .panel-title {
    font-weight: var(--font-weight-medium);
    color: var(--color-text);
    flex: 1;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-1);
    padding: var(--spacing-1) var(--spacing-2);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
  }

  .badge-balanced {
    background: var(--color-success-bg, #dcfce7);
    color: var(--color-success, #16a34a);
  }

  .badge-unbalanced {
    background: var(--color-warning-bg, #fef3c7);
    color: var(--color-warning, #d97706);
  }

  .panel-content {
    padding: var(--spacing-3);
  }

  .loading-text,
  .empty-text {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    margin: 0 0 var(--spacing-3) 0;
    line-height: 1.5;
  }

  .panel-actions {
    display: flex;
    gap: var(--spacing-2);
    flex-wrap: wrap;
  }

  /* Table layout - condensed */
  .balance-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-xs);
  }

  .balance-table td {
    padding: 2px var(--spacing-2);
    vertical-align: middle;
  }

  /* Row styles */
  .member-row {
    background: transparent;
  }

  .member-row.current {
    background: var(--color-primary-50);
  }

  .member-row.current td:first-child {
    border-left: 3px solid var(--color-primary-600);
    padding-left: calc(var(--spacing-2) - 3px);
  }

  .member-row.clickable {
    cursor: pointer;
  }

  .member-row.clickable:hover {
    background: var(--color-surface);
  }

  .member-row.clickable:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  /* Column styles */
  .col-label {
    font-family: var(--font-mono);
    white-space: nowrap;
  }

  .col-date {
    color: var(--color-text-secondary);
    white-space: nowrap;
    text-align: center;
  }

  .col-total {
    font-family: var(--font-mono);
    font-weight: var(--font-weight-medium);
    text-align: right;
    white-space: nowrap;
  }

  .col-total.positive {
    color: var(--color-text);
  }

  .col-total.negative {
    color: var(--color-error, #dc2626);
  }

  .col-status {
    width: 1.5rem;
    text-align: center;
    padding-left: 0;
    padding-right: 0;
  }

  .col-actions {
    width: 2rem;
    white-space: nowrap;
    text-align: right;
    padding-left: 0;
  }

  .principal-badge {
    color: var(--color-warning, #d97706);
    display: inline-flex;
    align-items: center;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-1);
    border: none;
    background: transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--color-text-secondary);
    transition:
      background var(--transition-fast),
      color var(--transition-fast);
  }

  .action-btn:hover {
    background: var(--color-surface);
    color: var(--color-text);
  }

  .set-principal-btn:hover {
    color: var(--color-warning, #d97706);
  }

  .remove-btn:hover {
    color: var(--color-error, #dc2626);
  }

  .add-btn:hover {
    color: var(--color-primary, #2563eb);
  }

  .dissolve-btn:hover {
    color: var(--color-error, #dc2626);
  }

  /* Total row (tfoot) */
  .total-row {
    border-top: 1px solid var(--color-border);
  }

  .total-label {
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
  }

  .total-value {
    font-weight: var(--font-weight-semibold);
  }

  .total-value.balanced {
    color: var(--color-success, #16a34a);
  }

  .total-value.unbalanced {
    color: var(--color-warning, #d97706);
  }
</style>
