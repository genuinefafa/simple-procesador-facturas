<script lang="ts">
  import Input from '$lib/components/ui/Input.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import type { PageData } from './$types';
  import type { Comprobante } from '../api/comprobantes/+server';

  let { data } = $props();

  type FilterKind = 'all' | 'pendientes' | 'procesadas' | 'esperadas';

  // Cargar filtro guardado o defecto 'all'
  let activeFilter = $state<FilterKind>('all');

  $effect.pre(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('comprobantes-filter') as FilterKind | null;
      if (saved) activeFilter = saved;
    }
  });

  // Guardar filtro cuando cambia
  $effect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('comprobantes-filter', activeFilter);
    }
  });

  function shortHash(hash?: string | null) {
    if (!hash) return '—';
    return hash.slice(0, 8);
  }

  function formatComprobante(c: Comprobante): string {
    if (c.final) {
      const f = c.final;
      const type = f.invoiceType ?? '—';
      const pos = f.pointOfSale != null ? String(f.pointOfSale).padStart(4, '0') : '----';
      const num = f.invoiceNumber != null ? String(f.invoiceNumber).padStart(8, '0') : '--------';
      return `${type}-${pos}-${num}`;
    }
    if (c.expected) {
      const e = c.expected;
      return `${e.invoiceType}-${String(e.pointOfSale).padStart(4, '0')}-${String(e.invoiceNumber).padStart(8, '0')}`;
    }
    if (c.pending) {
      return c.pending.originalFilename;
    }
    return '—';
  }

  function isVisible(c: Comprobante): boolean {
    switch (activeFilter) {
      case 'procesadas':
        return !!c.final;
      case 'esperadas':
        return !!c.expected && !c.final;
      case 'pendientes':
        return !!c.pending || (!!c.expected && !c.final);
      default:
        return true;
    }
  }

  function navigateToDetail(comprobanteId: string) {
    window.location.href = `/comprobantes/${comprobanteId}`;
  }

  // Dropzone unified
  let isDropping = $state(false);

  async function handleFiles(files: File[]) {
    const excel = files.filter((f) => /\.(xlsx|xls|csv)$/i.test(f.name));
    const others = files.filter((f) => !/\.(xlsx|xls|csv)$/i.test(f.name));

    // 1) Excel/CSV -> expected import (one by one)
    for (const f of excel) {
      const fd = new FormData();
      fd.append('file', f);
      await fetch('/api/expected-invoices/import', { method: 'POST', body: fd });
    }

    // 2) Otros -> upload pending (batch)
    if (others.length > 0) {
      const fd = new FormData();
      others.forEach((f) => fd.append('files', f));
      await fetch('/api/invoices/upload', { method: 'POST', body: fd });
    }

    // 3) Refresh
    window.location.reload();
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    isDropping = false;
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length > 0) handleFiles(files);
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    isDropping = true;
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    isDropping = false;
  }

  function onPick() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      if (files.length > 0) handleFiles(files);
    });
    input.click();
  }
</script>

<svelte:head>
  <title>Comprobantes</title>
</svelte:head>

<header class="header">
  <div>
    <p class="eyebrow">Centro unificado</p>
    <h1>Comprobantes</h1>
    <p class="hint">Consolida Expected, Pending y Facturas. Subí archivos o importá Excel aquí.</p>
  </div>
</header>

<section
  class="dropzone"
  class:dropping={isDropping}
  ondrop={onDrop}
  ondragover={onDragOver}
  ondragleave={onDragLeave}
>
  <p class="dz-icon">📦</p>
  <p class="dz-title">Arrastrá cualquier archivo</p>
  <p class="dz-hint">PDF/Imágenes quedarán como pendientes; Excel/CSV se importan a expected</p>
  <Button variant="secondary" onclick={onPick}>Elegir archivos</Button>
</section>

<section class="filters">
  <button class:active={activeFilter === 'all'} onclick={() => (activeFilter = 'all')}>Todos</button>
  <button class:active={activeFilter === 'pendientes'} onclick={() => (activeFilter = 'pendientes')}>Pendientes</button>
  <button class:active={activeFilter === 'procesadas'} onclick={() => (activeFilter = 'procesadas')}>Procesadas</button>
  <button class:active={activeFilter === 'esperadas'} onclick={() => (activeFilter = 'esperadas')}>Esperadas</button>
</section>

