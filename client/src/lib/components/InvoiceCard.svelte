<script lang="ts">
  /**
   * Tarjeta de factura con inline edit estilo Trello.
   *
   * Click en cualquier campo activa modo edición global.
   * Muestra botones Guardar/Cancelar cuando está en edición.
   */

  import Button from './ui/Button.svelte';
  import CategoryPills from './CategoryPills.svelte';
  import EmitterCombobox from './EmitterCombobox.svelte';
  import InvoiceTypeSelect from './InvoiceTypeSelect.svelte';
  import { getFriendlyType, formatCurrency, formatDateShort } from '$lib/formatters';

  type Emitter = {
    id?: number;
    name: string;
    displayName: string;
    cuit: string;
    cuitNumeric?: string;
    legalName?: string;
    aliases?: string[];
  };

  type Category = {
    id: number;
    key: string;
    description: string;
  };

  type InvoiceData = {
    id: number;
    cuit: string;
    emitterName?: string | null;
    issueDate: string | null;
    invoiceType: number | null;
    pointOfSale: number | null;
    invoiceNumber: number | null;
    total?: number | null;
    categoryId?: number | null;
  };

  type Props = {
    /** Datos de la factura */
    invoice: InvoiceData;
    /** Categorías disponibles */
    categories?: Category[];
    /** Callback para guardar cambios */
    onsave?: (data: {
      cuit: string;
      invoiceType: number | null;
      pointOfSale: number | null;
      invoiceNumber: number | null;
      issueDate: string;
      total: number | null;
      categoryId: number | null;
      emitterId?: number;
    }) => void;
    /** Callback para eliminar */
    ondelete?: () => void;
    /** Si está guardando */
    saving?: boolean;
  };

  let { invoice, categories = [], onsave, ondelete, saving = false }: Props = $props();

  // Estado de edición
  let editMode = $state(false);
  let selectedEmitter = $state<Emitter | null>(null);
  let selectedCategoryId = $state<number | null>(null);

  // Form data
  let formData = $state({
    cuit: '',
    invoiceType: null as number | null,
    pointOfSale: null as number | null,
    invoiceNumber: null as number | null,
    issueDate: '',
    total: null as number | null,
  });

  // Sincronizar con props cuando cambia la factura o sale de edición
  $effect(() => {
    if (!editMode) {
      formData.cuit = invoice.cuit || '';
      formData.invoiceType = invoice.invoiceType;
      formData.pointOfSale = invoice.pointOfSale;
      formData.invoiceNumber = invoice.invoiceNumber;
      formData.issueDate = invoice.issueDate || '';
      formData.total = invoice.total ?? null;
      selectedCategoryId = invoice.categoryId ?? null;
    }
  });

  function enterEditMode() {
    if (!editMode) {
      editMode = true;
    }
  }

  function cancelEdit() {
    editMode = false;
    // Los valores se resetean automáticamente por el $effect
  }

  function save() {
    if (!onsave) return;
    onsave({
      cuit: formData.cuit,
      invoiceType: formData.invoiceType,
      pointOfSale: formData.pointOfSale,
      invoiceNumber: formData.invoiceNumber,
      issueDate: formData.issueDate,
      total: formData.total,
      categoryId: selectedCategoryId,
      emitterId: selectedEmitter?.id,
    });
    editMode = false;
  }

  // Formatters
  const formatInvoiceNumber = (pv: number | null, num: number | null) => {
    const pvStr = pv != null ? String(pv).padStart(4, '0') : '----';
    const numStr = num != null ? String(num).padStart(8, '0') : '--------';
    return `${pvStr}-${numStr}`;
  };

  const formatDate = (date: string | null) => {
    if (!date) return '—';
    return formatDateShort(date);
  };

  // Detectar si hay cambios
  const hasChanges = $derived(
    formData.cuit !== invoice.cuit ||
      formData.invoiceType !== invoice.invoiceType ||
      formData.pointOfSale !== invoice.pointOfSale ||
      formData.invoiceNumber !== invoice.invoiceNumber ||
      formData.issueDate !== (invoice.issueDate || '') ||
      formData.total !== (invoice.total ?? null) ||
      selectedCategoryId !== (invoice.categoryId ?? null)
  );
</script>

