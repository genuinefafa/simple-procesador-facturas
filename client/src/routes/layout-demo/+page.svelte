<script lang="ts">
  import { page } from '$app/state';
  import { Dropdown, Dialog, Button, Tabs, Sidebar } from '$lib/components/ui';

  const navItems = [
    { href: '/importar', label: 'Importar', icon: '📥' },
    { href: '/procesar', label: 'Procesar', icon: '⚙️' },
    { href: '/entrenamiento', label: 'Entrenamiento', icon: '📝' },
    { href: '/facturas', label: 'Facturas', icon: '📋' },
  ];

  const sidebarMenu = [
    { label: 'Configuración', icon: '⚙️', onSelect: () => (settingsOpen = true) },
    { label: 'Sincronización', icon: '☁️', href: '/google-sync' },
    { type: 'separator' } as const,
    { label: 'Ayuda', icon: '❓' },
  ];

  const avatarMenu = [
    { label: 'Perfil' },
    { label: 'Notificaciones' },
    { type: 'separator' } as const,
    { label: 'Cerrar sesión' },
  ];

  const topTabs = [
    { value: 'resumen', label: 'Resumen' },
    { value: 'pendientes', label: 'Pendientes' },
    { value: 'actividad', label: 'Actividad' },
  ];

  let sidebarOpen = $state(true);
  let settingsOpen = $state(false);
  let topTab = $state('resumen');
</script>

<svelte:head>
  <title>Demo Layout Melt UI</title>
</svelte:head>

<div class="app-container">
  <Sidebar {navItems} title="🧾 Facturas" bind:open={sidebarOpen}>
    {#snippet children()}
      <div class="sidebar-options">
        <Dropdown label="Opciones" items={sidebarMenu} />
      </div>
      <p class="version">v0.2.0</p>
    {/snippet}
  </Sidebar>

  <main class="main-content">
    <header class="topbar">
      <div class="topbar-left">
        <h2>Dashboard</h2>
      </div>
      <div class="topbar-right">
        <Button variant="secondary" size="sm">Nuevo</Button>
        <Dropdown label="Cuenta" items={avatarMenu} />
      </div>
    </header>

    <div class="content-wrapper">
      <Tabs tabs={topTabs} bind:value={topTab} />

      {#if topTab === 'resumen'}
        <section class="cards">
          <div class="card">
            <p class="label">Pendientes</p>
            <p class="value">8</p>
            <p class="hint">Archivos esperando revisión</p>
          </div>
          <div class="card">
            <p class="label">Procesadas</p>
            <p class="value">24</p>
            <p class="hint">Facturas validadas</p>
          </div>
          <div class="card">
            <p class="label">En entrenamiento</p>
            <p class="value">3</p>
            <p class="hint">Plantillas ajustándose</p>
          </div>
        </section>
      {:else if topTab === 'pendientes'}
        <section class="panel">
          <h3>Archivos pendientes</h3>
          <p>Lista de pendientes de ejemplo.</p>
        </section>
      {:else}
        <section class="panel">
          <h3>Actividad reciente</h3>
          <p>Movimientos y cambios recientes.</p>
        </section>
      {/if}
    </div>
  </main>

  <Dialog
    bind:open={settingsOpen}
    title="Configuración"
  >
    {#snippet children()}
      <form class="form-group">
        <label for="language">
          <span>Idioma</span>
          <select id="language" class="form-control">
            <option value="es">Español</option>
            <option value="en">Inglés</option>
            <option value="pt">Portugués</option>
          </select>
        </label>
        <label for="theme">
          <span>Tema</span>
          <select id="theme" class="form-control">
            <option value="light">Claro</option>
            <option value="dark">Oscuro</option>
            <option value="auto">Automático</option>
          </select>
        </label>
      </form>
      <div class="dialog-buttons">
        <Button variant="secondary" onclick={() => (settingsOpen = false)}>Cancelar</Button>
        <Button variant="primary" onclick={() => (settingsOpen = false)}>Guardar</Button>
      </div>
    {/snippet}
  </Dialog>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  .app-container {
    display: flex;
    min-height: 100vh;
    position: relative;
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: auto;
    background: var(--color-surface-alt);
  }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-3) var(--spacing-4);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
    position: sticky;
    top: 0;
    z-index: var(--z-sticky);
  }

  .topbar-left {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
  }

  .topbar-left h2 {
    margin: 0;
    font-size: var(--font-size-xl);
  }

  .topbar-right {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
  }

  .content-wrapper {
    flex: 1;
    padding: var(--spacing-8);
    max-width: 1400px;
    margin: 0 auto;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-6);
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: var(--spacing-4);
  }

  .card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--spacing-5);
    box-shadow: var(--shadow-sm);
  }

  .card .label {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .card .value {
    margin: var(--spacing-2) 0;
    font-size: var(--font-size-3xl);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .card .hint {
    margin: 0;
    color: var(--color-text-tertiary);
    font-size: var(--font-size-sm);
  }

  .panel {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--spacing-5);
    box-shadow: var(--shadow-sm);
  }

  .version {
    margin: var(--spacing-3) 0 0 0;
    font-size: var(--font-size-xs);
    color: var(--color-neutral-500);
  }

  .sidebar-options {
    width: 100%;
  }

  :global(.options-trigger) {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
    width: 100%;
    padding: var(--spacing-3) var(--spacing-4);
    background: transparent;
    border: none;
    color: var(--color-neutral-300);
    cursor: pointer;
    border-radius: var(--radius-base);
    transition: all var(--transition-fast);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
  }

  :global(.options-trigger:hover) {
    background: rgba(255, 255, 255, 0.1);
    color: var(--color-text-inverse);
  }

  :global(.nav-label) {
    transition: opacity var(--transition-base);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
  }

  .form-group label {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
    font-weight: var(--font-weight-medium);
  }

  .form-control {
    padding: var(--spacing-2) var(--spacing-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    font-size: var(--font-size-sm);
    background: var(--color-surface);
    color: var(--color-text-primary);
  }

  .form-control:focus {
    outline: 2px solid var(--color-primary-500);
    outline-offset: -2px;
  }

  .dialog-buttons {
    display: flex;
    gap: var(--spacing-3);
    justify-content: flex-end;
    margin-top: var(--spacing-6);
  }

  @media (max-width: 768px) {
    .content-wrapper {
      padding: var(--spacing-4);
    }
  }
</style>
