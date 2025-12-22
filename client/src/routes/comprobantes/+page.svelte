<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import CategoryPills from '$lib/components/CategoryPills.svelte';
  import type { PageData } from './$types';
  import type { Comprobante } from '../api/comprobantes/+server';
  import { FileUpload } from 'melt/builders';
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import { toast, Toaster } from 'svelte-sonner';
  import {
    formatCurrency,
    getFriendlyType,
    formatDateShort,
    formatEmitterName,
  } from '$lib/formatters';

  let { data } = $props();
  let categories = $derived(data.categories || []);
  // null => Sin categoría; undefined => todas; number => específica
  let activeCategoryId = $state<number | undefined | null>(undefined);

  // Track which invoice is being edited for category
  let editingCategoryId = $state<number | null>(null);

  type FilterKind = 'all' | 'pendientes' | 'reconocidas' | 'esperadas';

  // Cargar filtro desde la URL (?f=...) o localStorage; por defecto 'all'
  let activeFilter = $state<FilterKind>('all');

  $effect.pre(() => {
    if (typeof window !== 'undefined') {
      const rawParam = $page.url.searchParams.get('f');
      // Mapear alias legacy 'procesadas' -> 'reconocidas'
      const urlParam = (rawParam === 'procesadas' ? 'reconocidas' : rawParam) as FilterKind | null;
      let saved = localStorage.getItem('comprobantes-filter');
      if (saved === 'procesadas') saved = 'reconocidas';
      const valid = ['all', 'pendientes', 'reconocidas', 'esperadas'];
      const initial =
        urlParam && valid.includes(urlParam)
          ? (urlParam as FilterKind)
          : (saved as FilterKind | null) || 'all';
      activeFilter = initial as FilterKind;
    }
  });

  // Sincronizar cambios de filtro con URL y localStorage (SPA)
  async function updateUrlForFilter(kind: FilterKind) {
    const current = $state.snapshot(activeFilter);
    if (current === kind) return;
    activeFilter = kind;
    if (typeof window !== 'undefined') {
      localStorage.setItem('comprobantes-filter', kind);
      const base = '/comprobantes';
      const target = kind === 'all' ? base : `${base}?f=${kind}`;
      // Reemplazar estado para no ensuciar el historial al alternar filtros
      await goto(target, { replaceState: true, noScroll: true, keepFocus: true });
    }
  }

  function shortHash(hash?: string | null) {
    if (!hash) return '—';
    return hash.slice(0, 8);
  }

  function formatComprobante(c: Comprobante): string {
    if (c.final) {
      const f = c.final;
      const type = getFriendlyType(f.invoiceType);
      const pos = f.pointOfSale != null ? String(f.pointOfSale).padStart(4, '0') : '----';
      const num = f.invoiceNumber != null ? String(f.invoiceNumber).padStart(8, '0') : '--------';
      return `${type} ${pos}-${num}`;
    }
    if (c.expected) {
      const e = c.expected;
      const type = getFriendlyType(e.invoiceType);
      return `${type} ${String(e.pointOfSale).padStart(4, '0')}-${String(e.invoiceNumber).padStart(8, '0')}`;
    }
    if (c.pending) {
      return c.pending.originalFilename;
    }
    return '—';
  }

  function getEmitterName(c: Comprobante): { short: string; full: string } {
    const name = c.emitterName || c.final?.emitterName || c.expected?.emitterName;
    return formatEmitterName(name, 20);
  }

  function isVisible(c: Comprobante): boolean {
    switch (activeFilter) {
      case 'reconocidas':
        // Incluir facturas finalizadas y pendientes ya reconocidos (OCR)
        if (!(!!c.final || c.pending?.status === 'reviewing' || c.pending?.status === 'processed'))
          return false;
        break;
      case 'esperadas':
        if (!(!!c.expected && !c.final)) return false;
        break;
      case 'pendientes':
        // Solo pendientes en espera de reconocimiento o con error
        if (!(c.pending?.status === 'pending' || c.pending?.status === 'failed')) return false;
        break;
      default:
        break;
    }
    // Filtro por categoría (solo aplica a facturas finales)
    if (activeCategoryId === null) {
      // Filtrar facturas sin categoría
      return (c.final?.categoryId ?? null) === null;
    }
    if (activeCategoryId !== undefined) {
      return (c.final?.categoryId ?? null) === activeCategoryId;
    }
    return true;
  }

  /**
   * Actualiza la categoría de una factura procesada
   */
  async function updateCategory(invoiceId: number, categoryId: number | null | undefined) {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId: categoryId === undefined ? null : categoryId }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Error actualizando categoría');
      }

      toast.success('Categoría actualizada');
      editingCategoryId = null; // Cerrar modo edición
      await invalidateAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al actualizar categoría');
      console.error(e);
    }
  }

  // Melt Next File Upload
  const fileUpload = new FileUpload({
    multiple: true,
    onAccept: (file: File) => {
      // Acumular archivos para procesamiento batch
      pendingUploadFiles.add(file);
    },
  });

  let pendingUploadFiles = new Set<File>();

  // Estado para drag & drop global
  let isDraggingOverPage = $state(false);
  let dragCounter = $state(0);

  // Cuando cambien los archivos seleccionados, procesarlos
  $effect(() => {
    const selected = fileUpload.selected;
    if (selected && selected instanceof Set && selected.size > 0) {
      handleFiles(Array.from(selected));
      fileUpload.clear();
    }
  });

  // Global drag & drop handlers
  $effect(() => {
    if (typeof window === 'undefined') return;

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer?.types.includes('Files')) {
        isDraggingOverPage = true;
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    const handleDragLeave = () => {
      dragCounter--;
      if (dragCounter === 0) {
        isDraggingOverPage = false;
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter = 0;
      isDraggingOverPage = false;

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        handleFiles(Array.from(files));
      }
    };

    document.body.addEventListener('dragenter', handleDragEnter);
    document.body.addEventListener('dragover', handleDragOver);
    document.body.addEventListener('dragleave', handleDragLeave);
    document.body.addEventListener('drop', handleDrop);

    return () => {
      document.body.removeEventListener('dragenter', handleDragEnter);
      document.body.removeEventListener('dragover', handleDragOver);
      document.body.removeEventListener('dragleave', handleDragLeave);
      document.body.removeEventListener('drop', handleDrop);
    };
  });

  async function handleFiles(uploadedFiles: File[]) {
    const excel = uploadedFiles.filter((f) => /\.(xlsx|xls|csv)$/i.test(f.name));
    const others = uploadedFiles.filter((f) => !/\.(xlsx|xls|csv)$/i.test(f.name));

    // 1) Excel/CSV -> expected import (one by one)
    for (const f of excel) {
      const fd = new FormData();
      fd.append('file', f);
      const toastId = toast.loading(`Importando ${f.name}...`);

      try {
        const response = await fetch('/api/expected-invoices/import', { method: 'POST', body: fd });
        const data = await response.json();

        if (data.success) {
          const parts = [];
          if (data.imported > 0) parts.push(`${data.imported} nuevas`);
          if (data.updated > 0) parts.push(`${data.updated} actualizadas`);
          if (data.unchanged > 0) parts.push(`${data.unchanged} sin cambios`);

          // Importación completamente exitosa: 100% nuevas, sin errores
          const isCleanImport =
            data.imported > 0 &&
            data.updated === 0 &&
            data.unchanged === 0 &&
            data.errors?.length === 0;
          const message = `${f.name}: ${parts.join(', ')}`;

          if (isCleanImport) {
            // Auto-cierre: importación limpia, todo nuevo
            toast.success(message, { id: toastId, duration: 3000 });
          } else {
            // Cierre manual: hay algo que requiere atención
            toast.success(message, { id: toastId, duration: Infinity });
          }
        } else {
          toast.error(`Error al importar ${f.name}: ${data.error}`, {
            id: toastId,
            duration: Infinity,
          });
        }
      } catch (err) {
        toast.error(`Error al importar ${f.name}`, { id: toastId, duration: Infinity });
      }
    }

    // 2) Otros -> upload pending (batch)
    if (others.length > 0) {
      const fd = new FormData();
      others.forEach((f) => fd.append('files', f));
      await fetch('/api/invoices/upload', { method: 'POST', body: fd });
    }

    // 3) Refresh reactivo
    await invalidateAll();
  }
