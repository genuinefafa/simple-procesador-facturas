<script lang="ts">
  import { debounce, parseSearchQuery, type FilterNode, type ParseResult } from '$lib/search';

  type Category = {
    id: number;
    key: string;
    description: string;
  };

  type Emitter = {
    name: string;
    cuit?: string;
  };

  type HintItem = {
    value: string;
    label: string;
    description?: string;
  };

  let {
    value = $bindable(''),
    onfilter,
    categories = [],
    emitters = [],
    placeholder = 'Buscar: emisor:, fecha:, estado:, categoria:...',
  }: {
    value: string;
    onfilter: (filters: FilterNode[]) => void;
    categories?: Category[];
    emitters?: Emitter[];
    placeholder?: string;
  } = $props();

  let parsedResult = $state<ParseResult>({ filters: [], errors: [] });
  let inputRef = $state<HTMLInputElement | null>(null);
  let isFocused = $state(false);
  let isInitialized = $state(false);

  // Detectar si estamos escribiendo un campo con hints
  let activeHintField = $derived(detectActiveHintField(value));
  let hints = $derived(generateHints(activeHintField, categories, emitters));
  let selectedHintIndex = $state(0);

  // Debounce de parsing para typing (150ms)
  const debouncedParse = debounce((query: string) => {
    parsedResult = parseSearchQuery(query);
    onfilter(parsedResult.filters);
  }, 150);

  // Parseo inicial SÍNCRONO (sin debounce) para evitar flicker al cargar con URL
  $effect.pre(() => {
    if (!isInitialized && value) {
      parsedResult = parseSearchQuery(value);
      onfilter(parsedResult.filters);
    }
  });

  // Efecto que dispara el parsing cuando cambia el valor (con debounce para typing)
  $effect(() => {
    if (isInitialized) {
      debouncedParse(value);
    } else {
      isInitialized = true;
    }
  });

  // Reset selected hint when hints change
  $effect(() => {
    if (hints.length > 0) {
      selectedHintIndex = 0;
    }
  });

  function clearSearch() {
    value = '';
    inputRef?.focus();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!hints.length) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectedHintIndex = (selectedHintIndex + 1) % hints.length;
        break;
      case 'ArrowUp':
        e.preventDefault();
        selectedHintIndex = (selectedHintIndex - 1 + hints.length) % hints.length;
        break;
      case 'Tab':
      case 'Enter':
        if (activeHintField && hints[selectedHintIndex]) {
          e.preventDefault();
          applyHint(hints[selectedHintIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        isFocused = false;
        inputRef?.blur();
        break;
    }
  }

  function applyHint(hint: HintItem) {
    if (!activeHintField) return;

    // Reemplazar el campo incompleto con el valor del hint
    const lastSpaceIndex = value.lastIndexOf(' ');
    const beforeLastToken = lastSpaceIndex >= 0 ? value.slice(0, lastSpaceIndex + 1) : '';

    value = `${beforeLastToken}${activeHintField.field}:${hint.value} `;
    selectedHintIndex = 0;
    inputRef?.focus();
  }

  /**
   * Detecta si el usuario está escribiendo un campo que tiene hints disponibles
   * Retorna el campo y el valor parcial, o null si no hay hint activo
   */
  function detectActiveHintField(query: string): { field: string; partial: string } | null {
    if (!query) return null;

    // Obtener el último token
    const tokens = query.split(/\s+/);
    const lastToken = tokens[tokens.length - 1];

    if (!lastToken) return null;

    // Verificar si es un campo con ":"
    const match = lastToken.match(/^(!?)(\w+):(.*)$/);
    if (!match) return null;

    const [, , field, partial] = match;
    const fieldLower = field.toLowerCase();

    // Campos que tienen hints
    const fieldsWithHints = ['estado', 'emisor', 'categoria', 'tipo'];
    if (!fieldsWithHints.includes(fieldLower)) return null;

    return { field: fieldLower, partial: partial.toLowerCase() };
  }

  /**
   * Genera las sugerencias basadas en el campo activo
   */
  function generateHints(
    activeField: { field: string; partial: string } | null,
    cats: Category[],
    emits: Emitter[]
  ): HintItem[] {
    if (!activeField) return [];

    const { field, partial } = activeField;

    switch (field) {
      case 'estado':
        return filterHints(
          [
            { value: 'pendientes', label: 'Pendientes', description: 'Archivos sin procesar' },
            { value: 'reconocidas', label: 'Reconocidas', description: 'Facturas confirmadas' },
            { value: 'esperadas', label: 'Esperadas', description: 'Facturas por recibir' },
          ],
          partial
        );

      case 'categoria':
        const catHints: HintItem[] = [
          { value: 'sin', label: 'Sin categoría', description: 'Facturas sin clasificar' },
          ...cats.map((c) => ({
            value: c.key || c.description.toLowerCase().replace(/\s+/g, '-'),
            label: c.description,
          })),
        ];
        return filterHints(catHints, partial);

      case 'emisor':
        const emitterHints: HintItem[] = emits.map((e) => ({
          value: e.name.toLowerCase(),
          label: e.name,
          description: e.cuit,
        }));
        return filterEmitterHints(emitterHints, partial);

      case 'tipo':
        return filterHints(
          [
            { value: 'faca', label: 'FACA', description: 'Factura A' },
            { value: 'facb', label: 'FACB', description: 'Factura B' },
            { value: 'facc', label: 'FACC', description: 'Factura C' },
            { value: 'nca', label: 'NCA', description: 'Nota de crédito A' },
            { value: 'ncb', label: 'NCB', description: 'Nota de crédito B' },
            { value: 'nda', label: 'NDA', description: 'Nota de débito A' },
            { value: 'ndb', label: 'NDB', description: 'Nota de débito B' },
          ],
          partial
        );

      default:
        return [];
    }
  }

  function filterHints(items: HintItem[], partial: string): HintItem[] {
    if (!partial) return items.slice(0, 6);

    return items
      .filter(
        (item) =>
          item.value.toLowerCase().includes(partial) || item.label.toLowerCase().includes(partial)
      )
      .slice(0, 6);
  }

  /**
   * Filtra emisores priorizando los que empiezan con el texto buscado
   */
  function filterEmitterHints(items: HintItem[], partial: string): HintItem[] {
    if (!partial) return items.slice(0, 6);

    const partialLower = partial.toLowerCase();

    // Filtrar los que contienen el texto
    const matches = items.filter(
      (item) =>
        item.label.toLowerCase().includes(partialLower) ||
        (item.description && item.description.includes(partial)) // CUIT
    );

    // Ordenar: primero los que empiezan con el texto, luego alfabéticamente
    matches.sort((a, b) => {
      const aStartsWith = a.label.toLowerCase().startsWith(partialLower);
      const bStartsWith = b.label.toLowerCase().startsWith(partialLower);

      if (aStartsWith && !bStartsWith) return -1;
      if (!aStartsWith && bStartsWith) return 1;
      return a.label.localeCompare(b.label);
    });

    return matches.slice(0, 6);
  }
</script>

<div class="unified-search-box">
  <div class="search-container" class:focused={isFocused}>
    <span class="search-icon">🔍</span>
    <input
      bind:this={inputRef}
      type="text"
      bind:value
      {placeholder}
      class="search-input"
      aria-label="Buscar comprobantes"
      onfocus={() => (isFocused = true)}
      onblur={() => setTimeout(() => (isFocused = false), 150)}
      onkeydown={handleKeydown}
    />

    {#if value}
      <button class="clear-btn" onclick={clearSearch} aria-label="Limpiar búsqueda" type="button">
        ✕
      </button>
    {/if}
  </div>

  <!-- Hints contextuales -->
  {#if isFocused && hints.length > 0}
    <div class="hints-panel" role="listbox">
      <div class="hints-header">
        Sugerencias para <code>{activeHintField?.field}:</code>
      </div>
      {#each hints as hint, i}
        <button
          type="button"
          class="hint-item"
          class:selected={i === selectedHintIndex}
          role="option"
          aria-selected={i === selectedHintIndex}
          onmousedown={() => applyHint(hint)}
          onmouseenter={() => (selectedHintIndex = i)}
        >
          <span class="hint-value">{hint.label}</span>
          {#if hint.description}
            <span class="hint-description">{hint.description}</span>
          {/if}
        </button>
      {/each}
      <div class="hints-footer">
        <kbd>↑↓</kbd> navegar <kbd>Tab</kbd> seleccionar <kbd>Esc</kbd> cerrar
      </div>
    </div>
  {/if}

  <!-- Errores de parsing -->
  {#if parsedResult.errors.length > 0}
    <div class="error-hints">
      {#each parsedResult.errors as error}
        <span class="error-hint">{error}</span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .unified-search-box {
    width: 100%;
    position: relative;
  }

  .search-container {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--spacing-2);
    padding: var(--spacing-2) var(--spacing-3);
    min-height: 48px;
    border: 2px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    transition: all var(--transition-fast);
  }

  .search-container.focused {
    border-color: var(--color-primary-500);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .search-icon {
    font-size: 1.1rem;
    color: var(--color-text-tertiary);
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    min-width: 150px;
    border: none;
    background: transparent;
    font-size: 16px;
    font-family: var(--font-sans);
    outline: none;
    padding: var(--spacing-1) 0;
  }

  .search-input::placeholder {
    color: var(--color-text-tertiary);
    font-size: var(--font-size-sm);
  }

  .clear-btn {
    background: transparent;
    border: none;
    color: var(--color-text-tertiary);
    cursor: pointer;
    font-size: 16px;
    padding: var(--spacing-1);
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .clear-btn:hover {
    color: var(--color-text-primary);
    background: var(--color-surface-alt);
  }

  /* Hints panel */
  .hints-panel {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: var(--spacing-2);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    z-index: 100;
    overflow: hidden;
  }

  .hints-header {
    padding: var(--spacing-2) var(--spacing-3);
    background: var(--color-surface-alt);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    border-bottom: 1px solid var(--color-border);
  }

  .hints-header code {
    background: var(--color-surface);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-family: monospace;
    color: var(--color-primary-700);
  }

  .hint-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: var(--spacing-2) var(--spacing-3);
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .hint-item:hover,
  .hint-item.selected {
    background: var(--color-primary-50);
  }

  .hint-value {
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
  }

  .hint-description {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .hints-footer {
    padding: var(--spacing-2) var(--spacing-3);
    background: var(--color-surface-alt);
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    border-top: 1px solid var(--color-border);
    display: flex;
    gap: var(--spacing-3);
  }

  .hints-footer kbd {
    display: inline-block;
    padding: 2px 5px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-family: monospace;
    font-size: var(--font-size-xs);
  }

  /* Error hints */
  .error-hints {
    margin-top: var(--spacing-2);
    padding: var(--spacing-2) var(--spacing-3);
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: var(--radius-md);
  }

  .error-hint {
    display: block;
    font-size: var(--font-size-sm);
    color: #dc2626;
  }
</style>
