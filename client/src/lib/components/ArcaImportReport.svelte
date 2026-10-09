<script lang="ts">
  import { goto } from '$app/navigation';
  import ReportPanel from '$lib/components/ReportPanel.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import {
    FileSpreadsheet,
    Loader2,
    CheckCircle,
    AlertTriangle,
    XCircle,
    Scale,
  } from '$lib/components/icons';
  import type {
    ArcaImportEntry,
    ArcaImportResult,
    ReconciliationSummary,
  } from './ArcaImportReport.types';

  interface Props {
    entries: ArcaImportEntry[];
    /** null = still loading or not available */
    reconciliation: ReconciliationSummary | null;
    reconciliationLoading: boolean;
    onClose: () => void;
    onfilter?: (query: string) => void;
  }

  let { entries, reconciliation, reconciliationLoading, onClose, onfilter }: Props = $props();

  const allFinished = $derived(entries.every((e) => e.status !== 'loading'));

  function filter(query: string) {
    if (onfilter) {
      onfilter(query);
    } else {
      goto('/comprobantes?q=' + encodeURIComponent(query));
    }
  }

  function plural(n: number, one: string, many: string): string {
    return n === 1 ? one : many;
  }

  function summarize(r: ArcaImportResult): string {
    const parts: string[] = [];
    if (r.imported > 0) parts.push(`${r.imported} ${plural(r.imported, 'nueva', 'nuevas')}`);
    if (r.updated > 0)
      parts.push(`${r.updated} ${plural(r.updated, 'actualizada', 'actualizadas')}`);
    if (r.unchanged > 0) parts.push(`${r.unchanged} sin cambios`);
    if (r.errors.length > 0)
      parts.push(`${r.errors.length} con ${plural(r.errors.length, 'error', 'errores')}`);
    if (r.withBreakdown > 0) parts.push(`${r.withBreakdown} con desglose`);
    return parts.length > 0 ? parts.join(' · ') : 'sin filas';
  }

  const showCompletable = $derived((reconciliation?.completable ?? 0) > 0);
  const showDivergent = $derived((reconciliation?.divergent ?? 0) > 0);
</script>

<ReportPanel title="Importación de ARCA" {onClose}>
  {#snippet icon()}<FileSpreadsheet size={18} />{/snippet}

  <div class="summary">
    {#each entries as entry, i (i)}
      {#if entry.status === 'loading'}
        <div class="summary-item loading">
          <span class="icon spin"><Loader2 size={18} /></span>
          <span>Importando <span class="filename-inline">{entry.filename}</span>…</span>
        </div>
      {:else if entry.status === 'error'}
        <div class="summary-item error">
          <span class="icon"><XCircle size={18} /></span>
          <span><span class="filename-inline">{entry.filename}</span>: {entry.error}</span>
        </div>
      {:else}
        {@const r = entry.result}
        <div class="summary-item {r.errors.length > 0 ? 'warning' : 'success'}">
          <span class="icon">
            {#if r.errors.length > 0}<AlertTriangle size={18} />{:else}<CheckCircle
                size={18}
              />{/if}
          </span>
          <span><span class="filename-inline">{entry.filename}</span>: {summarize(r)}</span>
        </div>
        {#if r.errors.length > 0}
          <details class="error-details">
            <summary>
              Ver {r.errors.length}
              {plural(r.errors.length, 'error', 'errores')}
            </summary>
            <ul class="file-list">
              {#each r.errors as err, i (i)}
                <li class="error-item">
                  <span class="error-message">Fila {err.row}: {err.error}</span>
                </li>
              {/each}
            </ul>
          </details>
        {/if}
      {/if}
    {/each}

    {#if allFinished}
      {#if reconciliationLoading}
        <div class="summary-item loading">
          <span class="icon spin"><Loader2 size={18} /></span>
          <span>Calculando conciliación…</span>
        </div>
      {:else if reconciliation && (showCompletable || showDivergent)}
        <div class="summary-item info">
          <span class="icon"><Scale size={18} /></span>
          <span class="reconciliation-text">
            {#if showCompletable}
              {reconciliation.completable}
              {plural(
                reconciliation.completable,
                'factura puede completar desglose',
                'facturas pueden completar desglose'
              )}
            {/if}
            {#if showCompletable && showDivergent}
              ·
              <button class="link-button" onclick={() => filter('desglose:divergente')}>
                {reconciliation.divergent}
                con diferencias
              </button>
            {:else if showDivergent}
              {reconciliation.divergent}
              {plural(
                reconciliation.divergent,
                'factura con diferencias',
                'facturas con diferencias'
              )}
            {/if}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onclick={() => filter(showCompletable ? 'desglose:completable' : 'desglose:divergente')}
          >
            Ver conciliación
          </Button>
        </div>
      {:else if reconciliation}
        <div class="summary-item success">
          <span class="icon"><CheckCircle size={18} /></span>
          <span>Desglose al día con ARCA</span>
        </div>
      {/if}
    {/if}
  </div>
</ReportPanel>

<style>
  .summary {
    margin-bottom: 0;
  }

  .filename-inline {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
  }

  .reconciliation-text {
    flex: 1;
    min-width: 0;
  }

  .spin :global(svg) {
    animation: arca-spin 1s linear infinite;
  }

  @keyframes arca-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error-details {
    margin: 0 0 var(--spacing-2) var(--spacing-2);
    font-size: var(--font-size-sm);
  }

  .error-details summary {
    cursor: pointer;
    color: var(--color-text-secondary);
    margin-bottom: var(--spacing-2);
  }
</style>