<div class="invoice-card" class:editing={editMode}>
  {#if editMode}
    <div class="edit-header">
      <span class="edit-indicator">Editando factura</span>
      <div class="edit-actions">
        <Button variant="ghost" size="sm" onclick={cancelEdit} disabled={saving}>Cancelar</Button>
        <Button variant="primary" size="sm" onclick={save} disabled={saving || !hasChanges}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </div>
    </div>
  {/if}

  <div class="card-content">
    <!-- Emisor -->
    <div class="field-row">
      <span class="field-label">Emisor</span>
      {#if editMode}
        <div class="field-input emitter-field">
          <EmitterCombobox
            value={selectedEmitter}
            onselect={(emitter) => (selectedEmitter = emitter)}
          />
        </div>
      {:else}
        <button type="button" class="field-value clickable" onclick={enterEditMode}>
          {invoice.emitterName || invoice.cuit || '—'}
        </button>
      {/if}
    </div>

    <!-- CUIT -->
    <div class="field-row">
      <span class="field-label">CUIT</span>
      {#if editMode}
        <input
          type="text"
          class="field-input"
          bind:value={formData.cuit}
          placeholder="XX-XXXXXXXX-X"
        />
      {:else}
        <button type="button" class="field-value clickable mono" onclick={enterEditMode}>
          {invoice.cuit || '—'}
        </button>
      {/if}
    </div>

    <!-- Tipo + Número (inline) -->
    <div class="field-row inline">
      <div class="field-group">
        <span class="field-label">Tipo</span>
        {#if editMode}
          <InvoiceTypeSelect bind:value={formData.invoiceType} />
        {:else}
          <button type="button" class="field-value clickable" onclick={enterEditMode}>
            {getFriendlyType(invoice.invoiceType)}
          </button>
        {/if}
      </div>

      <div class="field-group">
        <span class="field-label">Número</span>
        {#if editMode}
          <div class="number-inputs">
            <input
              type="number"
              class="field-input small"
              bind:value={formData.pointOfSale}
              placeholder="PV"
              min="1"
              max="9999"
            />
            <span class="separator">-</span>
            <input
              type="number"
              class="field-input"
              bind:value={formData.invoiceNumber}
              placeholder="Número"
              min="1"
            />
          </div>
        {:else}
          <button type="button" class="field-value clickable mono" onclick={enterEditMode}>
            {formatInvoiceNumber(invoice.pointOfSale, invoice.invoiceNumber)}
          </button>
        {/if}
      </div>
    </div>

    <!-- Fecha + Total (inline) -->
    <div class="field-row inline">
      <div class="field-group">
        <span class="field-label">Fecha</span>
        {#if editMode}
          <input type="date" class="field-input" bind:value={formData.issueDate} />
        {:else}
          <button type="button" class="field-value clickable" onclick={enterEditMode}>
            {formatDate(invoice.issueDate)}
          </button>
        {/if}
      </div>

      <div class="field-group">
        <span class="field-label">Total</span>
        {#if editMode}
          <input
            type="number"
            class="field-input"
            bind:value={formData.total}
            placeholder="0.00"
            step="0.01"
          />
        {:else}
          <button type="button" class="field-value clickable mono" onclick={enterEditMode}>
            {formatCurrency(invoice.total)}
          </button>
        {/if}
      </div>
    </div>

    <!-- Categoría -->
    <div class="field-row">
      <span class="field-label">Categoría</span>
      <div class="field-input category-field">
        <CategoryPills
          {categories}
          selected={selectedCategoryId}
          onselect={(id) => {
            selectedCategoryId = id ?? null;
            if (!editMode) editMode = true;
          }}
          mode="single"
        />
      </div>
    </div>
  </div>

  <!-- Footer con acciones -->
  {#if !editMode && ondelete}
    <div class="card-footer">
      <Button variant="danger" size="sm" onclick={ondelete}>Eliminar</Button>
    </div>
  {/if}
</div>

<style>
  .invoice-card {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    overflow: hidden;
  }

  .invoice-card.editing {
    border-color: var(--color-primary-300);
    box-shadow: 0 0 0 3px var(--color-primary-100);
  }

  .edit-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-3);
    background: var(--color-primary-50);
    border-bottom: 1px solid var(--color-primary-200);
  }

  .edit-indicator {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-primary-700);
  }

  .edit-actions {
    display: flex;
    gap: var(--spacing-2);
  }

  .card-content {
    padding: var(--spacing-4);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
  }

  .field-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
  }

  .field-row.inline {
    gap: var(--spacing-4);
  }

  .field-group {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
  }

  .field-label {
    width: 80px;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    flex-shrink: 0;
  }

  .field-value {
    flex: 1;
    font-size: var(--font-size-base);
    background: none;
    border: none;
    padding: var(--spacing-2);
    border-radius: var(--radius-md);
    text-align: left;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .field-value.clickable:hover {
    background: var(--color-surface-alt);
  }

  .field-value.mono {
    font-family: 'Monaco', 'Menlo', monospace;
  }

  .field-input {
    flex: 1;
    font-size: var(--font-size-base);
    padding: var(--spacing-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  .field-input:focus {
    outline: none;
    border-color: var(--color-primary-300);
    box-shadow: 0 0 0 2px var(--color-primary-100);
  }

  .field-input.small {
    width: 80px;
    flex: 0 0 auto;
  }

  .number-inputs {
    display: flex;
    align-items: center;
    gap: var(--spacing-1);
    flex: 1;
  }

  .separator {
    color: var(--color-text-tertiary);
  }

  .category-field {
    flex: 1;
    border: none;
    padding: 0;
  }

  .card-footer {
    display: flex;
    justify-content: flex-end;
    padding: var(--spacing-3);
    border-top: 1px solid var(--color-border);
    background: var(--color-surface-alt);
  }
</style>
