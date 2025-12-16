<script lang="ts">
  /**
   * CategoryPills - Selector de categoría con pills clickeables
   *
   * Componente reutilizable para selección de categorías usando pills (badges)
   * en lugar de dropdowns tradicionales. Soporta dos modos de operación:
   *
   * Modos:
   * - 'single': Comportamiento radio button, una sola categoría seleccionada (edición)
   * - 'filter': Incluye opción "Todas" para mostrar sin filtro (búsqueda/filtros)
   *
   * @example Single mode (edición de factura)
   * ```svelte
   * <CategoryPills
   *   {categories}
   *   selected={categoryId}
   *   onselect={(id) => categoryId = id}
   *   mode="single"
   * />
   * ```
   *
   * @example Filter mode (filtros de búsqueda)
   * ```svelte
   * <CategoryPills
   *   {categories}
   *   selected={activeCategoryId}
   *   onselect={(id) => activeCategoryId = id}
   *   mode="filter"
   * />
   * ```
   */

  type Category = {
    id: number;
    name: string;
    description: string;
    color?: string;
    icon?: string;
  };

  let {
    categories = [],
    selected = $bindable<number | null | undefined>(),
    onselect,
    mode = 'single',
    disabled = false,
  }: {
    /** Lista de categorías disponibles */
    categories: Category[];
    /** ID de categoría seleccionada (null = sin categoría, undefined = todas en modo filter) */
    selected?: number | null | undefined;
    /** Callback cuando se selecciona una categoría */
    onselect: (id: number | null | undefined) => void;
    /** Modo de operación: 'single' para edición, 'filter' para búsqueda */
    mode?: 'single' | 'filter';
    /** Deshabilitar interacción */
    disabled?: boolean;
  } = $props();

  function handleSelect(id: number | null | undefined) {
    if (disabled) return;
    onselect(id);
  }
</script>

<div class="pills-container" class:disabled>
  {#if mode === 'filter'}
    <button
      type="button"
      class="pill"
      class:selected={selected === undefined}
      onclick={() => handleSelect(undefined)}
      {disabled}
      aria-label="Ver todas las categorías"
    >
      Todas
    </button>
  {/if}

  <button
    type="button"
    class="pill pill-none"
    class:selected={selected === null}
    onclick={() => handleSelect(null)}
    {disabled}
    aria-label="Sin categoría"
  >
    Sin categoría
  </button>

  {#each categories as cat}
    <button
      type="button"
      class="pill"
      class:selected={selected === cat.id}
      onclick={() => handleSelect(cat.id)}
      {disabled}
      style:--pill-color={cat.color || 'var(--color-primary-600)'}
      aria-label={`Categoría: ${cat.description}`}
    >
      {#if cat.icon}
        <span class="pill-icon">{cat.icon}</span>
      {/if}
      {cat.description}
    </button>
  {/each}
</div>

<style>
  .pills-container {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-2);
    align-items: center;
  }

  .pills-container.disabled {
    opacity: 0.6;
    pointer-events: none;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-1);
    padding: var(--spacing-1) var(--spacing-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: var(--color-surface);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-base);
    white-space: nowrap;
  }

  .pill:hover:not(:disabled) {
    border-color: var(--color-primary-500);
    background: var(--color-primary-50);
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .pill.selected {
    background: var(--pill-color, var(--color-primary-600));
    color: white;
    border-color: var(--pill-color, var(--color-primary-600));
    font-weight: 600;
  }

  .pill.pill-none {
    border-style: dashed;
  }

  .pill.pill-none.selected {
    background: var(--color-neutral-600);
    border-color: var(--color-neutral-600);
    border-style: solid;
  }

  .pill:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pill:focus-visible {
    outline: 2px solid var(--color-primary-500);
    outline-offset: 2px;
  }

  .pill-icon {
    font-size: var(--font-size-base);
    line-height: 1;
  }

  /* Responsive: en pantallas pequeñas, permitir scroll horizontal si es necesario */
  @media (max-width: 640px) {
    .pills-container {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: thin;
    }
  }
</style>
