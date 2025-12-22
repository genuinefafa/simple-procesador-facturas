<script lang="ts">
  import { Select as SelectBuilder } from 'melt/builders';
  import { getInvoiceTypeFromARCA } from '$lib/formatters';
  import { ARCA_INVOICE_TYPES } from '$lib/constants/arca-codes';

  interface Props {
    value: number | null;
    onchange?: (value: number | null) => void;
    readonly?: boolean;
  }

  let { value = $bindable(null), onchange, readonly = false }: Props = $props();

  // Select builder
  const select = new SelectBuilder<number | null>({
    sameWidth: false,
    onValueChange: (newValue) => {
      value = newValue ?? null;
      onchange?.(value);
    },
  });

  // Sincronizar valor con el select
  $effect(() => {
    if (value !== select.value) {
      select.value = value;
    }
  });
</script>

<div class="invoice-type-select">
  <label for={select.ids.trigger}>Tipo *</label>
  {#if readonly}
    <input
      type="text"
      value={value ? `${getInvoiceTypeFromARCA(value).description} (${value})` : ''}
      readonly
      class="readonly-input"
    />
  {:else}
    <button {...select.trigger} class="select-trigger">
      <span class="truncate">
        {#if value !== null}
          {@const typeInfo = getInvoiceTypeFromARCA(value)}
          {typeInfo.icon}
          {typeInfo.description} ({value})
        {:else}
          Seleccionar tipo...
        {/if}
      </span>
      <span class="arrow">▾</span>
    </button>

    <div {...select.content} class="select-content">
      {#each ARCA_INVOICE_TYPES as type}
        <div {...select.getOption(type.code, type.description)} class="select-option">
          <span>{type.icon} {type.description} ({type.code})</span>
          {#if select.isSelected(type.code)}
            <span class="selected-indicator">✓</span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .invoice-type-select {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
    position: relative;
  }

  label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
  }

  .readonly-input {
    padding: var(--spacing-2) var(--spacing-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-neutral-50);
    color: var(--color-text-secondary);
    font-size: var(--font-size-base);
  }

  .select-trigger {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-2) var(--spacing-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    cursor: pointer;
    font-size: var(--font-size-base);
    color: var(--color-text-primary);
    transition: all var(--transition-fast);
  }

  .select-trigger:hover {
    border-color: var(--color-primary-500);
  }

  .select-trigger:focus-visible {
    outline: 2px solid var(--color-primary-500);
    outline-offset: 2px;
  }

  .select-trigger .truncate {
    flex: 1;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .select-trigger .arrow {
    margin-left: var(--spacing-2);
    transition: transform var(--transition-fast);
  }

  .select-content {
    position: absolute;
    margin-left: 0;
    z-index: var(--z-dropdown);
    min-width: var(--melt-invoker-width);
    width: fit-content;
    max-width: max(var(--melt-invoker-width), 400px);
    margin-top: var(--spacing-1);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    max-height: 300px;
    overflow-y: auto;
  }

  .select-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-2) var(--spacing-3);
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .select-option:hover {
    background: var(--color-neutral-100);
  }

  .select-option[data-highlighted] {
    background: var(--color-primary-50);
  }

  .select-option .selected-indicator {
    color: var(--color-primary-500);
    font-weight: var(--font-weight-bold);
  }
</style>
