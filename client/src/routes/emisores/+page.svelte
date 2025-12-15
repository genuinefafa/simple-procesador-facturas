<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';

  let emisores = $state<Array<{ id: number; name: string; cuit: string }>>([]);
  let searchQuery = $state('');
  let loading = $state(false);

  // Nuevo emisor
  let showForm = $state(false);
  let newEmisor = $state({ name: '', cuit: '' });

  async function searchEmisores() {
    if (!searchQuery || searchQuery.length < 2) {
      emisores = [];
      return;
    }
    loading = true;
    try {
      const res = await fetch(`/api/emisores?q=${encodeURIComponent(searchQuery)}`);
      const json = await res.json();
      emisores = json.emitters || [];
    } catch (e) {
      console.error('Error buscando emisores:', e);
    } finally {
      loading = false;
    }
  }

  async function createEmisor() {
    if (!newEmisor.name.trim() || !newEmisor.cuit.trim()) {
      alert('Nombre y CUIT son requeridos');
      return;
    }

    try {
      const res = await fetch('/api/emisores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEmisor),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Error al crear emisor');
      }

      const json = await res.json();
      alert(`Emisor creado: ${json.emitter.name}`);
      newEmisor = { name: '', cuit: '' };
      showForm = false;
      searchEmisores();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error desconocido');
    }
  }
</script>

<svelte:head>
  <title>Emisores</title>
</svelte:head>

<div class="container">
  <header class="header">
    <div>
      <h1>Emisores</h1>
      <p class="hint">Gestión de emisores de facturas (proveedores/clientes)</p>
    </div>
    <Button onclick={() => (showForm = !showForm)}>
      {showForm ? 'Cancelar' : 'Nuevo Emisor'}
    </Button>
  </header>

  {#if showForm}
    <section class="form-section">
      <h2>Crear Nuevo Emisor</h2>
      <div class="form-group">
        <label for="name">Nombre / Razón Social *</label>
        <input id="name" type="text" bind:value={newEmisor.name} placeholder="Ej: Acme SA" />
      </div>
      <div class="form-group">
        <label for="cuit">CUIT *</label>
        <input id="cuit" type="text" bind:value={newEmisor.cuit} placeholder="Ej: 30-12345678-9" />
      </div>
      <Button onclick={createEmisor}>Crear</Button>
    </section>
  {/if}

  <section class="search-section">
    <div class="search-bar">
      <input
        type="search"
        placeholder="Buscar por nombre o CUIT..."
        bind:value={searchQuery}
        oninput={searchEmisores}
      />
      <Button variant="secondary" onclick={searchEmisores} disabled={loading}>
        {loading ? 'Buscando...' : 'Buscar'}
      </Button>
    </div>
  </section>

  {#if emisores.length > 0}
    <section class="results">
      <h2>Resultados ({emisores.length})</h2>
      <div class="list">
        {#each emisores as emisor}
          <div class="emisor-card">
            <div class="emisor-info">
              <h3>{emisor.name}</h3>
              <p class="cuit">CUIT: {emisor.cuit}</p>
            </div>
            <div class="emisor-actions">
              <!-- Futuro: editar, eliminar, ver facturas -->
            </div>
          </div>
        {/each}
      </div>
    </section>
  {:else if searchQuery && !loading}
    <p class="empty-state">No se encontraron emisores con "{searchQuery}"</p>
  {/if}
</div>

<style>
  .container {
    max-width: 900px;
    margin: 0 auto;
    padding: var(--spacing-4);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--spacing-4);
  }

  .header h1 {
    margin: 0 0 0.25rem;
  }

  .hint {
    color: var(--color-text-secondary);
    margin: 0;
  }

  .form-section {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--spacing-4);
    background: var(--color-surface);
    margin-bottom: var(--spacing-4);
  }

  .form-section h2 {
    margin: 0 0 var(--spacing-3);
    font-size: var(--font-size-lg);
  }

  .form-group {
    margin-bottom: var(--spacing-2);
  }

  .form-group label {
    display: block;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin-bottom: 0.25rem;
  }

  .form-group input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
  }

  .search-section {
    margin-bottom: var(--spacing-4);
  }

  .search-bar {
    display: flex;
    gap: var(--spacing-2);
  }

  .search-bar input {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
  }

  .results h2 {
    margin: 0 0 var(--spacing-3);
    font-size: var(--font-size-lg);
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  .emisor-card {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-3);
    background: var(--color-surface);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .emisor-card h3 {
    margin: 0 0 0.25rem;
    font-size: var(--font-size-md);
  }

  .cuit {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .empty-state {
    text-align: center;
    color: var(--color-text-tertiary);
    padding: var(--spacing-8);
    font-style: italic;
  }
</style>
