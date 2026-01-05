<script lang="ts">
  import { debounce, parseSearchQuery, type FilterNode, type ParseResult } from '$lib/search';

  type Category = {
    id: number;
    description: string;
  };

  let {
    value = $bindable(''),
    onfilter,
    categories = [],
    placeholder = 'Buscar: emisor:, fecha:, categoria:, numero:, total:...',
  }: {
    value: string;
    onfilter: (filters: FilterNode[]) => void;
    categories?: Category[];
    placeholder?: string;
  } = $props();

  let parsedResult = $state<ParseResult>({ filters: [], errors: [] });
  let showHelp = $state(false);

  // Debounce de parsing (300ms)
  const debouncedParse = debounce((query: string) => {
    parsedResult = parseSearchQuery(query);
    onfilter(parsedResult.filters);
  }, 300);

  // Efecto que dispara el parsing cuando cambia el valor
  $effect(() => {
    debouncedParse(value);
  });

  function clearSearch() {
    value = '';
  }

  function toggleHelp() {
    showHelp = !showHelp;
  }
</script>

<div class="search-box">
  <div class="search-input-wrapper">
    <span class="search-icon">🔍</span>
    <input
      type="search"
      bind:value
      {placeholder}
      class="search-input"
      aria-label="Buscar comprobantes"
    />

    {#if value}
      <button class="clear-btn" onclick={clearSearch} aria-label="Limpiar búsqueda" type="button">
        ✕
      </button>
    {/if}

    <button
      class="help-btn"
      onclick={toggleHelp}
      aria-label="Ayuda de sintaxis"
      class:active={showHelp}
      type="button"
    >
      ?
    </button>
  </div>

  {#if parsedResult.errors.length > 0}
    <div class="error-hints">
      {#each parsedResult.errors as error}
        <span class="error-hint">{error}</span>
      {/each}
    </div>
  {/if}

  {#if showHelp}
    <div class="search-help">
      <h4>Sintaxis de búsqueda</h4>
      <div class="help-examples">
        <div class="help-section">
          <strong>Emisor:</strong>
          <code>emisor:acme</code> o <code>emisor:20-12345678-9</code>
        </div>
        <div class="help-section">
          <strong>Fecha:</strong>
          <code>fecha:2024-01</code>, <code>fecha:>2024-01-01</code>,
          <code>fecha:2024-01..2024-03</code>
        </div>
        <div class="help-section">
          <strong>Categoría:</strong>
          <code>categoria:servicios</code>, <code>categoria:sin</code>
        </div>
        <div class="help-section">
          <strong>Importe:</strong>
          <code>total:>1000</code>, <code>total:&lt;500</code>
        </div>
        <div class="help-section">
          <strong>Negación (NOT):</strong>
          <code>!emisor:acme</code>, <code>!categoria:servicios</code>
        </div>
        <div class="help-section">
          <strong>Combinar:</strong>
          <code>emisor:acme fecha:>2024-01 total:>1000</code>
        </div>
      </div>
      <p class="help-note">
        Tip: Podés escribir texto libre sin prefijo para buscar en todos los campos.
      </p>
    </div>
  {/if}
</div>

<style>
  .search-box {
    width: 100%;
  }

  .search-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: 14px;
    font-size: 1.1rem;
    pointer-events: none;
    color: var(--color-text-tertiary);
  }

  .search-input {
    width: 100%;
    padding: var(--spacing-3) var(--spacing-4);
    padding-left: calc(var(--spacing-4) + 1.6rem); /* Espacio para ícono */
    padding-right: calc(var(--spacing-4) + 4rem); /* Espacio para botones */
    font-size: 16px; /* Previene zoom en iOS */
    border: 2px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    font-family: var(--font-sans);
    transition: all var(--transition-fast);
    height: 48px;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--color-primary-500);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .search-input::placeholder {
    color: var(--color-text-tertiary);
    font-size: var(--font-size-sm);
  }

  /* Ocultar botón de clear nativo del navegador */
  .search-input::-webkit-search-cancel-button {
    display: none;
  }

  .search-input::-webkit-search-decoration {
    display: none;
  }

  .clear-btn,
  .help-btn {
    position: absolute;
    background: transparent;
    border: none;
    color: var(--color-text-tertiary);
    cursor: pointer;
    font-size: 18px;
    padding: var(--spacing-1);
    transition: color var(--transition-fast);
    height: 32px;
    width: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
  }

  .clear-btn {
    right: 48px;
  }

  .help-btn {
    right: 12px;
    font-weight: var(--font-weight-bold);
    border: 1px solid var(--color-border);
  }

  .clear-btn:hover,
  .help-btn:hover {
    color: var(--color-text-primary);
    background: var(--color-surface-alt);
  }

  .help-btn.active {
    background: var(--color-primary-600);
    color: white;
    border-color: var(--color-primary-600);
  }

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

  .search-help {
    margin-top: var(--spacing-3);
    padding: var(--spacing-4);
    background: var(--color-surface-alt);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  }

  .search-help h4 {
    margin: 0 0 var(--spacing-3) 0;
    font-size: var(--font-size-lg);
    color: var(--color-text-primary);
  }

  .help-examples {
    display: grid;
    gap: var(--spacing-2);
  }

  .help-section {
    font-size: var(--font-size-sm);
    line-height: 1.6;
  }

  .help-section strong {
    color: var(--color-text-primary);
    margin-right: var(--spacing-1);
  }

  .help-section code {
    background: var(--color-surface);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-family: monospace;
    font-size: 0.9em;
    color: var(--color-primary-700);
    border: 1px solid var(--color-border);
    margin: 0 2px;
  }

  .help-note {
    margin-top: var(--spacing-3);
    margin-bottom: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    font-style: italic;
  }
</style>
