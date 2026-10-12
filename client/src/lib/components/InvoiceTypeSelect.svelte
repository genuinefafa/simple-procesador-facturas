<script lang="ts">
  import { Select as SelectBuilder } from 'melt/builders';
  import { getInvoiceTypeFromARCA } from '$lib/formatters';
  import { AFIP_TYPES } from '@shared/arca';
  import { Check, ChevronDown } from '$lib/components/icons';
  import { SelectDropdown } from '$lib/components/ui';

  interface Props {
    value: number | null;
    onchange?: (value: number | null) => void;
    readonly?: boolean;
  }

  let { value = $bindable(null), onchange, readonly = false }: Props = $props();

  // Most common codes first, then the rest by code
  const COMMON_CODES = [1, 6, 11, 3, 8, 13, 2, 7, 12, 51, 19];
  const commonSet = new Set(COMMON_CODES);
  const typeOptions = [
    ...COMMON_CODES.filter((c) => AFIP_TYPES[String(c)]),
    ...Object.values(AFIP_TYPES)
      .map((t) => t.code)
      .filter((c) => !commonSet.has(c))
      .sort((a, b) => a - b),
  ].map((code) => ({ code, description: AFIP_TYPES[String(code)].description }));

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
          <typeInfo.icon size={14} />
          {typeInfo.description} ({value})
        {:else}
          Seleccionar tipo...
        {/if}
      </span>
      <span class="arrow"><ChevronDown size={16} /></span>
    </button>

    <SelectDropdown
      contentAttrs={select.content}
      maxWidth="max(var(--melt-invoker-width), 400px)"
      maxHeight="300px"
    >
      {#each typeOptions as type (type.code)}
        {@const TypeIcon = getInvoiceTypeFromARCA(type.code).icon}
        <div {...select.getOption(type.code, type.description)} class="select-option">
          <span class="option-label"><TypeIcon size={14} /> {type.description} ({type.code})</span>
          {#if select.isSelected(type.code)}
            <span class="selected-indicator"><Check size={16} /></span>
          {/if}
        </div>
      {/each}
    </SelectDropdown>
  {/if}
</div>

<style>
  .invoice-type-select {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
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
    display: flex;
    align-items: center;
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

  .option-label {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-2);
  }

  /* Keep the trigger as a block so text-overflow: ellipsis still applies */
  .select-trigger .truncate :global(svg) {
    vertical-align: text-bottom;
    margin-right: var(--spacing-1);
  }

  .select-option .selected-indicator {
    color: var(--color-primary-500);
    display: flex;
    align-items: center;
  }
</style>
