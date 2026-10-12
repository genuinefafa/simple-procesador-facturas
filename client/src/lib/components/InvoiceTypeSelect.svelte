<script lang="ts">
  import { Combobox as ComboboxBuilder } from 'melt/builders';
  import { getInvoiceTypeFromARCA } from '$lib/formatters';
  import { AFIP_TYPES } from '@shared/arca';
  import { Check, ChevronDown } from '$lib/components/icons';
  import { SelectDropdown } from '$lib/components/ui';
  import InvoiceTypeLabel from './InvoiceTypeLabel.svelte';

  interface Props {
    value: number | null;
    onchange?: (value: number | null) => void;
    readonly?: boolean;
  }

  let { value = $bindable(null), onchange, readonly = false }: Props = $props();

  // Most common codes first, then the rest by code
  const COMMON_CODES = [1, 6, 11, 3, 8, 13, 2, 7, 12, 51, 19];
  const commonSet = new Set(COMMON_CODES);

  /** Lowercase and strip diacritics so "credito" matches "Crédito" */
  function normalize(text: string): string {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function labelFor(code: number): string {
    return `${getInvoiceTypeFromARCA(code).description} (${code})`;
  }

  const typeOptions = [
    ...COMMON_CODES.filter((c) => AFIP_TYPES[String(c)]),
    ...Object.values(AFIP_TYPES)
      .map((t) => t.code)
      .filter((c) => !commonSet.has(c))
      .sort((a, b) => a - b),
  ].map((code) => {
    const info = getInvoiceTypeFromARCA(code);
    return {
      code,
      label: labelFor(code),
      codeText: String(code),
      text: normalize(`${info.friendlyType} ${AFIP_TYPES[String(code)].description}`),
    };
  });

  // Combobox builder: the input text is only used as a filter once the user types
  const combobox = new ComboboxBuilder<number>({
    sameWidth: false,
    onValueChange: (newValue) => {
      // Clearing is not supported: ignore empty values
      if (newValue === undefined || newValue === null) return;
      value = newValue;
      onchange?.(value);
    },
  });

  // Query applies only after the user typed; otherwise show the full list
  const words = $derived(
    combobox.touched
      ? normalize(combobox.inputValue)
          .split(/\s+/)
          .filter((w) => w.length > 0)
      : []
  );

  // Every word must match: digits against the code prefix, text against type/description
  const filteredOptions = $derived(
    words.length === 0
      ? typeOptions
      : typeOptions.filter((o) =>
          words.every((w) => (/^\d+$/.test(w) ? o.codeText.startsWith(w) : o.text.includes(w)))
        )
  );

  // Keep the builder value in sync with the bound value
  $effect(() => {
    const next = value ?? undefined;
    if (combobox.value !== next) {
      combobox.value = next;
    }
  });

  // While closed, the input always shows the selected value (also after cancelling)
  $effect(() => {
    if (!combobox.open) {
      const text = value !== null ? labelFor(value) : '';
      if (combobox.inputValue !== text) combobox.inputValue = text;
    }
  });

  const inputAttrs = $derived(combobox.input);

  // Selected value decorations (icon + friendly type), hidden while the user types
  const selectedInfo = $derived(
    value !== null && !combobox.touched ? getInvoiceTypeFromARCA(value) : null
  );

  function handleFocus(event: FocusEvent) {
    inputAttrs.onfocus(event);
    (event.currentTarget as HTMLInputElement).select();
  }

  function handleKeydown(event: KeyboardEvent) {
    // Builder clears the value on Escape when closed; clearing is not supported here
    if (event.key === 'Escape' && !combobox.open) return;
    inputAttrs.onkeydown(event);
  }
</script>

<div class="invoice-type-select">
  <label for={combobox.ids.input}>Tipo *</label>
  {#if readonly}
    <input
      type="text"
      value={value ? `${getInvoiceTypeFromARCA(value).description} (${value})` : ''}
      readonly
      class="readonly-input"
    />
  {:else}
    <div class="input-wrapper" class:has-selection={selectedInfo !== null}>
      {#if selectedInfo}
        {@const SelectedIcon = selectedInfo.icon}
        <span class="selected-icon" aria-hidden="true"><SelectedIcon size={14} /></span>
      {/if}
      <input
        {...inputAttrs}
        onfocus={handleFocus}
        onkeydown={handleKeydown}
        type="text"
        class="combobox-input"
        placeholder="Buscar tipo de comprobante…"
        autocomplete="off"
      />
      {#if selectedInfo}
        <span class="selected-friendly" aria-hidden="true">{selectedInfo.friendlyType}</span>
      {/if}
      <button {...combobox.trigger} type="button" class="arrow" tabindex="-1" aria-label="Abrir">
        <ChevronDown size={16} />
      </button>
    </div>

    <SelectDropdown
      contentAttrs={combobox.content}
      maxWidth="max(var(--melt-invoker-width), 400px)"
      maxHeight="300px"
    >
      {#each filteredOptions as type (type.code)}
        <div {...combobox.getOption(type.code, type.label)} class="select-option">
          <InvoiceTypeLabel code={type.code} />
          {#if combobox.isSelected(type.code)}
            <span class="selected-indicator"><Check size={16} /></span>
          {/if}
        </div>
      {:else}
        <div class="no-results">Sin resultados</div>
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

  .input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .combobox-input {
    width: 100%;
    padding: var(--spacing-2) calc(var(--spacing-3) + 24px) var(--spacing-2) var(--spacing-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    font-size: var(--font-size-base);
    color: var(--color-text-primary);
    text-overflow: ellipsis;
    transition: all var(--transition-fast);
  }

  .combobox-input:hover {
    border-color: var(--color-primary-500);
  }

  .combobox-input:focus-visible {
    outline: 2px solid var(--color-primary-500);
    outline-offset: 2px;
  }

  /* Icon and friendly type of the selected value, drawn over the input padding */
  .has-selection .combobox-input {
    padding-left: calc(var(--spacing-3) + 14px + var(--spacing-2));
    padding-right: calc(var(--spacing-3) + 24px + 4.5ch);
  }

  .selected-icon {
    position: absolute;
    left: var(--spacing-3);
    display: flex;
    align-items: center;
    color: var(--color-text-secondary);
    pointer-events: none;
  }

  .selected-friendly {
    position: absolute;
    right: calc(var(--spacing-2) + 24px);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    pointer-events: none;
  }

  .input-wrapper .arrow {
    position: absolute;
    right: var(--spacing-2);
    display: flex;
    align-items: center;
    padding: 0;
    border: none;
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
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

  .no-results {
    padding: var(--spacing-2) var(--spacing-3);
    color: var(--color-text-secondary);
  }

  .select-option .selected-indicator {
    color: var(--color-primary-500);
    display: flex;
    align-items: center;
  }
</style>
