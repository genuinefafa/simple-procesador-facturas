<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import type { PageData } from './$types';
  import { toast, Toaster } from 'svelte-sonner';
  import { onMount } from 'svelte';
  import { formatDateShort, formatCurrency } from '$lib/formatters';

  type Emitter = {
    cuit: string;
    cuitNumeric: string;
    name: string;
    displayName: string;
    legalName?: string;
    aliases?: string[];
    personType?: 'FISICA' | 'JURIDICA';
    active?: boolean;
    totalInvoices?: number;
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

  let { data }: { data: PageData } = $props();

  let emitters = $state<Emitter[]>(data.emitters || []);
  let searchQuery = $state('');
  let filteredEmitters = $derived(
    searchQuery.length >= 2
      ? emitters.filter((e) => {
          const q = searchQuery.toLowerCase();
          const qNum = searchQuery.replace(/\D/g, '');
          return (
            e.name.toLowerCase().includes(q) ||
            e.displayName.toLowerCase().includes(q) ||
            (e.aliases?.some((a) => a.toLowerCase().includes(q)) ?? false) ||
            (qNum && e.cuitNumeric.includes(qNum))
          );
        })
      : emitters
  );

  let selectedCuit = $state<string | null>(null);
  let selectedEmitter = $derived(emitters.find((e) => e.cuit === selectedCuit) || null);
  let selectedStats = $state<EmitterStats | null>(null);
  let editMode = $state(false);
  let deleteDialogOpen = $state(false);
  let createDialogOpen = $state(false);
  let saving = $state(false);
  let loadingStats = $state(false);

  // Sincronizar URL con drawer SOLO al montar (carga inicial)
  onMount(() => {
    const url = new URL(window.location.href);
    const cuitParam = url.searchParams.get('selected');
    if (cuitParam) {
      selectedCuit = cuitParam;
      loadEmitterStats(cuitParam);
    }
  });

  // Form state para edición
  let editForm = $state({
    name: '',
    legalName: '',
    aliases: '',
    personType: 'JURIDICA' as 'FISICA' | 'JURIDICA',
  });

  // Form state para creación
  let createForm = $state({
    cuit: '',
    name: '',
    legalName: '',
    aliases: '',
    personType: 'JURIDICA' as 'FISICA' | 'JURIDICA',
  });

  async function loadEmitterStats(cuit: string) {
    loadingStats = true;
    try {
      const res = await fetch(`/api/emisores/${encodeURIComponent(cuit)}`);
      const json = await res.json();
      selectedStats = json.stats || null;
    } catch (e) {
      console.error('Error loading emitter stats:', e);
      selectedStats = null;
    } finally {
      loadingStats = false;
    }
  }

  function openDrawer(emitter: Emitter) {
    selectedCuit = emitter.cuit;
    editMode = false;
    loadEmitterStats(emitter.cuit);
    updateUrl(emitter.cuit);
  }

  function closeDrawer() {
    selectedCuit = null;
    editMode = false;
    selectedStats = null;
    updateUrl(null);
  }

  function updateUrl(cuit: string | null) {
    const url = new URL(window.location.href);
    if (cuit) {
      url.searchParams.set('selected', cuit);
    } else {
      url.searchParams.delete('selected');
    }
    history.pushState({}, '', url.toString());
  }

  function startEdit() {
    if (!selectedEmitter) return;
    editForm = {
      name: selectedEmitter.name,
      legalName: selectedEmitter.legalName || '',
      aliases: selectedEmitter.aliases?.join(', ') || '',
      personType: selectedEmitter.personType || 'JURIDICA',
    };
    editMode = true;
  }

  function cancelEdit() {
    editMode = false;
  }

  async function saveEdit() {
    if (!selectedEmitter) return;

    if (!editForm.name.trim()) {
      toast.error('El nombre es requerido');
      return;
    }

    saving = true;
    try {
      const res = await fetch(`/api/emisores/${encodeURIComponent(selectedEmitter.cuit)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name.trim(),
          legalName: editForm.legalName.trim() || null,
          aliases: editForm.aliases
            .split(',')
            .map((a) => a.trim())
            .filter(Boolean),
          personType: editForm.personType,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Error al guardar');
      }

      toast.success('Emisor actualizado');
      editMode = false;
      await refreshEmitters();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      saving = false;
    }
  }

  function openDeleteDialog() {
    deleteDialogOpen = true;
  }

  async function confirmDelete() {
    if (!selectedEmitter) return;

    deleteDialogOpen = false;
    const toastId = toast.loading('Eliminando emisor...');

    try {
      const res = await fetch(`/api/emisores/${encodeURIComponent(selectedEmitter.cuit)}`, {
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
      closeDrawer();
      await refreshEmitters();
    } catch (e) {
      toast.error('Error al eliminar emisor', { id: toastId });
    }
  }

  async function refreshEmitters() {
    const res = await fetch('/api/emisores?limit=200');
    const json = await res.json();
    emitters = json.emitters || [];
  }

  function openCreateDialog() {
    createForm = {
      cuit: '',
      name: '',
      legalName: '',
      aliases: '',
      personType: 'JURIDICA',
    };
    createDialogOpen = true;
  }

  async function createEmitter() {
    if (!createForm.cuit.trim() || !createForm.name.trim()) {
      toast.error('CUIT y nombre son requeridos');
      return;
    }

    saving = true;
    try {
      const res = await fetch('/api/emisores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cuit: createForm.cuit.trim(),
          nombre: createForm.name.trim(),
          razonSocial: createForm.legalName.trim() || null,
          aliases: createForm.aliases
            .split(',')
            .map((a) => a.trim())
            .filter(Boolean)
            .join(','),
          tipoPersona: createForm.personType,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          toast.error('Ya existe un emisor con ese CUIT');
        } else {
          toast.error(json.error || 'Error al crear emisor');
        }
        return;
      }

      toast.success(`Emisor "${json.emitter.name}" creado`);
      createDialogOpen = false;
      await refreshEmitters();
    } catch (e) {
      toast.error('Error al crear emisor');
    } finally {
      saving = false;
    }
  }

  function formatAliases(aliases: string[] | undefined): string {
    if (!aliases || aliases.length === 0) return '';
    return aliases.join(', ');
  }

  // Computed: si tiene comprobantes no se puede borrar
  let canDelete = $derived(!loadingStats && (selectedStats?.totalInvoices ?? 0) === 0);
  let deleteTooltip = $derived(
    (selectedStats?.totalInvoices ?? 0) > 0
      ? `No se puede eliminar: tiene ${selectedStats?.totalInvoices} comprobante(s)`
      : 'Eliminar emisor'
  );
</script>

<svelte:head>
  <title>Emisores</title>
</svelte:head>

<div class="emisores-page">
  <div class="main-area">
    <header class="page-header">
      <div>
        <h1>Emisores</h1>
        <p class="hint">Gestión de emisores de facturas (proveedores/clientes)</p>
      </div>
      <Button onclick={openCreateDialog}>+ Nuevo Emisor</Button>
    </header>

    <div class="search-section">
      <input
        type="search"
        placeholder="Buscar por nombre, CUIT o alias..."
        bind:value={searchQuery}
        class="search-input"
      />
      <span class="result-count">
        {filteredEmitters.length} emisor{filteredEmitters.length !== 1 ? 'es' : ''}
      </span>
    </div>

    <div class="table-wrapper">
      <table class="emitters-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Aliases</th>
            <th>CUIT</th>
            <th class="col-actions">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {#if filteredEmitters.length === 0}
            <tr>
              <td colspan="4" class="empty-state">
                {searchQuery
                  ? `No se encontraron emisores para "${searchQuery}"`
                  : 'No hay emisores registrados'}
              </td>
            </tr>
          {:else}
            {#each filteredEmitters as emitter (emitter.cuit)}
              {@const isSelected = selectedCuit === emitter.cuit}
              {@const comprobantes = emitter.totalInvoices ?? 0}
              <tr class:selected={isSelected}>
                <td class="col-name">
                  <span class="name-primary">{emitter.name}</span>
                  {#if emitter.legalName && emitter.legalName !== emitter.name}
                    <span class="name-secondary">{emitter.legalName}</span>
                  {/if}
                </td>
                <td class="col-aliases">
                  {#if emitter.aliases && emitter.aliases.length > 0}
                    <span class="aliases">{formatAliases(emitter.aliases)}</span>
                  {:else}
                    <span class="no-aliases">—</span>
                  {/if}
                </td>
                <td class="col-cuit">{emitter.cuit}</td>
                <td class="col-actions">
                  <div class="row-toolbar">
                    <button
                      class="toolbar-btn"
                      title="Ver detalle"
                      onclick={() => openDrawer(emitter)}
                      class:active={isSelected}
                    >
                      👁
                    </button>
                    {#if comprobantes > 0}
                      <a
                        href="/comprobantes?q=emisor:{emitter.cuit}"
                        class="toolbar-btn comprobantes-btn"
                        title="Ver {comprobantes} comprobante(s)"
                      >
                        📄 {comprobantes}
                      </a>
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Drawer lateral -->
  {#if selectedEmitter}
    <aside class="drawer">
      <header class="drawer-header">
        <div class="drawer-title-section">
          <h2>{selectedEmitter.displayName || selectedEmitter.name}</h2>
          <p class="drawer-subtitle">{selectedEmitter.cuit}</p>
        </div>
        <button class="drawer-close" onclick={closeDrawer} aria-label="Cerrar">✕</button>
      </header>

      <div class="drawer-body">
        {#if editMode}
          <!-- Modo edición -->
          <div class="edit-form">
            <div class="form-group">
              <label for="edit-name">Nombre *</label>
              <input id="edit-name" type="text" bind:value={editForm.name} />
            </div>
            <div class="form-group">
              <label for="edit-legalName">Razón Social</label>
              <input id="edit-legalName" type="text" bind:value={editForm.legalName} />
            </div>
            <div class="form-group">
              <label for="edit-aliases">Aliases (separados por coma)</label>
              <input
                id="edit-aliases"
                type="text"
                bind:value={editForm.aliases}
                placeholder="alias1, alias2"
              />
            </div>
            <div class="form-group">
              <span class="form-label">Tipo de persona</span>
              <div class="radio-group">
                <label class="radio-label">
                  <input type="radio" bind:group={editForm.personType} value="JURIDICA" />
                  Jurídica
                </label>
                <label class="radio-label">
                  <input type="radio" bind:group={editForm.personType} value="FISICA" />
                  Física
                </label>
              </div>
            </div>
          </div>
        {:else}
          <!-- Modo vista -->
          <section class="detail-section">
            <h3>Información</h3>
            <dl class="detail-list">
              <dt>Nombre</dt>
              <dd>{selectedEmitter.name}</dd>

              {#if selectedEmitter.legalName && selectedEmitter.legalName !== selectedEmitter.name}
                <dt>Razón Social</dt>
                <dd>{selectedEmitter.legalName}</dd>
              {/if}

              {#if selectedEmitter.aliases && selectedEmitter.aliases.length > 0}
                <dt>Aliases</dt>
                <dd>{selectedEmitter.aliases.join(', ')}</dd>
              {/if}

              <dt>Tipo</dt>
              <dd>
                {selectedEmitter.personType === 'FISICA' ? 'Persona Física' : 'Persona Jurídica'}
              </dd>
            </dl>
          </section>

          <section class="detail-section">
            <h3>Estadísticas</h3>
            {#if loadingStats}
              <p class="loading">Cargando...</p>
            {:else if selectedStats}
              <dl class="detail-list">
                <dt>Comprobantes</dt>
                <dd>
                  {#if selectedStats.totalInvoices > 0}
                    <a href="/comprobantes?q=emisor:{selectedEmitter.cuit}" class="link">
                      {selectedStats.totalInvoices} comprobante{selectedStats.totalInvoices !== 1
                        ? 's'
                        : ''}
                    </a>
                    {#if selectedStats.totalFacturas !== undefined}
                      <span class="stats-breakdown">
                        ({selectedStats.totalFacturas} factura{selectedStats.totalFacturas !== 1
                          ? 's'
                          : ''},
                        {selectedStats.totalExpected ?? 0} expected,
                        {selectedStats.totalFiles ?? 0} archivo{(selectedStats.totalFiles ?? 0) !==
                        1
                          ? 's'
                          : ''})
                      </span>
                    {/if}
                  {:else}
                    <span class="muted">0</span>
                  {/if}
                </dd>

                <dt>Total facturado</dt>
                <dd>{formatCurrency(selectedStats.totalAmount)}</dd>

                {#if selectedStats.firstInvoiceDate}
                  <dt>Primera factura</dt>
                  <dd>{formatDateShort(selectedStats.firstInvoiceDate)}</dd>
                {/if}

                {#if selectedStats.lastInvoiceDate}
                  <dt>Última factura</dt>
                  <dd>{formatDateShort(selectedStats.lastInvoiceDate)}</dd>
                {/if}
              </dl>
            {:else}
              <p class="muted">Sin estadísticas</p>
            {/if}
          </section>
        {/if}
      </div>

      <footer class="drawer-actions">
        {#if editMode}
          <Button variant="secondary" onclick={cancelEdit} disabled={saving}>Cancelar</Button>
          <Button onclick={saveEdit} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        {:else}
          <button
            class="action-btn delete-btn"
            onclick={openDeleteDialog}
            disabled={!canDelete}
            title={deleteTooltip}
          >
            🗑️ Eliminar
          </button>
          <Button onclick={startEdit}>Editar</Button>
        {/if}
      </footer>
    </aside>
  {/if}
</div>

<!-- Dialog de confirmación de eliminación -->
<Dialog
  bind:open={deleteDialogOpen}
  title="Eliminar Emisor"
  description="Esta acción no se puede deshacer"
>
  {#if selectedEmitter}
    <p>¿Estás seguro de que querés eliminar a <strong>{selectedEmitter.name}</strong>?</p>
    <div class="dialog-actions">
      <Button variant="secondary" onclick={() => (deleteDialogOpen = false)}>Cancelar</Button>
      <Button variant="danger" onclick={confirmDelete}>Eliminar</Button>
    </div>
  {/if}
</Dialog>

<!-- Dialog de creación -->
<Dialog bind:open={createDialogOpen} title="Nuevo Emisor">
  <div class="edit-form">
    <div class="form-group">
      <label for="create-cuit">CUIT *</label>
      <input
        id="create-cuit"
        type="text"
        bind:value={createForm.cuit}
        placeholder="30-12345678-9"
      />
    </div>
    <div class="form-group">
      <label for="create-name">Nombre *</label>
      <input
        id="create-name"
        type="text"
        bind:value={createForm.name}
        placeholder="Nombre o razón social"
      />
    </div>
    <div class="form-group">
      <label for="create-legalName">Razón Social (si es diferente)</label>
      <input id="create-legalName" type="text" bind:value={createForm.legalName} />
    </div>
    <div class="form-group">
      <label for="create-aliases">Aliases (separados por coma)</label>
      <input
        id="create-aliases"
        type="text"
        bind:value={createForm.aliases}
        placeholder="alias1, alias2"
      />
    </div>
    <div class="form-group">
      <span class="form-label">Tipo de persona</span>
      <div class="radio-group">
        <label class="radio-label">
          <input type="radio" bind:group={createForm.personType} value="JURIDICA" />
          Jurídica
        </label>
        <label class="radio-label">
          <input type="radio" bind:group={createForm.personType} value="FISICA" />
          Física
        </label>
      </div>
    </div>
  </div>

  <div class="dialog-actions">
    <Button variant="secondary" onclick={() => (createDialogOpen = false)} disabled={saving}>
      Cancelar
    </Button>
    <Button onclick={createEmitter} disabled={saving}>
      {saving ? 'Creando...' : 'Crear Emisor'}
    </Button>
  </div>
</Dialog>

<Toaster position="top-right" richColors />

<style>
  /* Página completa - usar viewport height minus topbar */
  .emisores-page {
    display: flex;
    height: calc(100vh - 70px); /* altura del viewport menos topbar */
    margin: calc(-1 * var(--spacing-6)); /* compensar padding de content-inner */
    overflow: hidden;
  }

  /* Área principal con scroll en la tabla */
  .main-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: var(--spacing-4);
    overflow: hidden;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--spacing-4);
  }

  .page-header h1 {
    margin: 0 0 0.25rem;
  }

  .hint {
    color: var(--color-text-secondary);
    margin: 0;
    font-size: var(--font-size-sm);
  }

  .search-section {
    display: flex;
    gap: var(--spacing-3);
    align-items: center;
    margin-bottom: var(--spacing-4);
  }

  .search-input {
    flex: 1;
    max-width: 400px;
    padding: var(--spacing-2) var(--spacing-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
  }

  .search-input:focus {
    outline: none;
    border-color: var(--color-primary-500);
  }

  .result-count {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  /* Wrapper de tabla con scroll */
  .table-wrapper {
    flex: 1;
    min-height: 0;
    overflow: auto;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
  }

  .emitters-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm);
  }

  .emitters-table th {
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

  .emitters-table td {
    padding: var(--spacing-3) var(--spacing-4);
    border-bottom: 1px solid var(--color-border);
    vertical-align: middle;
  }

  .emitters-table tr:last-child td {
    border-bottom: none;
  }

  .emitters-table tr.selected {
    background: var(--color-primary-50);
  }

  .col-name {
    min-width: 200px;
  }

  .name-primary {
    display: block;
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
  }

  .name-secondary {
    display: block;
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    margin-top: 2px;
  }

  .col-aliases {
    max-width: 200px;
  }

  .aliases {
    color: var(--color-text-secondary);
    font-size: var(--font-size-xs);
  }

  .no-aliases {
    color: var(--color-text-tertiary);
  }

  .col-cuit {
    font-family: monospace;
    white-space: nowrap;
  }

  .col-actions {
    width: 140px;
    text-align: center;
  }

  .row-toolbar {
    display: flex;
    gap: var(--spacing-2);
    justify-content: center;
    align-items: center;
  }

  .toolbar-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-1);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    padding: var(--spacing-1) var(--spacing-2);
    cursor: pointer;
    font-size: var(--font-size-sm);
    text-decoration: none;
    color: inherit;
    transition: background var(--transition-fast);
  }

  .toolbar-btn:hover {
    background: var(--color-neutral-100);
  }

  .toolbar-btn.active {
    background: var(--color-primary-100);
    border-color: var(--color-primary-300);
  }

  .comprobantes-btn {
    font-size: var(--font-size-xs);
    color: var(--color-primary-600);
    font-weight: var(--font-weight-medium);
  }

  .comprobantes-btn:hover {
    background: var(--color-primary-50);
    text-decoration: none;
  }

  .empty-state {
    text-align: center;
    padding: var(--spacing-8);
    color: var(--color-text-tertiary);
    font-style: italic;
  }

  /* Drawer lateral */
  .drawer {
    width: 360px;
    display: flex;
    flex-direction: column;
    background: var(--color-surface);
    border-left: 1px solid var(--color-border);
    animation: slideIn 0.2s ease-out;
  }

  @keyframes slideIn {
    from {
      transform: translateX(20px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  .drawer-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: var(--spacing-4);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface-alt);
  }

  .drawer-title-section {
    flex: 1;
    min-width: 0;
  }

  .drawer-title-section h2 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .drawer-subtitle {
    margin: var(--spacing-1) 0 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    font-family: monospace;
  }

  .drawer-close {
    background: transparent;
    border: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    padding: var(--spacing-2);
    font-size: var(--font-size-lg);
    line-height: 1;
    border-radius: var(--radius-sm);
  }

  .drawer-close:hover {
    background: var(--color-neutral-100);
    color: var(--color-text-primary);
  }

  .drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-4);
  }

  .drawer-actions {
    padding: var(--spacing-4);
    border-top: 1px solid var(--color-border);
    background: var(--color-surface-alt);
    display: flex;
    gap: var(--spacing-3);
    justify-content: flex-end;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-1);
    padding: var(--spacing-2) var(--spacing-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .action-btn:hover:not(:disabled) {
    background: var(--color-neutral-50);
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .delete-btn:hover:not(:disabled) {
    background: var(--color-danger-50);
    border-color: var(--color-danger-200);
    color: var(--color-danger-700);
  }

  /* Secciones de detalle */
  .detail-section {
    margin-bottom: var(--spacing-5);
  }

  .detail-section h3 {
    margin: 0 0 var(--spacing-3);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .detail-list {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--spacing-2) var(--spacing-3);
    margin: 0;
  }

  .detail-list dt {
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .detail-list dd {
    margin: 0;
    font-size: var(--font-size-sm);
  }

  .stats-breakdown {
    display: block;
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    margin-top: 2px;
  }

  .link {
    color: var(--color-primary-600);
    text-decoration: none;
  }

  .link:hover {
    text-decoration: underline;
  }

  .loading,
  .muted {
    color: var(--color-text-tertiary);
    font-style: italic;
    font-size: var(--font-size-sm);
  }

  /* Formulario de edición */
  .edit-form {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
  }

  .form-group label,
  .form-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
  }

  .form-group input[type='text'] {
    padding: var(--spacing-2) var(--spacing-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
  }

  .form-group input[type='text']:focus {
    outline: none;
    border-color: var(--color-primary-500);
  }

  .radio-group {
    display: flex;
    gap: var(--spacing-4);
  }

  .radio-label {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    font-weight: normal;
    cursor: pointer;
  }

  /* Dialog */
  .dialog-actions {
    display: flex;
    gap: var(--spacing-3);
    justify-content: flex-end;
    margin-top: var(--spacing-4);
  }

  /* Responsive */
  @media (max-width: 900px) {
    .emisores-page {
      height: calc(100vh - 120px); /* más espacio para topbar en mobile */
      margin: calc(-1 * var(--spacing-4));
    }

    .drawer {
      position: fixed;
      top: 70px;
      right: 0;
      height: calc(100vh - 70px);
      z-index: 100;
      box-shadow: var(--shadow-xl);
    }
  }

  @media (max-width: 768px) {
    .emisores-page {
      flex-direction: column;
    }

    .drawer {
      width: 100%;
      max-width: 100%;
    }
  }
</style>
