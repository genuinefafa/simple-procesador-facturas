<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import CategoryPills from '$lib/components/CategoryPills.svelte';
  import CategorySelect from '$lib/components/CategorySelect.svelte';
  import CompletenessIndicator from '$lib/components/CompletenessIndicator.svelte';
  import UnifiedSearchBox from '$lib/components/UnifiedSearchBox.svelte';
  import UploadReport from '$lib/components/UploadReport.svelte';
  import type { PageData } from './$types';
  import type { Comprobante } from '$lib/types/comprobante';
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
    formatCuit,
  } from '$lib/formatters';
  import { createFilterMatcher, type FilterNode } from '$lib/search';
  import { navigationStore } from '$lib/stores/navigation';
  import { comprobanteService } from '$lib/services/ComprobanteService';

  let { data } = $props();
  let categories = $derived(data.categories || []);

  // Estado unificado para búsqueda meta-lenguaje (incluye estado y categoría)
  let searchQuery = $state('');
  let searchFilters = $state<FilterNode[]>([]);

  // Filter matcher
  const matchesSearchFilter = $derived(createFilterMatcher(categories));

  // Extraer lista de emisores únicos de los comprobantes
  let emitters = $derived(() => {
    const seen = new Set<string>();
    const result: Array<{ name: string; cuit?: string }> = [];

    for (const c of data.comprobantes) {
      const name = c.emitterName || c.final?.emitterName || c.expected?.emitterName;
      const cuit = c.emitterCuit || c.final?.cuit || c.expected?.cuit;

      if (name && !seen.has(name)) {
        seen.add(name);
        result.push({ name, cuit: cuit ?? undefined });
      }
    }

    return result.sort((a, b) => a.name.localeCompare(b.name));
  });

  // Restaurar query de búsqueda desde URL o localStorage
  $effect.pre(() => {
    if (typeof window !== 'undefined') {
      const q = $page.url.searchParams.get('q');
      if (q) {
        searchQuery = q;
      } else {
        // Si no hay query en URL, intentar restaurar desde localStorage
        const savedFilters = localStorage.getItem('comprobantes-search-filters');
        if (savedFilters) {
          try {
            const state = JSON.parse(savedFilters);
            if (state.version === 2 && Date.now() - state.timestamp < 7 * 24 * 60 * 60 * 1000) {
              searchQuery = state.query || '';
            }
          } catch (e) {
            console.warn('Failed to restore search filters', e);
          }
        }
      }
    }
  });

  // Persistir filtros de búsqueda en localStorage y URL
  $effect(() => {
    if (typeof window !== 'undefined') {
      const state = {
        version: 2,
        query: searchQuery,
        timestamp: Date.now(),
      };
      localStorage.setItem('comprobantes-search-filters', JSON.stringify(state));

      // Actualizar URL sin recargar (trim para URLs limpias y compartibles)
      const params = new URLSearchParams();
      const trimmed = searchQuery.trim();
      if (trimmed) params.set('q', trimmed);
      const target = params.toString() ? `/comprobantes?${params}` : '/comprobantes';

      // Evitar goto() redundante si la URL ya coincide (ej: carga inicial desde link compartido)
      const currentPath = `${$page.url.pathname}${$page.url.search}`;
      if (target !== currentPath) {
        goto(target, { replaceState: true, noScroll: true, keepFocus: true });
      }
    }
  });

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
    // No truncar - dejar que CSS maneje el overflow con text-overflow: ellipsis
    return { short: name || '', full: name || '' };
  }

  function isVisible(c: Comprobante): boolean {
    // Todos los filtros se aplican via meta-lenguaje (AND lógico)
    for (const filter of searchFilters) {
      if (!matchesSearchFilter(c, filter)) return false;
    }
    return true;
  }

  /**
   * Actualiza la categoría de una factura procesada
   */
  async function updateCategory(invoiceId: number, categoryId: number | null | undefined) {
    const result = await comprobanteService.updateInvoiceCategory(
      invoiceId,
      categoryId === undefined ? null : categoryId
    );
    if (result.success) {
      toast.success('Categoría actualizada');
      await invalidateAll();
    } else {
      toast.error(result.error || 'Error al actualizar categoría');
    }
  }

  /**
   * Actualiza la categoría de un expected invoice
   */
  async function updateExpectedCategory(expectedId: number, categoryId: number | null) {
    const result = await comprobanteService.updateExpectedInvoiceCategory(expectedId, categoryId);
    if (result.success) {
      toast.success('Categoría actualizada');
      await invalidateAll();
    } else {
      toast.error(result.error || 'Error al actualizar categoría');
    }
  }

  /**
   * Actualiza la categoría de un archivo
   */
  async function updateFileCategory(fileId: number, categoryId: number | null) {
    const result = await comprobanteService.updateFileCategory(fileId, categoryId);
    if (result.success) {
      toast.success('Categoría actualizada');
      await invalidateAll();
    } else {
      toast.error(result.error || 'Error al actualizar categoría');
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

  // Categoría pre-seleccionada para uploads
  let uploadCategoryId = $state<number | null>(null);

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

  let hasActiveFilters = $derived(searchFilters.length > 0);

  function clearAllFilters() {
    searchQuery = '';
    searchFilters = [];
  }

  /**
   * Navega al detalle de un comprobante guardando el contexto de navegación.
   */
  function navigateToDetail(compId: string) {
    // Guardar los IDs de la lista visible actual para navegación prev/next
    const ids = visibleComprobantes.map((c) => c.id);
    navigationStore.setContext(ids, searchQuery || undefined);
    goto(`/comprobantes/${compId}`);
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
      // Agregar categoría pre-seleccionada si existe
      if (uploadCategoryId !== null) {
        fd.append('categoryId', String(uploadCategoryId));
      }
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
    <!-- Dropzone compacto clickeable con selector de categoría -->
    <div class="dropzone-wrapper">
      <div {...fileUpload.dropzone} class="dropzone-compact">
        <span class="dz-compact-hint"
          >📎 Click para subir archivos o arrastrá a cualquier parte</span
        >
      </div>
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        class="upload-category-wrapper"
        role="group"
        aria-label="Selector de categoría para archivos subidos"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
      >
        <span class="upload-category-label">Categoría:</span>
        <div class="upload-category-select">
          <CategorySelect {categories} bind:value={uploadCategoryId} />
        </div>
      </div>
      <input {...fileUpload.input} />
    </div>
  {/if}

  <!-- BÚSQUEDA UNIFICADA -->
  <section class="search-section">
    <UnifiedSearchBox
      bind:value={searchQuery}
      onfilter={(filters) => (searchFilters = filters)}
      {categories}
      emitters={emitters()}
    />
  </section>

  <!-- RESUMEN DE FILTROS -->
  {#if hasActiveFilters}
    <section class="filter-summary">
      <div class="count">
        Mostrando {visibleComprobantes.length} de {data.comprobantes.length} comprobantes
      </div>
      <button class="clear-all" onclick={clearAllFilters} type="button"> Limpiar filtros </button>
    </section>
  {/if}

  <section class="list">
    <div class="list-head">
      <span>Comprobante / Archivo</span>
      <span>Emisor (CUIT)</span>
      <span>Fecha</span>
      <span class="align-right">Total</span>
      <span>Categoría</span>
      <span>Estado</span>
      <span>Hash</span>
      <span></span>
    </div>
    {#each visibleComprobantes as comp}
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
              >{formatCuit(
                comp.final?.cuit || comp.expected?.cuit || comp.file?.extractedCuit
              )}</span
            >
          {:else}
            {formatCuit(comp.final?.cuit || comp.expected?.cuit || comp.file?.extractedCuit)}
          {/if}
        </span>

        <!-- Columna 3: Fecha -->
        <span class="col-date">
          {comp.effectiveDate ? formatDateShort(comp.effectiveDate) : '—'}
        </span>
        <span class="col-total align-right"
          >{formatCurrency(
            comp.final?.total ?? comp.expected?.total ?? comp.file?.extractedTotal
          )}</span
        >
        <span class="col-category">
          {#if comp.final}
            <CategorySelect
              {categories}
              value={comp.final.categoryId ?? null}
              onchange={(id: number | null) => comp.final && updateCategory(comp.final.id, id)}
            />
          {:else if comp.expected}
            <CategorySelect
              {categories}
              value={comp.expected.categoryId ?? null}
              onchange={(id: number | null) =>
                comp.expected && updateExpectedCategory(comp.expected.id, id)}
            />
          {:else if comp.file}
            <CategorySelect
              {categories}
              value={comp.file.categoryId ?? null}
              onchange={(id: number | null) => comp.file && updateFileCategory(comp.file.id, id)}
            />
          {:else}
            —
          {/if}
        </span>
        <span class="col-type-status">
          <CompletenessIndicator comprobante={comp} />
        </span>
        <span class="col-hash"
          >{comp.final?.fileHash || comp.file?.fileHash
            ? shortHash(comp.final?.fileHash || comp.file?.fileHash)
            : '—'}</span
        >
        <span class="col-actions">
          <Button size="sm" onclick={() => navigateToDetail(comp.id)}>Ver</Button>
        </span>
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
    display: flex;
    gap: var(--spacing-3);
    align-items: center;
    margin-bottom: var(--spacing-4);
  }

  .dropzone-compact {
    flex: 1;
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

  .upload-category-wrapper {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    flex-shrink: 0;
    cursor: default;
  }

  .upload-category-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    white-space: nowrap;
  }

  .upload-category-select {
    width: 160px;
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

  .list {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: var(--color-surface);
  }
  .list-head,
  .row {
    display: grid;
    /* Comprobante | Emisor (flexible) | Fecha | Total | Categoría | Estado | Hash | Acción */
    grid-template-columns: 180px minmax(200px, 1fr) 85px 110px 150px 90px 70px 60px;
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

  /* Columna de comprobante */
  .col-cmp {
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: var(--font-size-sm);
  }

  /* Comprobante extendido cuando no hay emisor */
  .col-cmp-extended {
    grid-column: span 2;
  }

  /* Emisor y CUIT en la misma columna */
  .col-emisor-cuit {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--spacing-2);
    font-size: var(--font-size-sm);
  }

  /* Ocultar emisor y quitar del grid flow (para que col-cmp-extended span 2 funcione).
     Debe ir después de .col-emisor-cuit para ganar por cascade. */
  .hidden {
    display: none;
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

  /* Botón Ver */
  .col-actions {
    display: flex;
    justify-content: flex-end;
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
