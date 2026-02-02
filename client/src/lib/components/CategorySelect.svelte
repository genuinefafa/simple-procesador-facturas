<script lang="ts">
  /**
   * CategorySelect - Selector de categoría compacto usando Melt UI Select
   *
   * Basado en InvoiceTypeSelect que funciona correctamente.
   *
   * @example
   * ```svelte
   * <CategorySelect
   *   {categories}
   *   bind:value={categoryId}
   *   onchange={(id) => saveCategory(id)}
   * />
   * ```
   */

  import { Select as SelectBuilder } from 'melt/builders';

  type Category = {
    id: number;
    description: string;
    color?: string;
  };

  interface Props {
    categories: Category[];
    value: number | null;
    onchange?: (value: number | null) => void;
    disabled?: boolean;
  }

  let { categories = [], value = $bindable(null), onchange, disabled = false }: Props = $props();

  // Flag para evitar llamar onchange durante sincronización programática
  let isSyncing = false;

  const select = new SelectBuilder<number | null>({
    sameWidth: false,
    onValueChange: (newValue) => {
      // Solo notificar si NO estamos sincronizando (es decir, fue acción del usuario)
      if (!isSyncing) {
        value = newValue ?? null;
        onchange?.(value);
      }
    },
  });

  // Sincronizar valor externo con el select
  $effect(() => {
    if (value !== select.value) {
      isSyncing = true;
      select.value = value;
      isSyncing = false;
    }
  });

  const selectedCategory = $derived(categories.find((c) => c.id === value));

  function handleClear(event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    if (disabled) return;
    value = null;
    onchange?.(null);
  }
</script>

<div class="category-select" class:disabled>
  {#if disabled}
    <span class="disabled-display">
      {#if selectedCategory?.color}
        <span class="color-dot" style:background-color={selectedCategory.color}></span>
      {/if}
      {selectedCategory?.description ?? '--'}
    </span>
  {:else}
    <button {...select.trigger} class="trigger" class:has-category={value !== null}>
      <span class="trigger-left">
        {#if selectedCategory?.color}
          <span class="color-dot" style:background-color={selectedCategory.color}></span>
        {/if}
        <span class="trigger-text">
          {selectedCategory?.description ?? '--'}
        </span>
      </span>
      {#if value !== null}
        <span
          role="button"
          class="clear-btn"
          onclick={handleClear}
          onkeydown={(e) => e.key === 'Enter' && handleClear(e as unknown as MouseEvent)}
          aria-label="Quitar categoría"
          tabindex={-1}
        >
          ✕
        </span>
      {:else}
        <span class="chevron">▾</span>
      {/if}
    </button>

    <div {...select.content} class="select-content">
      {#each categories as cat (cat.id)}
        <div
          {...select.getOption(cat.id, cat.description)}
          class="select-option"
          class:selected={select.isSelected(cat.id)}
        >
          {#if cat.color}
            <span class="color-dot" style:background-color={cat.color}></span>
          {/if}
          <span class="option-text">{cat.description}</span>
          {#if select.isSelected(cat.id)}
            <span class="selected-indicator">✓</span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .category-select {
    position: relative;
    display: block;
    width: 100%;
  }

  .category-select.disabled {
    opacity: 0.6;
  }

  .disabled-display {
    display: flex;
    align-items: center;
    gap: var(--spacing-1);
    padding: var(--spacing-1) var(--spacing-2);
    color: var(--color-text-tertiary);
    font-size: var(--font-size-sm);
  }

  .trigger {
    display: flex;
    align-items: center;
    gap: var(--spacing-1);
    padding: var(--spacing-1) var(--spacing-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text-tertiary);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--transition-base);
    white-space: nowrap;
    width: 100%;
    justify-content: space-between;
  }

  .trigger:hover {
    border-color: var(--color-primary-400);
    background: var(--color-surface-alt);
  }

  .trigger:focus-visible {
    outline: 2px solid var(--color-primary-500);
    outline-offset: 2px;
  }

  .trigger.has-category {
    color: var(--color-text-primary);
    border-color: var(--color-primary-200);
    background: var(--color-primary-50);
  }

  .trigger-left {
    display: flex;
    align-items: center;
    gap: var(--spacing-1);
    overflow: hidden;
  }

  .color-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .trigger-text {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chevron {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    flex-shrink: 0;
  }

  .clear-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    border-radius: var(--radius-full);
    background: var(--color-primary-200);
    color: var(--color-primary-700);
    font-size: 10px;
    cursor: pointer;
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .clear-btn:hover {
    background: var(--color-primary-300);
    color: var(--color-primary-900);
  }

  /* Posicionamiento igual que InvoiceTypeSelect */
  .select-content {
    position: absolute;
    margin-left: 0;
    z-index: var(--z-dropdown);
    min-width: var(--melt-invoker-width);
    width: fit-content;
    max-width: max(var(--melt-invoker-width), 250px);
    margin-top: var(--spacing-1);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    max-height: 250px;
    overflow-y: auto;
    padding: var(--spacing-1);
  }

  .select-option {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    padding: var(--spacing-2) var(--spacing-3);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background-color var(--transition-base);
  }

  .select-option:hover {
    background: var(--color-surface-alt);
  }

  .select-option[data-highlighted] {
    background: var(--color-primary-50);
  }

  .select-option.selected {
    background: var(--color-primary-100);
    font-weight: 500;
  }

  .option-text {
    flex: 1;
  }

  .selected-indicator {
    color: var(--color-primary-600);
    font-weight: var(--font-weight-bold);
  }
</style>