</script>

<svelte:head>
  <title>Comprobantes</title>
</svelte:head>

<Toaster position="top-right" richColors />

<div class="page-container">
  <!-- Overlay que aparece cuando se arrastra sobre la página -->
  {#if isDraggingOverPage}
    <div class="dropzone-overlay">
      <div class="dropzone-content">
        <p class="dz-icon">📦</p>
        <p class="dz-title">Soltá los archivos</p>
        <p class="dz-hint">
          PDF/Imágenes quedarán como pendientes; Excel/CSV se importan a expected
        </p>
      </div>
    </div>
  {/if}

  <header class="header">
    <div>
      <p class="eyebrow">Centro unificado</p>
      <h1>Comprobantes</h1>
      <p class="hint">
        Consolida Expected, Pending y Facturas. Subí archivos o importá Excel aquí.
      </p>
    </div>
  </header>

  <!-- Dropzone compacto clickeable -->
  <div class="dropzone-wrapper">
    <div {...fileUpload.dropzone} class="dropzone-compact">
      <span class="dz-compact-hint">📎 Click para subir archivos o arrastrá a cualquier parte</span>
    </div>
    <input {...fileUpload.input} />
  </div>

  <section class="filters">
    <button
      class:active={activeFilter === 'all'}
      onclick={() => updateUrlForFilter('all')}
      type="button"
    >
      Todos
    </button>
    <button
      class:active={activeFilter === 'pendientes'}
      onclick={() => updateUrlForFilter('pendientes')}
      type="button"
    >
      Pendientes
    </button>
    <button
      class:active={activeFilter === 'reconocidas'}
      onclick={() => updateUrlForFilter('reconocidas')}
      type="button"
    >
      Reconocidas
    </button>
    <button
      class:active={activeFilter === 'esperadas'}
      onclick={() => updateUrlForFilter('esperadas')}
      type="button"
    >
      Esperadas
    </button>
  </section>

  <!-- Filtro por categoría -->
  <section class="filters">
    <label for="category-filter">Categoría:</label>
    <CategoryPills
      {categories}
      selected={activeCategoryId}
      onselect={(id) => (activeCategoryId = id)}
      mode="filter"
    />
  </section>

  <section class="list">
    <div class="list-head">
      <span>Tipo</span>
      <span>Comprobante / Archivo</span>
      <span>Emisor</span>
      <span>CUIT</span>
      <span>Fecha</span>
      <span class="align-right">Total</span>
      <span>Categoría</span>
      <span>Estado</span>
      <span>Hash</span>
      <span></span>
    </div>
    {#each data.comprobantes as comp}
      {#if isVisible(comp)}
        <a href="/comprobantes/{comp.id}" class="row" data-sveltekit-preload-data>
          <span class="col-type">
            {#if comp.final}<span class="tag ok">Factura</span>
            {:else if comp.expected}<span class="tag warn">Expected</span>
            {:else}<span class="tag info">Pending</span>{/if}
          </span>
          <span class="col-cmp">{formatComprobante(comp)}</span>
          <span class="col-emisor" title={getEmitterName(comp).full || undefined}
            >{getEmitterName(comp).short}</span
          >
          <span class="col-cuit"
            >{comp.final?.cuit || comp.expected?.cuit || comp.pending?.extractedCuit || '—'}</span
          >
          <span class="col-date"
            >{formatDateShort(
              comp.final?.issueDate || comp.expected?.issueDate || comp.pending?.extractedDate
            )}</span
          >
          <span class="col-total align-right"
            >{formatCurrency(
              comp.final?.total ?? comp.expected?.total ?? comp.pending?.extractedTotal
            )}</span
          >
          <span class="col-category">
            {#if comp.final}
              {#if editingCategoryId === comp.final.id}
                <!-- Modo edición: mostrar pills -->
                <CategoryPills
                  {categories}
                  selected={comp.final?.categoryId ?? null}
                  onselect={(id) => comp.final && updateCategory(comp.final.id, id)}
                  mode="single"
                />
              {:else}
                <!-- Modo readonly: mostrar categoría actual -->
                <button
                  type="button"
                  class="category-display"
                  onclick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    editingCategoryId = comp.final?.id ?? null;
                  }}
                  title="Click para editar categoría"
                >
                  {#if comp.final?.categoryId}
                    {categories.find((c) => c.id === comp.final?.categoryId)?.description ?? '—'}
                  {:else}
                    <span class="no-category">Sin categoría</span>
                  {/if}
                </button>
              {/if}
            {:else}
              —
            {/if}
          </span>
          <span class="col-status">
            {#if comp.final}procesada
            {:else if comp.expected}esperada
            {:else}{comp.pending?.status || '—'}{/if}
          </span>
          <span class="col-hash">{comp.final?.fileHash ? shortHash(comp.final.fileHash) : '—'}</span
          >
          <span class="col-actions"><Button size="sm">Ver</Button></span>
        </a>
      {/if}
    {/each}
  </section>
</div>

<style>
  .page-container {
    position: relative;
    width: 100%;
  }

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

  /* Dropzone compacto clickeable */
  .dropzone-wrapper {
    margin-bottom: var(--spacing-4);
  }

  .dropzone-compact {
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    border-radius: var(--radius-md);
    padding: var(--spacing-2) var(--spacing-3);
    text-align: center;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .dropzone-compact:hover {
    border-color: var(--color-primary-300);
    background: var(--color-surface-alt);
  }

  .dz-compact-hint {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  /* Overlay que aparece cuando se arrastra sobre la página */
  .dropzone-overlay {
    position: absolute;
    inset: 0;
    z-index: 50;
    background: rgba(255, 255, 255, 0.97);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    border: 4px dashed var(--color-primary-500);
    border-radius: var(--radius-lg);
    animation: fadeIn var(--transition-fast);
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .dropzone-content {
    text-align: center;
  }

  .dz-icon {
    font-size: 3rem;
    margin: 0 0 var(--spacing-2);
  }

  .dz-title {
    font-weight: var(--font-weight-semibold);
    font-size: var(--font-size-xl);
    margin: 0 0 var(--spacing-1);
  }

  .dz-hint {
    margin: 0;
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
  .clear-filter {
    margin-left: 0.5rem;
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
    grid-template-columns: 100px 1fr 180px 140px 110px 120px 140px 100px 80px 100px;
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
    border: none;
    border-top: 1px solid var(--color-border);
    cursor: pointer;
    background: transparent;
    text-align: left;
    width: 100%;
    text-decoration: none;
    color: inherit;
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

  /* Category display button (readonly mode) */
  .category-display {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: var(--spacing-1) var(--spacing-2);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    transition: all var(--transition-base);
  }

  .category-display:hover {
    background: var(--color-neutral-100);
  }

  .category-display .no-category {
    color: var(--color-text-tertiary);
    font-style: italic;
  }

  /* Ajustar tamaño de columna para pills */
  .col-category {
    min-width: 200px;
  }

  /* Evitar que el nombre del emisor se pase de línea */
  .col-emisor {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .align-right {
    text-align: right;
  }
</style>