<section class="list">
  <div class="list-head">
    <span>Tipo</span>
    <span>Comprobante / Archivo</span>
    <span>CUIT</span>
    <span>Fecha</span>
    <span>Estado</span>
    <span>Hash</span>
    <span></span>
  </div>
  {#each data.comprobantes as comp}
    {#if isVisible(comp)}
      <div class="row" onclick={() => navigateToDetail(comp.id)}>
        <span class="col-type">
          {#if comp.final}<span class="tag ok">Factura</span>
          {:else if comp.expected}<span class="tag warn">Expected</span>
          {:else}<span class="tag info">Pending</span>{/if}
        </span>
        <span class="col-cmp">{formatComprobante(comp)}</span>
        <span class="col-cuit">{comp.final?.cuit || comp.expected?.cuit || comp.pending?.extractedCuit || '—'}</span>
        <span class="col-date">{comp.final?.issueDate || comp.expected?.issueDate || comp.pending?.extractedDate || '—'}</span>
        <span class="col-status">
          {#if comp.final}procesada
          {:else if comp.expected}esperada
          {:else}{comp.pending?.status || '—'}{/if}
        </span>
        <span class="col-hash">{comp.final?.fileHash ? shortHash(comp.final.fileHash) : '—'}</span>
        <span class="col-actions"><Button size="sm">Ver</Button></span>
      </div>
    {/if}
  {/each}
</section>

<style>
  .header {
    margin-bottom: var(--spacing-4);
  }
  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    margin: 0;
  }
  h1 {
    margin: 0.25rem 0 0.5rem;
  }
  .hint {
    color: var(--color-text-secondary);
    margin: 0;
  }

  .dropzone {
    border: 2px dashed var(--color-neutral-300);
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    padding: var(--spacing-5);
    text-align: center;
    margin-bottom: var(--spacing-5);
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast);
  }
  .dropzone.dropping {
    background: var(--color-surface-alt);
    border-color: var(--color-primary-400);
  }
  .dz-icon {
    font-size: 2rem;
    margin: 0;
  }
  .dz-title {
    font-weight: var(--font-weight-semibold);
    margin: 0.25rem 0;
  }
  .dz-hint {
    margin: 0 0 var(--spacing-3);
    color: var(--color-text-tertiary);
  }

  .filters {
    display: flex;
    gap: 0.5rem;
    margin-bottom: var(--spacing-3);
  }
  .filters button {
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    border-radius: var(--radius-full);
    padding: 0.35rem 0.75rem;
    cursor: pointer;
    color: var(--color-text-secondary);
  }
  .filters button.active,
  .filters button:hover {
    border-color: var(--color-primary-300);
    color: var(--color-primary-700);
    background: var(--color-primary-50);
  }

  .list {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: var(--color-surface);
  }
  .list-head,
  .row {
    display: grid;
    grid-template-columns: 120px 1fr 160px 140px 140px 100px 120px;
    gap: var(--spacing-2);
    padding: var(--spacing-3);
    align-items: center;
  }
  .list-head {
    background: var(--color-surface-alt);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }
  .row {
    border-top: 1px solid var(--color-border);
    cursor: pointer;
  }
  .row:hover {
    background: var(--color-surface-alt);
  }

  .tag {
    padding: 0.2rem 0.5rem;
    border-radius: var(--radius-full);
    font-size: var(--font-size-sm);
    border: 1px solid transparent;
  }
  .tag.ok {
    background: var(--color-primary-50);
    color: var(--color-primary-700);
    border-color: var(--color-primary-200);
  }
  .tag.warn {
    background: #fff7ed;
    color: #9a3412;
    border-color: #fed7aa;
  }
  .tag.info {
    background: var(--color-neutral-100);
    color: var(--color-text-secondary);
    border-color: var(--color-neutral-200);
  }

  .detail {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0);
    pointer-events: none;
    transition: background var(--transition-base);
  }
  .detail.open {
    background: rgba(0, 0, 0, 0.25);
    pointer-events: auto;
  }
  .detail-card {
    position: absolute;
    right: 0;
    top: 0;
    height: 100%;
    width: min(420px, 90vw);
    background: var(--color-surface);
    border-left: 1px solid var(--color-border);
    box-shadow: var(--shadow-lg);
    transform: translateX(100%);
    transition: transform var(--transition-base);
    padding: var(--spacing-5);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }
  .detail.open .detail-card {
    transform: translateX(0%);
  }
  .detail-actions {
    margin-top: auto;
    display: flex;
    gap: var(--spacing-2);
  }
</style>
