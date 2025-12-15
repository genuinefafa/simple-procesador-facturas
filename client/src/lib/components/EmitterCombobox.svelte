<script lang="ts">
  import { Combobox } from 'melt/builders';

  type Emitter = {
    id: number;
    name: string;
    cuit: string;
  };

  type Props = {
    value?: Emitter | null;
    onselect?: (emitter: Emitter | null) => void;
  };

  let { value = null, onselect }: Props = $props();

  let items = $state<Emitter[]>([]);
  let query = $state('');
  let loading = $state(false);
  let selectedEmitter = $state<Emitter | null>(value);
  let showResults = $state(false);

  const combobox = new Combobox<Emitter>({
    inputValue: value?.name || '',
    onInputValueChange: (newValue) => {
      if (!newValue) {
        selectedEmitter = null;
        onselect?.(null);
      }
    },
  });

  // Buscar emisores cuando cambia el query
  $effect(() => {
    if (combobox.inputValue.length < 3) {
      items = [];
      showResults = false;
      return;
    }

    const q = combobox.inputValue;
    loading = true;

    fetch(`/api/emisores?q=${encodeURIComponent(q)}`)
      .then((res) => res.json())
      .then((json) => {
        items = json.emitters || [];
        showResults = items.length > 0;
      })
      .catch((e) => console.error('Error buscando emisores:', e))
      .finally(() => (loading = false));
  });

  function selectItem(emitter: Emitter) {
    selectedEmitter = emitter;
    combobox.select(emitter);
    onselect?.(emitter);
    showResults = false;
  }

  // Función helper para formatear CUIT sin guiones
  function formatCuitPlain(cuit: string): string {
    return cuit.replace(/-/g, '');
  }
</script>

<div class="emitter-combobox">
  <label {...combobox.label}>Emisor</label>
  <div class="combobox-wrapper">
    <input
      {...combobox.input}
      type="text"
      placeholder="Buscar por nombre o CUIT..."
      class="combobox-input"
    />
    {#if showResults}
      <div {...combobox.content} class="combobox-listbox">
        {#each items as emitter}
          <button
            type="button"
            {...combobox.getOption(emitter)}
            onclick={() => selectItem(emitter)}
            class="combobox-item"
          >
            <div class="item-content">
              <strong>{emitter.name}</strong>
              <span class="cuit-hint">{formatCuitPlain(emitter.cuit)}</span>
            </div>
          </button>
        {/each}
      </div>
    {/if}
    {#if loading}
      <span class="loading-indicator">Buscando...</span>
    {/if}
  </div>
</div>

<style>
  .emitter-combobox {
    margin-bottom: var(--spacing-2);
  }

  label {
    display: block;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin-bottom: 0.25rem;
  }

  .combobox-wrapper {
    position: relative;
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
  }

  .cuit-hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    font-family: monospace;
  }

  .loading-indicator {
    position: absolute;
    right: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }
</style>
