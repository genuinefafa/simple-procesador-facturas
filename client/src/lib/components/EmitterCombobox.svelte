<script lang="ts">
  import { Combobox as ComboboxBuilder } from 'melt/builders';

  type Emitter = {
    id?: number;
    name: string;
    cuit: string;
    cuitNumeric?: string;
  };

  type Props = {
    value?: Emitter | null;
    onselect?: (emitter: Emitter | null) => void;
  };

  let { value = null, onselect }: Props = $props();

  let items = $state<Emitter[]>([]);
  let loading = $state(false);
  let selectedEmitter = $state<Emitter | null>(value);

  const combobox = new ComboboxBuilder<Emitter>();

  // Buscar emisores cuando cambia el input
  $effect(() => {
    const q = combobox.inputValue.trim();

    if (q.length < 3) {
      items = [];
      return;
    }

    loading = true;

    fetch(`/api/emisores?q=${encodeURIComponent(q)}`)
      .then((res) => res.json())
      .then((json) => {
        items = json.emitters || [];
      })
      .catch((e) => console.error('Error buscando emisores:', e))
      .finally(() => (loading = false));
  });

  function selectItem(emitter: Emitter) {
    selectedEmitter = emitter;
    onselect?.(emitter);
    // Clear search results and close dropdown
    items = [];
  }

  function clearSelection() {
    selectedEmitter = null;
    combobox.inputValue = '';
    items = [];
    onselect?.(null);
  }

  function formatCuitPlain(cuit: string): string {
    return cuit.replace(/-/g, '');
  }
</script>

<div class="emitter-combobox">
  <label for={combobox.ids.input} class="label">Emisor</label>

  {#if selectedEmitter}
    <!-- Mostrado seleccionado -->
    <div class="selected-chip">
      <div class="chip-content">
        <strong>{selectedEmitter.name}</strong>
        <span class="cuit-hint">{formatCuitPlain(selectedEmitter.cuit)}</span>
      </div>
      <button
        type="button"
        class="chip-remove"
        onclick={clearSelection}
        aria-label="Limpiar selección"
      >
        ✕
      </button>
    </div>
  {:else}
    <!-- Modo búsqueda -->
    <div class="combobox-wrapper">
      <input
        {...combobox.input}
        id={combobox.ids.input}
        type="text"
        placeholder="Buscar por nombre o CUIT..."
        class="combobox-input"
        aria-label="Buscar emisores"
        aria-autocomplete="list"
        aria-controls={combobox.ids.content}
      />

      {#if loading}
        <span class="loading-indicator">Buscando...</span>
      {/if}

      {#if combobox.open && items.length > 0}
        <div
          {...combobox.content}
          id={combobox.ids.content}
          class="combobox-listbox"
          role="listbox"
        >
          {#each items as emitter (emitter.cuitNumeric)}
            <button
              type="button"
              {...combobox.getOption(emitter)}
              onclick={() => selectItem(emitter)}
              class="combobox-item"
              role="option"
              aria-selected={combobox.isSelected(emitter)}
            >
              <div class="item-content">
                <strong>{emitter.name}</strong>
                <span class="cuit-hint">{formatCuitPlain(emitter.cuit)}</span>
              </div>
            </button>
          {/each}
        </div>
      {/if}

      {#if combobox.open && items.length === 0 && combobox.inputValue.length >= 3}
        <div class="combobox-listbox">
          <span class="no-results">No se encontraron emisores</span>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .emitter-combobox {
    margin-bottom: var(--spacing-2);
  }

  .label {
    display: block;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin-bottom: 0.25rem;
  }

  .combobox-wrapper {
    position: relative;
  }

  .selected-chip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-2);
    padding: var(--spacing-2) var(--spacing-3);
    background: var(--color-primary-50);
    border: 2px solid var(--color-primary-200);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
  }

  .chip-content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .chip-content strong {
    color: var(--color-primary-900);
  }

  .chip-remove {
    background: transparent;
    border: none;
    color: var(--color-primary-600);
    cursor: pointer;
    font-size: 1.2rem;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 0.15s;
    flex-shrink: 0;
  }

  .chip-remove:hover {
    opacity: 0.7;
  }

  .combobox-input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
  }

  .combobox-input:focus {
    outline: none;
    border-color: var(--color-primary-500);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .combobox-input:read-only {
    background-color: var(--color-surface-alt);
    cursor: default;
  }

  .combobox-listbox {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    margin-top: 0.25rem;
    max-height: 250px;
    overflow-y: auto;
    z-index: 20;
    list-style: none;
    padding: 0;
    box-shadow: var(--shadow-md);
  }

  .combobox-item {
    width: 100%;
    padding: 0.75rem;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--spacing-2);
    transition: background-color 0.15s;
  }

  .combobox-item:hover,
  .combobox-item[data-highlighted] {
    background: var(--color-surface-alt);
  }

  .item-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--spacing-2);
    flex: 1;
  }

  .cuit-hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    font-family: monospace;
  }

  .checkmark {
    color: var(--color-success);
    font-weight: bold;
  }

  .no-results {
    display: block;
    padding: 1rem;
    text-align: center;
    color: var(--color-text-tertiary);
    font-size: var(--font-size-sm);
  }

  .loading-indicator {
    position: absolute;
    right: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }

  .selected-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: var(--color-success-50);
    border: 1px solid var(--color-success-200);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    color: var(--color-success-800);
  }

  .clear-button {
    background: transparent;
    border: none;
    color: var(--color-success-600);
    cursor: pointer;
    font-size: 1rem;
    padding: 0;
    transition: opacity 0.15s;
  }

  .clear-button:hover {
    opacity: 0.7;
  }
</style>
