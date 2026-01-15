<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import CategoryPills from '$lib/components/CategoryPills.svelte';
  import SearchBox from '$lib/components/SearchBox.svelte';
  import ActiveFilters from '$lib/components/ActiveFilters.svelte';
  import UploadReport from '$lib/components/UploadReport.svelte';
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
    formatFileStatus,
    formatComprobanteKind,
  } from '$lib/formatters';
  import { createFilterMatcher, serializeFilters, type FilterNode } from '$lib/search';

  let { data } = $props();
  let categories = $derived(data.categories || []);
  // null => Sin categoría; undefined => todas; number => específica
  let activeCategoryId = $state<number | undefined | null>(undefined);

  // Track which invoice is being edited for category
  let editingCategoryId = $state<number | null>(null);

  type FilterKind = 'all' | 'pendientes' | 'reconocidas' | 'esperadas';

  // Cargar filtro desde la URL (?f=...) o localStorage; por defecto 'all'
  let activeFilter = $state<FilterKind>('all');

  // Estado para búsqueda meta-lenguaje
  let searchQuery = $state('');
  let searchFilters = $state<FilterNode[]>([]);

  // Filter matcher
  const matchesSearchFilter = $derived(createFilterMatcher(categories));

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

      // Restaurar query de búsqueda desde URL
      const q = $page.url.searchParams.get('q');
      if (q) {
        searchQuery = q;
      } else {
        // Si no hay query en URL, intentar restaurar desde localStorage
        const savedFilters = localStorage.getItem('comprobantes-search-filters');
        if (savedFilters) {
          try {
            const state = JSON.parse(savedFilters);
            if (state.version === 1 && Date.now() - state.timestamp < 7 * 24 * 60 * 60 * 1000) {
              searchQuery = state.query || '';
            }
          } catch (e) {
            console.warn('Failed to restore search filters', e);
          }
        }
      }
    }
  });

  // Persistir filtros de búsqueda en localStorage
  $effect(() => {
    if (typeof window !== 'undefined') {
      const state = {
        version: 1,
        query: searchQuery,
        categoryId: activeCategoryId,
        statusFilter: activeFilter,
        timestamp: Date.now(),
      };
      localStorage.setItem('comprobantes-search-filters', JSON.stringify(state));
    }
  });

  // Sincronizar cambios de filtro con URL y localStorage (SPA)
  async function updateUrlForFilter(kind: FilterKind) {
    const current = $state.snapshot(activeFilter);
    if (current === kind) return;
    activeFilter = kind;
    if (typeof window !== 'undefined') {
      localStorage.setItem('comprobantes-filter', kind);

      const params = new URLSearchParams();
      if (searchQuery) params.set('q', searchQuery);
      if (kind !== 'all') params.set('f', kind);

      const target = params.toString() ? `/comprobantes?${params}` : '/comprobantes';
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
    if (c.file) {
      return c.file.originalFilename;
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
        // Incluir facturas finalizadas y archivos procesados
        if (!(!!c.final || c.file?.status === 'processed')) return false;
        break;
      case 'esperadas':
        if (!(!!c.expected && !c.final)) return false;
        break;
      case 'pendientes':
        // Mostrar todos los comprobantes de tipo pending (sin factura finalizada)
        if (!c.file || c.final) return false;
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

    // Filtros de búsqueda meta-lenguaje
    for (const filter of searchFilters) {
      if (!matchesSearchFilter(c, filter)) return false;
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

  // Estado para upload report
  let uploadResult = $state<{
    uploadedFiles: any[];
    errors: any[];
  } | null>(null);

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

  // Helpers para búsqueda meta-lenguaje
  let visibleComprobantes = $derived(data.comprobantes.filter(isVisible));

  let hasActiveFilters = $derived(
    activeFilter !== 'all' || activeCategoryId !== undefined || searchFilters.length > 0
  );

  function clearAllFilters() {
    searchQuery = '';
    searchFilters = [];
    activeCategoryId = undefined;
    updateUrlForFilter('all');
  }

  function removeFilter(filter: FilterNode) {
    const remaining = searchFilters.filter((f) => f !== filter);
    searchQuery = serializeFilters(remaining);
  }

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
      const toastId = toast.loading(
        `Subiendo ${others.length} archivo${others.length > 1 ? 's' : ''}...`
      );

      try {
        const response = await fetch('/api/invoices/upload', { method: 'POST', body: fd });
        const data = await response.json();

        toast.dismiss(toastId);

        // Guardar resultado para mostrar en el report
        uploadResult = {
          uploadedFiles: data.uploadedFiles || [],
          errors: data.errors || [],
        };

        // Recargar datos para reflejar los nuevos pending files
        await invalidateAll();
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Error de conexión';
        toast.error(`Error al subir archivos: ${errorMsg}`, { id: toastId, duration: Infinity });
      }
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

  <!-- Upload Report o Dropzone -->
  {#if uploadResult}
    <UploadReport
      uploadedFiles={uploadResult.uploadedFiles}
      errors={uploadResult.errors}
      onClose={() => (uploadResult = null)}
    />
  {:else}
    <!-- Dropzone compacto clickeable -->
    <div class="dropzone-wrapper">
      <div {...fileUpload.dropzone} class="dropzone-compact">
        <span class="dz-compact-hint"
          >📎 Click para subir archivos o arrastrá a cualquier parte</span
        >
      </div>
      <input {...fileUpload.input} />
    </div>
  {/if}

  <!-- BÚSQUEDA META-LENGUAJE -->
  <section class="search-section">
    <SearchBox
      bind:value={searchQuery}
      onfilter={(filters) => (searchFilters = filters)}
      {categories}
    />
  </section>

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

  <!-- RESUMEN DE FILTROS + LIMPIAR -->
  {#if hasActiveFilters}
    <section class="filter-summary">
      <div class="count">
        Mostrando {visibleComprobantes.length} de {data.comprobantes.length} comprobantes
      </div>
      <button class="clear-all" onclick={clearAllFilters} type="button">
        Limpiar todos los filtros
      </button>
    </section>
  {/if}

  <!-- FILTROS ACTIVOS VISUALES -->
  {#if searchFilters.length > 0}
    <section class="active-filters-section">
      <ActiveFilters filters={searchFilters} onremove={removeFilter} />
    </section>
  {/if}

  <section class="list">
    <div class="list-head">
      <span>Comprobante / Archivo</span>
      <span>Emisor (CUIT)</span>
      <span>Fecha</span>
      <span class="align-right">Total</span>
      <span>Categoría</span>
      <span>Tipo / Estado</span>
      <span>Hash</span>
      <span></span>
    </div>
    {#each visibleComprobantes as comp}
      {@const uploadDate = comp.file?.uploadDate || comp.final?.processedAt}
      {@const uploadDateOnly = uploadDate ? uploadDate.split(' ')[0] : null}
      {@const issueDate =
        comp.final?.issueDate || comp.expected?.issueDate || comp.file?.extractedDate}
      {@const dateToShow = issueDate || uploadDateOnly}
      {@const isProvisionalDate = !issueDate && uploadDateOnly}
      {@const hasEmitter = !!(
        getEmitterName(comp).short ||
        comp.final?.cuit ||
        comp.expected?.cuit ||
        comp.file?.extractedCuit
      )}
      <div class="row">
        <!-- Columna 1: Comprobante/Archivo -->
        <span class="col-cmp" class:col-cmp-extended={!hasEmitter}>
          {formatComprobante(comp)}
        </span>

        <!-- Columna 2: Emisor (CUIT) -->
        <span
          class="col-emisor-cuit"
          class:hidden={!hasEmitter}
          title={getEmitterName(comp).full || undefined}
        >
          {#if getEmitterName(comp).short}
            <span class="emitter-name">{getEmitterName(comp).short}</span>
            <span class="cuit-inline"
              >{comp.final?.cuit || comp.expected?.cuit || comp.file?.extractedCuit || '—'}</span
            >
          {:else}
            {comp.final?.cuit || comp.expected?.cuit || comp.file?.extractedCuit || '—'}
          {/if}
        </span>

        <!-- Columna 3: Fecha -->
        <span
          class="col-date"
          class:provisional-date={isProvisionalDate}
          title={isProvisionalDate
            ? 'Fecha de upload (provisoria, no se extrajo fecha de emisión)'
            : undefined}
        >
          {dateToShow ? formatDateShort(dateToShow) : '—'}
        </span>
        <span class="col-total align-right"
          >{formatCurrency(
            comp.final?.total ?? comp.expected?.total ?? comp.file?.extractedTotal
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
        <span class="col-type-status">
          {#if comp.final}
            <span class="tag ok">Factura</span>
          {:else if comp.expected}
            <span class="tag warn">Esperada</span>
            {#if comp.expected.status}
              <span class="tag info">{comp.expected.status}</span>
            {/if}
          {:else if comp.file}
            <span class="tag neutral">Pendiente</span>
            <span class="tag info">{formatFileStatus(comp.file.status)}</span>
          {/if}
        </span>
        <span class="col-hash"
          >{comp.final?.fileHash || comp.file?.fileHash
            ? shortHash(comp.final?.fileHash || comp.file?.fileHash)
            : '—'}</span
        >
        <span class="col-actions"
          ><a href="/comprobantes/{comp.id}"><Button size="sm">Ver</Button></a></span
        >
      </div>
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
    grid-template-columns: 180px 300px 85px 120px 90px 180px 60px 60px;
    gap: var(--spacing-2);
    padding: var(--spacing-2) var(--spacing-3);
    align-items: center;
  }
  .list-head {
    background: var(--color-surface-alt);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    font-weight: var(--font-weight-medium);
  }
  .row {
    border: none;
    border-top: 1px solid var(--color-border);
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
  .tag.neutral {
    background: var(--color-neutral-50);
    color: var(--color-text-tertiary);
    border-color: var(--color-neutral-200);
  }

  /* Columna tipo/estado con múltiples tags */
  .col-type-status {
    display: flex;
    gap: var(--spacing-1);
    flex-wrap: wrap;
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

  /* Columna de comprobante */
  .col-cmp {
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: var(--font-size-sm);
  }

  /* Comprobante extendido cuando no hay emisor */
  .col-cmp-extended {
    grid-column: span 2;
  }

  /* Ocultar emisor pero mantener en grid */
  .hidden {
    visibility: hidden;
    width: 0;
    padding: 0;
    overflow: hidden;
  }

  /* Fecha provisional (upload date como fallback) */
  .provisional-date {
    color: var(--color-warning);
    font-style: italic;
    cursor: help;
  }

  /* Emisor y CUIT en la misma columna */
  .col-emisor-cuit {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--spacing-2);
    font-size: var(--font-size-sm);
  }

  .emitter-name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: left;
  }

  .cuit-inline {
    color: var(--color-text-tertiary);
    font-size: var(--font-size-xs);
    white-space: nowrap;
    text-align: right;
  }

  /* Total con tipografía monospace */
  .col-total {
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: var(--font-size-sm);
  }

  /* Hash más compacto */
  .col-hash {
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }

  /* Botón Ver sin cursor pointer en toda la fila */
  .col-actions {
    display: flex;
    justify-content: flex-end;
  }

  .col-actions a {
    text-decoration: none;
  }

  .align-right {
    text-align: right;
  }

  /* Búsqueda meta-lenguaje */
  .search-section {
    margin-bottom: var(--spacing-3);
  }

  .filter-summary {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-3);
    padding: var(--spacing-2) var(--spacing-3);
    background: var(--color-surface-alt);
    border-radius: var(--radius-md);
  }

  .filter-summary .count {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .clear-all {
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    border-radius: var(--radius-md);
    padding: var(--spacing-1) var(--spacing-3);
    cursor: pointer;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    transition: all var(--transition-fast);
  }

  .clear-all:hover {
    border-color: var(--color-error);
    color: var(--color-error);
    background: #fef2f2;
  }

  .active-filters-section {
    margin-bottom: var(--spacing-3);
  }
</style>
