<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import { formatCuit, formatCurrency, formatDateShort } from '$lib/formatters';
  import { Trash2 } from '$lib/components/icons';

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

  interface Props {
    emitter: Emitter;
    stats?: EmitterStats | null;
    loadingStats?: boolean;
    showDelete?: boolean;
    onsave?: (data: {
      name: string;
      legalName: string | null;
      aliases: string[];
      personType: 'FISICA' | 'JURIDICA';
    }) => Promise<void>;
    ondelete?: () => void;
  }

  let {
    emitter,
    stats = null,
    loadingStats = false,
    showDelete = false,
    onsave,
    ondelete,
  }: Props = $props();

  let editMode = $state(false);
  let saving = $state(false);

  let editForm = $state({
    name: '',
    legalName: '',
    aliases: '',
    personType: 'JURIDICA' as 'FISICA' | 'JURIDICA',
  });

  let canDelete = $derived(!loadingStats && (stats?.totalInvoices ?? 0) === 0);
  let deleteTooltip = $derived(
    (stats?.totalInvoices ?? 0) > 0
      ? `No se puede eliminar: tiene ${stats?.totalInvoices} comprobante(s)`
      : 'Eliminar emisor'
  );

  function startEdit() {
    editForm = {
      name: emitter.name,
      legalName: emitter.legalName || '',
      aliases: emitter.aliases?.join(', ') || '',
      personType: emitter.personType || 'JURIDICA',
    };
    editMode = true;
  }

  function cancelEdit() {
    editMode = false;
  }

  async function handleSave() {
    if (!onsave) return;
    saving = true;
    try {
      await onsave({
        name: editForm.name.trim(),
        legalName: editForm.legalName.trim() || null,
        aliases: editForm.aliases
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean),
        personType: editForm.personType,
      });
      editMode = false;
    } finally {
      saving = false;
    }
  }
</script>

<section class="emitter-header">
  <header class="header-top">
    <div class="title-section">
      <h1>{emitter.displayName || emitter.name}</h1>
      <p class="subtitle">{formatCuit(emitter.cuit)}</p>
    </div>
  </header>

  <div class="header-body">
    {#if editMode}
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
      <div class="view-content">
        <section class="detail-section">
          <h3>Información</h3>
          <dl class="detail-list">
            <dt>Nombre</dt>
            <dd>{emitter.name}</dd>

            {#if emitter.legalName && emitter.legalName !== emitter.name}
              <dt>Razón Social</dt>
              <dd>{emitter.legalName}</dd>
            {/if}

            {#if emitter.aliases && emitter.aliases.length > 0}
              <dt>Aliases</dt>
              <dd>{emitter.aliases.join(', ')}</dd>
            {/if}

            <dt>Tipo</dt>
            <dd>
              {emitter.personType === 'FISICA' ? 'Persona Física' : 'Persona Jurídica'}
            </dd>
          </dl>
        </section>

        <section class="detail-section">
          <h3>Estadísticas</h3>
          {#if loadingStats}
            <p class="loading">Cargando...</p>
          {:else if stats}
            <dl class="detail-list">
              <dt>Comprobantes</dt>
              <dd>
                {#if stats.totalInvoices > 0}
                  <a href="/comprobantes?q=emisor:{emitter.cuit}" class="link">
                    {stats.totalInvoices} comprobante{stats.totalInvoices !== 1 ? 's' : ''}
                  </a>
                  {#if stats.totalFacturas !== undefined}
                    <span class="stats-breakdown">
                      ({stats.totalFacturas} factura{stats.totalFacturas !== 1 ? 's' : ''},
                      {stats.totalExpected ?? 0} expected,
                      {stats.totalFiles ?? 0} archivo{(stats.totalFiles ?? 0) !== 1 ? 's' : ''})
                    </span>
                  {/if}
                {:else}
                  <span class="muted">0</span>
                {/if}
              </dd>

              <dt>Total facturado</dt>
              <dd>{formatCurrency(stats.totalAmount)}</dd>

              {#if stats.firstInvoiceDate}
                <dt>Primera factura</dt>
                <dd>{formatDateShort(stats.firstInvoiceDate)}</dd>
              {/if}

              {#if stats.lastInvoiceDate}
                <dt>Última factura</dt>
                <dd>{formatDateShort(stats.lastInvoiceDate)}</dd>
              {/if}
            </dl>
          {:else}
            <p class="muted">Sin estadísticas</p>
          {/if}
        </section>
      </div>
    {/if}
  </div>

  <footer class="header-actions">
    {#if editMode}
      <Button variant="secondary" onclick={cancelEdit} disabled={saving}>Cancelar</Button>
      <Button onclick={handleSave} disabled={saving}>
        {saving ? 'Guardando...' : 'Guardar'}
      </Button>
    {:else}
      {#if showDelete}
        <button
          class="action-btn delete-btn"
          onclick={ondelete}
          disabled={!canDelete}
          title={deleteTooltip}
        >
          <Trash2 size={16} /> Eliminar
        </button>
      {/if}
      <Button onclick={startEdit}>Editar</Button>
    {/if}
  </footer>
</section>

<style>
  .emitter-header {
    display: flex;
    flex-direction: column;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  .header-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: var(--spacing-4) var(--spacing-5);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface-alt);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }

  .title-section {
    flex: 1;
    min-width: 0;
  }

  .title-section h1 {
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .subtitle {
    margin: var(--spacing-1) 0 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    font-family: monospace;
  }

  .header-body {
    padding: var(--spacing-5);
  }

  .header-actions {
    padding: var(--spacing-4) var(--spacing-5);
    border-top: 1px solid var(--color-border);
    background: var(--color-surface-alt);
    display: flex;
    gap: var(--spacing-3);
    justify-content: flex-end;
    border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  }

  .view-content {
    display: flex;
    gap: var(--spacing-6);
    flex-wrap: wrap;
  }

  .detail-section {
    flex: 1;
    min-width: 200px;
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

  .edit-form {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
    max-width: 480px;
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
    font-size: var(--font-size-sm);
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

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .delete-btn:hover:not(:disabled) {
    background: var(--color-danger-50);
    border-color: var(--color-danger-200);
    color: var(--color-danger-700);
  }
</style>
