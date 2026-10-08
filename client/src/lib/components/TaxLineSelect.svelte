<script lang="ts">
  /**
   * Compact Melt UI select used by InvoiceTaxBreakdown rows (concept / rate).
   * Values are strings so the same component serves both.
   */
  import { Select as SelectBuilder } from 'melt/builders';
  import { Check, ChevronDown } from '$lib/components/icons';
  import { SelectDropdown } from '$lib/components/ui';

  interface Props {
    value: string;
    options: ReadonlyArray<{ value: string; label: string }>;
    placeholder?: string;
    ariaLabel: string;
    onchange?: (value: string) => void;
  }

  let { value, options, placeholder = 'Seleccionar...', ariaLabel, onchange }: Props = $props();

  const select = new SelectBuilder<string>({
    sameWidth: false,
    onValueChange: (v) => {
      if (v !== undefined && v !== value) onchange?.(v);
    },
  });

  $effect(() => {
    if (select.value !== value) select.value = value;
  });

  const selectedLabel = $derived(options.find((o) => o.value === value)?.label);
</script>

<button type="button" {...select.trigger} class="trigger" aria-label={ariaLabel}>
  <span class="text" class:placeholder={!selectedLabel}>{selectedLabel ?? placeholder}</span>
  <ChevronDown size={14} />
</button>

<SelectDropdown contentAttrs={select.content} maxHeight="260px">
  {#each options as opt (opt.value)}
    <div {...select.getOption(opt.value, opt.label)} class="option">
      <span>{opt.label}</span>
      {#if select.isSelected(opt.value)}
        <Check size={14} />
      {/if}
    </div>
  {/each}
</SelectDropdown>

<style>
  .trigger {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-2);
    padding: var(--spacing-2) var(--spacing-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    cursor: pointer;
  }

  .trigger:hover {
    border-color: var(--color-primary-500);
  }

  .trigger:focus-visible {
    outline: 2px solid var(--color-primary-500);
    outline-offset: 2px;
  }

  .text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .placeholder {
    color: var(--color-text-tertiary);
  }

  .option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-2) var(--spacing-3);
    font-size: var(--font-size-sm);
    cursor: pointer;
  }

  .option:hover,
  .option[data-highlighted] {
    background: var(--color-primary-50);
  }
</style>
