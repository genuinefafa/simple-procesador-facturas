<script lang="ts">
  /**
   * Tarjeta de factura con inline edit estilo Trello.
   *
   * Soporta dos modos:
   * - 'view': Para facturas existentes. Click en campos activa edición.
   * - 'create': Para crear nueva factura. Empieza en modo edición.
   *
   * Types are segregated in InvoiceCard.types.ts following Interface Segregation Principle.
   */

  import Button from './ui/Button.svelte';
  import CategoryPills from './CategoryPills.svelte';
  import EmitterCombobox from './EmitterCombobox.svelte';
  import InvoiceTypeSelect from './InvoiceTypeSelect.svelte';
  import { getFriendlyType, formatCurrency, formatDateShort, formatCuit } from '$lib/formatters';
  import type { Emitter, Category, InvoiceData, InvoiceSaveData } from './InvoiceCard.types';

  // Re-export types for consumers
  export type { Emitter, Category, InvoiceData, InvoiceSaveData } from './InvoiceCard.types';

  type Props = {
    /** Datos de la factura (parciales en modo create) */
    invoice: InvoiceData;
    /** Categorías disponibles */
    categories?: Category[];
    /** Modo: 'view' para editar existente, 'create' para nueva */
    mode?: 'view' | 'create';
    /** Callback para guardar cambios */
    onsave?: (data: InvoiceSaveData) => void;
    /** Callback para cancelar (solo en modo create) */
    oncancel?: () => void;
    /** Callback para eliminar (solo en modo view) */
    ondelete?: () => void;
    /** Si está guardando */
    saving?: boolean;
  };

  let {
    invoice,
    categories = [],
    mode = 'view',
    onsave,
    oncancel,
    ondelete,
    saving = false,
  }: Props = $props();

  const isCreateMode = $derived(mode === 'create');

  // Estado de edición
  let editMode = $state(mode === 'create');
  let selectedEmitter = $state<Emitter | null>(null);
  let selectedCategoryId = $state<number | null>(null);

  // Form data - estado local del formulario
  let formData = $state({
    cuit: '',
    invoiceType: null as number | null,
    pointOfSale: null as number | null,
    invoiceNumber: null as number | null,
    issueDate: '',
    total: null as number | null,
  });

  // Convertir fecha ISO a formato input date (YYYY-MM-DD)
  function toInputDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
  }

  // Crear objeto Emitter desde los datos de la factura
  function emitterFromInvoice(): Emitter | null {
    if (!invoice.cuit) return null;
    return {
      name: invoice.emitterName || invoice.cuit,
      displayName: invoice.emitterName || invoice.cuit,
      cuit: invoice.cuit,
      cuitNumeric: invoice.cuit.replace(/\D/g, ''),
    };
  }

  // Resetear formulario a los datos de la factura
  function resetToInvoiceData() {
    formData.cuit = invoice.cuit || '';
    formData.invoiceType = invoice.invoiceType;
    formData.pointOfSale = invoice.pointOfSale;
    formData.invoiceNumber = invoice.invoiceNumber;
    formData.issueDate = toInputDate(invoice.issueDate);
    formData.total = invoice.total ?? null;
    selectedCategoryId = invoice.categoryId ?? null;
    selectedEmitter = emitterFromInvoice();
  }

  // Inicializar al montar y cuando cambian los props de invoice
  // Track si ya inicializamos en modo create (para no resetear al cambiar props)
  let initializedInCreateMode = false;

  $effect(() => {
    // Leer invoice para trackear cambios (después de invalidateAll)
    const _ = invoice.cuit;

    // En modo view: resetear cuando no estamos editando
    // En modo create: inicializar solo una vez al montar
    if (!editMode) {
      resetToInvoiceData();
    } else if (isCreateMode && !initializedInCreateMode) {
      resetToInvoiceData();
      initializedInCreateMode = true;
    }
  });

  function enterEditMode() {
    if (!editMode) {
      editMode = true;
    }
  }

  function cancelEdit() {
    if (isCreateMode && oncancel) {
      oncancel();
    } else {
      editMode = false;
      resetToInvoiceData(); // Restaurar datos originales
    }
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
    if (!isCreateMode) {
      editMode = false;
    }
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

  // Detectar si hay cambios (en modo create, siempre hay "cambios" si hay datos)
  const hasChanges = $derived(
    isCreateMode
      ? formData.cuit.trim() !== '' // En create, basta con que haya CUIT
      : formData.cuit !== invoice.cuit ||
          formData.invoiceType !== invoice.invoiceType ||
          formData.pointOfSale !== invoice.pointOfSale ||
          formData.invoiceNumber !== invoice.invoiceNumber ||
          formData.issueDate !== (invoice.issueDate || '') ||
          formData.total !== (invoice.total ?? null) ||
          selectedCategoryId !== (invoice.categoryId ?? null)
  );

  // Texto del header según modo
  const headerText = $derived(isCreateMode ? 'Crear factura' : 'Editando factura');
  const saveButtonText = $derived(
    saving ? 'Guardando...' : isCreateMode ? 'Crear factura' : 'Guardar cambios'
  );
</script>

<div class="invoice-card" class:editing={editMode} class:creating={isCreateMode}>
  {#if editMode}
    <div class="edit-header" class:create-header={isCreateMode}>
      <span class="edit-indicator">{headerText}</span>
      <div class="edit-actions">
        <Button variant="ghost" size="sm" onclick={cancelEdit} disabled={saving}>Cancelar</Button>
        <Button variant="primary" size="sm" onclick={save} disabled={saving || !hasChanges}>
          {saveButtonText}
        </Button>
      </div>
    </div>
  {/if}

  <div class="card-content">
    <!-- Emisor (nombre + CUIT combinados) -->
    <div class="field stacked">
      <span class="field-label">Emisor</span>
      {#if editMode}
        <div class="emitter-field">
          <EmitterCombobox
            value={selectedEmitter}
            onselect={(emitter) => {
              selectedEmitter = emitter;
              formData.cuit = emitter?.cuit || '';
            }}
          />
        </div>
      {:else}
        <button type="button" class="field-value clickable" onclick={enterEditMode}>
          <span class="emitter-name">{invoice.emitterName || '—'}</span>
          {#if invoice.cuit}
            <span class="emitter-cuit">{formatCuit(invoice.cuit)}</span>
          {/if}
        </button>
      {/if}
    </div>

    <!-- Tipo -->
    <div class="field stacked">
      <span class="field-label">Tipo</span>
      {#if editMode}
        <InvoiceTypeSelect bind:value={formData.invoiceType} />
      {:else}
        <button type="button" class="field-value clickable" onclick={enterEditMode}>
          {getFriendlyType(invoice.invoiceType)}
        </button>
      {/if}
    </div>

    <!-- Número -->
    <div class="field stacked">
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

    <!-- Fecha -->
    <div class="field stacked">
      <span class="field-label">Fecha</span>
      {#if editMode}
        <input type="date" class="field-input" bind:value={formData.issueDate} />
      {:else}
        <button type="button" class="field-value clickable" onclick={enterEditMode}>
          {formatDate(invoice.issueDate)}
        </button>
      {/if}
    </div>

    <!-- Total -->
    <div class="field stacked">
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

    <!-- Categoría (independiente, no activa edición) -->
    <div class="field stacked category-section">
      <span class="field-label">Categoría</span>
      <CategoryPills
        {categories}
        selected={selectedCategoryId}
        onselect={(id) => {
          selectedCategoryId = id ?? null;
          // Guardar categoría inmediatamente si no estamos en modo edición
          if (!editMode && onsave) {
            onsave({
              cuit: invoice.cuit,
              invoiceType: invoice.invoiceType,
              pointOfSale: invoice.pointOfSale,
              invoiceNumber: invoice.invoiceNumber,
              issueDate: invoice.issueDate || '',
              total: invoice.total ?? null,
              categoryId: id ?? null,
            });
          }
        }}
        mode="single"
      />
    </div>
  </div>

  <!-- Footer con acciones (solo en modo view, no en create) -->
  {#if !editMode && !isCreateMode && ondelete}
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

  .invoice-card.creating {
    border-color: var(--color-success-300);
    box-shadow: 0 0 0 3px var(--color-success-100);
  }

  .edit-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-3);
    background: var(--color-primary-50);
    border-bottom: 1px solid var(--color-primary-200);
  }

  .edit-header.create-header {
    background: var(--color-success-50);
    border-bottom-color: var(--color-success-200);
  }

  .edit-indicator {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-primary-700);
  }

  .create-header .edit-indicator {
    color: var(--color-success-700);
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

  /* Stacked field: label arriba, valor abajo */
  .field.stacked {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
  }

  .field-label {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .field-value {
    font-size: var(--font-size-base);
    background: none;
    border: none;
    padding: var(--spacing-2);
    border-radius: var(--radius-md);
    text-align: left;
    cursor: pointer;
    transition: background var(--transition-fast);
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .field-value.clickable:hover {
    background: var(--color-surface-alt);
  }

  .field-value.mono {
    font-family: var(--font-mono);
  }

  /* Emisor: nombre arriba, CUIT abajo */
  .emitter-name {
    font-size: var(--font-size-base);
    color: var(--color-text-primary);
  }

  .emitter-cuit {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    font-family: var(--font-mono);
  }

  .emitter-field {
    width: 100%;
  }

  .field-input {
    font-size: var(--font-size-base);
    padding: var(--spacing-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    width: 100%;
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
  }

  .separator {
    color: var(--color-text-tertiary);
  }

  /* Categoría como sección independiente */
  .category-section {
    padding-top: var(--spacing-2);
    border-top: 1px solid var(--color-border);
    margin-top: var(--spacing-1);
  }

  .card-footer {
    display: flex;
    justify-content: flex-end;
    padding: var(--spacing-3);
    border-top: 1px solid var(--color-border);
    background: var(--color-surface-alt);
  }
</style>
