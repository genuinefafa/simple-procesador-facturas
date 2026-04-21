<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { toast, Toaster } from 'svelte-sonner';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import EmitterHeader from '$lib/components/EmitterHeader.svelte';
  import { ArrowLeft, CheckCircle, AlertCircle, RefreshCw } from '$lib/components/icons';
  import { formatDateShort, formatInvoiceLabel } from '$lib/formatters';

  type Emitter = {
    cuit: string;
    name: string;
    displayName: string;
    legalName?: string;
    aliases?: string[];
    personType?: 'FISICA' | 'JURIDICA';
    active?: boolean;
  };

  type EmitterStats = {
    totalInvoices: number;
    totalFacturas?: number;
    totalExpected?: number;
    totalFiles?: number;
    totalAmount: number;
    firstInvoiceDate: string | null;
    lastInvoiceDate: string | null;
  };

  type Archivo = {
    invoiceId: number;
    issueDate: string | null;
    invoiceType: number | null;
    pointOfSale: number | null;
    invoiceNumber: number | null;
    categoryId: number | null;
    currentStoragePath: string;
    canonicalRelativePath: string;
    isInconsistent: boolean;
  };

  let cuit = $derived(page.params.id);

  let emitter = $state<Emitter | null>(null);
  let stats = $state<EmitterStats | null>(null);
  let archivos = $state<Archivo[]>([]);
  let loading = $state(true);
  let loadingStats = $state(false);
  let loadingArchivos = $state(false);
  let errorMsg = $state<string | null>(null);
  let deleteDialogOpen = $state(false);
  let renamingIds = $state(new Set<number>());

  let renameDialogFile = $state<Archivo | null>(null);
  let renameDialogOpen = $state(false);

  $effect(() => {
    if (cuit) {
      loadAll(cuit);
    }
  });

  async function loadAll(id: string) {
    loading = true;
    errorMsg = null;
    await Promise.all([loadEmitter(id), loadArchivos(id)]);
    loading = false;
  }

  async function loadEmitter(id: string) {
    loadingStats = true;
    try {
      const res = await fetch(`/api/emisores/${encodeURIComponent(id)}`);
      if (!res.ok) {
        if (res.status === 404) {
          errorMsg = 'Emisor no encontrado.';
        } else {
          errorMsg = 'Error al cargar el emisor.';
        }
        return;
      }
      const json = await res.json();
      emitter = json.emitter || null;
      stats = json.stats || null;
    } catch {
      errorMsg = 'Error de red al cargar el emisor.';
    } finally {
      loadingStats = false;
    }
  }

  async function loadArchivos(id: string) {
    loadingArchivos = true;
    try {
      const res = await fetch(`/api/emisores/${encodeURIComponent(id)}/archivos`);
      if (res.ok) {
        const json = await res.json();
        archivos = json.archivos || [];
      }
    } catch {
      // silencioso — la sección de archivos queda vacía
    } finally {
      loadingArchivos = false;
    }
  }

  async function handleSave(data: {
    name: string;
    legalName: string | null;
    aliases: string[];
    personType: 'FISICA' | 'JURIDICA';
  }) {
    if (!emitter) return;

    if (!data.name.trim()) {
      toast.error('El nombre es requerido');
      throw new Error('El nombre es requerido');
    }

    const res = await fetch(`/api/emisores/${encodeURIComponent(emitter.cuit)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const json = await res.json();
      const msg = json.error || 'Error al guardar';
      toast.error(msg);
      throw new Error(msg);
    }

    toast.success('Emisor actualizado');
    await loadEmitter(emitter.cuit);
  }

  function openDeleteDialog() {
    deleteDialogOpen = true;
  }

  async function confirmDelete() {
    if (!emitter) return;
    deleteDialogOpen = false;
    const toastId = toast.loading('Eliminando emisor...');
    try {
      const res = await fetch(`/api/emisores/${encodeURIComponent(emitter.cuit)}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          toast.error(`No se puede eliminar: ${json.reason}`, { id: toastId });
        } else {
          toast.error(json.error || 'Error al eliminar', { id: toastId });
        }
        return;
      }
      toast.success('Emisor eliminado', { id: toastId });
      goto('/emisores');
    } catch {
      toast.error('Error al eliminar emisor', { id: toastId });
    }
  }

  function openRenameDialog(archivo: Archivo) {
    renameDialogFile = archivo;
    renameDialogOpen = true;
  }

  async function confirmRename() {
    if (!renameDialogFile || !emitter) return;
    renameDialogOpen = false;
    const id = renameDialogFile.invoiceId;

    renamingIds = new Set([...renamingIds, id]);
    try {
      const res = await fetch(`/api/emisores/${encodeURIComponent(emitter.cuit)}/archivos/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceIds: [id] }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Error al renombrar');
        return;
      }
      const renamed: unknown[] = json.renamed ?? [];
      const failed: { reason?: string }[] = json.failed ?? [];
      const skipped: unknown[] = json.skipped ?? [];
      if (renamed.length > 0) {
        toast.success('Archivo renombrado correctamente');
      } else if (skipped.length > 0) {
        toast.info('El archivo ya tenía el nombre correcto');
      } else if (failed.length > 0) {
        toast.error(failed[0]?.reason || 'No se pudo renombrar el archivo');
      }
      await loadArchivos(emitter.cuit);
    } catch {
      toast.error('Error de red al renombrar');
    } finally {
      renamingIds = new Set([...renamingIds].filter((x) => x !== id));
    }
  }

  function currentFileName(path: string): string {
    return path.split('/').at(-1) || path;
  }

  function canonicalFileName(path: string): string {
    return path.split('/').at(-1) || path;
  }
</script>

<svelte:head>
  <title>{emitter ? emitter.displayName || emitter.name : 'Emisor'} — Detalle</title>
</svelte:head>

<div class="detail-page">
  <nav class="breadcrumb">
    <a href="/emisores" class="back-link"><ArrowLeft size={16} /> Volver a emisores</a>
  </nav>

  {#if loading}
    <p class="loading-msg">Cargando...</p>
  {:else if errorMsg}
    <div class="error-state">
      <p>{errorMsg}</p>
      <Button variant="secondary" onclick={() => goto('/emisores')}>
        <ArrowLeft size={16} /> Volver
      </Button>
    </div>
  {:else if emitter}
    <EmitterHeader
      {emitter}
      {stats}
      {loadingStats}
      showDelete={true}
      onsave={handleSave}
      ondelete={openDeleteDialog}
    />

    <section class="archivos-section">
      <header class="section-header">
        <h2>Archivos relacionados</h2>
        {#if loadingArchivos}
          <span class="loading-inline">Cargando...</span>
        {:else}
          <span class="count-badge">
            {archivos.length} archivo{archivos.length !== 1 ? 's' : ''}
          </span>
        {/if}
      </header>

      {#if !loadingArchivos}
        {#if archivos.length === 0}
          <p class="empty-state">No hay archivos registrados para este emisor.</p>
        {:else}
          <div class="table-wrapper">
            <table class="archivos-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Comprobante</th>
                  <th>Archivo actual</th>
                  <th>Estado</th>
                  <th class="col-actions">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {#each archivos as archivo (archivo.invoiceId)}
                  <tr>
                    <td class="col-date">{formatDateShort(archivo.issueDate)}</td>
                    <td class="col-invoice">
                      {formatInvoiceLabel(
                        archivo.invoiceType,
                        archivo.pointOfSale,
                        archivo.invoiceNumber
                      )}
                    </td>
                    <td class="col-path" title={archivo.currentStoragePath}>
                      {currentFileName(archivo.currentStoragePath)}
                    </td>
                    <td class="col-status">
                      {#if archivo.isInconsistent}
                        <span class="badge badge-warning">
                          <AlertCircle size={12} /> desactualizado
                        </span>
                      {:else}
                        <span class="badge badge-ok">
                          <CheckCircle size={12} /> consistente
                        </span>
                      {/if}
                    </td>
                    <td class="col-actions">
                      <button
                        class="rename-btn"
                        disabled={!archivo.isInconsistent || renamingIds.has(archivo.invoiceId)}
                        onclick={() => openRenameDialog(archivo)}
                        title={archivo.isInconsistent
                          ? 'Renombrar al nombre canónico'
                          : 'El archivo ya tiene el nombre correcto'}
                      >
                        <RefreshCw size={14} />
                        {renamingIds.has(archivo.invoiceId) ? 'Renombrando...' : 'Renombrar'}
                      </button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      {/if}
    </section>
  {/if}
</div>

<Dialog
  bind:open={deleteDialogOpen}
  title="Eliminar Emisor"
  description="Esta acción no se puede deshacer"
>
  {#if emitter}
    <p>¿Estás seguro de que querés eliminar a <strong>{emitter.name}</strong>?</p>
    <div class="dialog-actions">
      <Button variant="secondary" onclick={() => (deleteDialogOpen = false)}>Cancelar</Button>
      <Button variant="danger" onclick={confirmDelete}>Eliminar</Button>
    </div>
  {/if}
</Dialog>

<Dialog bind:open={renameDialogOpen} title="Renombrar archivo">
  {#if renameDialogFile}
    <div class="rename-preview">
      <div class="rename-row">
        <span class="rename-label">Actual</span>
        <code class="rename-path">{currentFileName(renameDialogFile.currentStoragePath)}</code>
      </div>
      <div class="rename-arrow">→</div>
      <div class="rename-row">
        <span class="rename-label">Nuevo</span>
        <code class="rename-path">{canonicalFileName(renameDialogFile.canonicalRelativePath)}</code>
      </div>
    </div>
    <div class="dialog-actions">
      <Button variant="secondary" onclick={() => (renameDialogOpen = false)}>Cancelar</Button>
      <Button onclick={confirmRename}>Confirmar</Button>
    </div>
  {/if}
</Dialog>

<Toaster position="top-right" richColors />

<style>
  .detail-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-6);
    max-width: 960px;
  }

  .breadcrumb {
    display: flex;
    align-items: center;
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-2);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    text-decoration: none;
    transition: color var(--transition-fast);
  }

  .back-link:hover {
    color: var(--color-text-primary);
  }

  .loading-msg {
    color: var(--color-text-tertiary);
    font-style: italic;
    font-size: var(--font-size-sm);
    padding: var(--spacing-8) 0;
  }

  .error-state {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-4);
    padding: var(--spacing-8) 0;
    color: var(--color-text-secondary);
  }

  .archivos-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
  }

  .section-header h2 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
  }

  .count-badge {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    background: var(--color-surface-alt);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    padding: 2px var(--spacing-2);
  }

  .loading-inline {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    font-style: italic;
  }

  .empty-state {
    color: var(--color-text-tertiary);
    font-style: italic;
    font-size: var(--font-size-sm);
  }

  .table-wrapper {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow: auto;
    background: var(--color-surface);
  }

  .archivos-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm);
  }

  .archivos-table th {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: var(--spacing-3) var(--spacing-4);
    background: var(--color-surface-alt);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-secondary);
    text-align: left;
    border-bottom: 1px solid var(--color-border);
    text-transform: uppercase;
    font-size: var(--font-size-xs);
    letter-spacing: 0.05em;
  }

  .archivos-table td {
    padding: var(--spacing-3) var(--spacing-4);
    border-bottom: 1px solid var(--color-border);
    vertical-align: middle;
  }

  .archivos-table tr:last-child td {
    border-bottom: none;
  }

  .col-date {
    white-space: nowrap;
    width: 80px;
  }

  .col-invoice {
    font-family: monospace;
    white-space: nowrap;
  }

  .col-path {
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text-secondary);
    font-family: monospace;
    font-size: var(--font-size-xs);
  }

  .col-status {
    white-space: nowrap;
  }

  .col-actions {
    width: 120px;
    text-align: center;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px var(--spacing-2);
    border-radius: var(--radius-full);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
  }

  .badge-ok {
    background: var(--color-success-50, #f0fdf4);
    color: var(--color-success-700, #15803d);
  }

  .badge-warning {
    background: var(--color-warning-50, #fffbeb);
    color: var(--color-warning-700, #b45309);
  }

  .rename-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-1);
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--spacing-1) var(--spacing-2);
    cursor: pointer;
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    transition: all var(--transition-fast);
  }

  .rename-btn:hover:not(:disabled) {
    background: var(--color-primary-50);
    border-color: var(--color-primary-300);
    color: var(--color-primary-700);
  }

  .rename-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .rename-preview {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
    padding: var(--spacing-3);
    background: var(--color-surface-alt);
    border-radius: var(--radius-md);
    margin-bottom: var(--spacing-4);
  }

  .rename-row {
    display: flex;
    align-items: baseline;
    gap: var(--spacing-2);
  }

  .rename-label {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    min-width: 50px;
  }

  .rename-path {
    font-size: var(--font-size-xs);
    font-family: monospace;
    color: var(--color-text-primary);
    word-break: break-all;
  }

  .rename-arrow {
    color: var(--color-text-tertiary);
    font-size: var(--font-size-lg);
    padding-left: calc(50px + var(--spacing-2));
  }

  .dialog-actions {
    display: flex;
    gap: var(--spacing-3);
    justify-content: flex-end;
    margin-top: var(--spacing-4);
  }
</style>
