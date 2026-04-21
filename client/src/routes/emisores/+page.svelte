<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import type { PageData } from './$types';
  import { toast, Toaster } from 'svelte-sonner';
  import { goto } from '$app/navigation';
  import { formatCuit } from '$lib/formatters';
  import { Plus, Eye, FileText } from '$lib/components/icons';

  type Emitter = {
    cuit: string;
    name: string;
    displayName: string;
    legalName?: string;
    aliases?: string[];
    personType?: 'FISICA' | 'JURIDICA';
    active?: boolean;
    totalInvoices?: number;
  };

  let { data }: { data: PageData } = $props();

  let emitters = $state<Emitter[]>([]);
  $effect(() => {
    emitters = data.emitters || [];
  });
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
            (qNum && e.cuit.includes(qNum))
          );
        })
      : emitters
  );

  let createDialogOpen = $state(false);
  let saving = $state(false);

  // Form state para creación
  let createForm = $state({
    cuit: '',
    name: '',
    legalName: '',
    aliases: '',
    personType: 'JURIDICA' as 'FISICA' | 'JURIDICA',
  });

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
      <Button onclick={openCreateDialog}><Plus size={16} /> Nuevo Emisor</Button>
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
              {@const comprobantes = emitter.totalInvoices ?? 0}
              <tr>
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
                <td class="col-cuit">{formatCuit(emitter.cuit)}</td>
                <td class="col-actions">
                  <div class="row-toolbar">
                    <a
                      href="/emisores/{encodeURIComponent(emitter.cuit)}"
                      class="toolbar-btn"
                      title="Ver detalle"
                    >
                      <Eye size={16} />
                    </a>
                    {#if comprobantes > 0}
                      <a
                        href="/comprobantes?q=emisor:{emitter.cuit}"
                        class="toolbar-btn comprobantes-btn"
                        title="Ver {comprobantes} comprobante(s)"
                      >
                        <FileText size={14} />
                        {comprobantes}
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
</div>

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

  /* Formulario de creación */
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
  }

  @media (max-width: 768px) {
    .emisores-page {
      flex-direction: column;
    }
  }
</style>
