<script lang="ts">
  import { page } from '$app/state';
  import { Dropdown, Dialog, Button, Tabs } from '$lib/components/ui';

  const navItems = [
    { href: '/importar', label: 'Importar', icon: '📥' },
    { href: '/procesar', label: 'Procesar', icon: '⚙️' },
    { href: '/entrenamiento', label: 'Entrenamiento', icon: '📝' },
    { href: '/facturas', label: 'Facturas', icon: '📋' },
  ];

  const topTabs = [
    { value: 'resumen', label: 'Resumen' },
    { value: 'pendientes', label: 'Pendientes' },
    { value: 'actividad', label: 'Actividad' },
  ];

  let sidebarOpen = $state(true);
  let settingsOpen = $state(false);
  let topTab = $state('resumen');

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
  }

  function isActive(href: string): boolean {
    return page.url.pathname.startsWith(href);
  }
</script>

<svelte:head>
  <title>Demo Layout Melt UI</title>
</svelte:head>

<div class="app-container">
  {#if !sidebarOpen}
    <button class="global-toggle" onclick={toggleSidebar} aria-label="Abrir menú" title="Abrir menú"
      >→</button
    >
  {/if}

  <aside class="sidebar" class:collapsed={!sidebarOpen}>
    <div class="sidebar-header">
      <h1 class="logo">🧾 Facturas</h1>
      <button class="sidebar-toggle" onclick={toggleSidebar} title="Alternar sidebar">
        {sidebarOpen ? '←' : '→'}
      </button>
    </div>

    <nav class="sidebar-nav">
      {#each navItems as item}
        <a href={item.href} class="nav-item" class:active={isActive(item.href)} title={item.label}>
          <span class="nav-icon">{item.icon}</span>
          <span class="nav-label">{item.label}</span>
        </a>
      {/each}
    </nav>

    <div class="sidebar-footer">
      <Dropdown>
        {#snippet trigger()}
          <span>⚙️</span>
          <span class="nav-label">Opciones</span>
        {/snippet}
        {#snippet children()}
          <button class="dropdown-item" onclick={() => (settingsOpen = true)}>
            <span>⚙️</span>
            <span>Configuración</span>
          </button>
          <a href="/google-sync" class="dropdown-item">
            <span>☁️</span>
            <span>Sincronización</span>
          </a>
          <div class="dropdown-separator"></div>
          <button class="dropdown-item">
            <span>❓</span>
            <span>Ayuda</span>
          </button>
        {/snippet}
      </Dropdown>
      <p class="version">v0.2.0</p>
    </div>
  </aside>

  <main class="main-content">
    <header class="topbar">
      <div class="topbar-left">
        <button class="ghost" onclick={toggleSidebar} aria-label="Alternar menú">☰</button>
        <h2>Dashboard</h2>
      </div>
      <div class="topbar-right">
        <Button variant="secondary" size="sm">Nuevo</Button>
        <Dropdown>
          {#snippet trigger()}
            <div class="avatar">
              <span>FA</span>
              <span class="chevron">▼</span>
            </div>
          {/snippet}
          {#snippet children()}
            <button class="dropdown-item">Perfil</button>
            <button class="dropdown-item">Notificaciones</button>
            <div class="dropdown-separator"></div>
            <button class="dropdown-item">Cerrar sesión</button>
          {/snippet}
        </Dropdown>
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
    description="Ajusta las preferencias de la aplicación"
  >
    <div style="padding: var(--spacing-4) 0; display: flex; gap: var(--spacing-3); flex-direction: column;">
      <p>Aquí irían los ajustes de configuración...</p>
      <Button variant="primary" onclick={() => (settingsOpen = false)}>Cerrar</Button>
    </div>
  </Dialog>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: var(--font-sans);
    background: var(--color-background);
    color: var(--color-text-primary);
  }

  :global(*) {
    box-sizing: border-box;
  }

  .app-container {
    display: flex;
    min-height: 100vh;
    position: relative;
  }

  .sidebar {
    width: 280px;
    background: var(--color-neutral-800);
    color: var(--color-text-inverse);
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--color-neutral-700);
    transition: all var(--transition-base);
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
  }

  .sidebar.collapsed {
    width: 80px;
  }

  .sidebar-header {
    padding: var(--spacing-6);
    border-bottom: 1px solid var(--color-neutral-700);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .logo {
    margin: 0;
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-bold);
    white-space: nowrap;
    transition: opacity var(--transition-base);
  }

  .sidebar-toggle {
    background: none;
    border: none;
    color: var(--color-text-inverse);
    font-size: var(--font-size-xl);
    cursor: pointer;
    padding: var(--spacing-2);
    border-radius: var(--radius-base);
    transition: background var(--transition-fast);
  }

  .sidebar-toggle:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .sidebar-nav {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
    padding: var(--spacing-4) var(--spacing-3);
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-4);
    padding: var(--spacing-3) var(--spacing-4);
    color: var(--color-neutral-300);
    text-decoration: none;
    border-radius: var(--radius-base);
    transition: all var(--transition-fast);
    white-space: nowrap;
  }

  .nav-item:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--color-text-inverse);
  }

  .nav-item.active {
    background: var(--color-primary-600);
    color: var(--color-text-inverse);
    font-weight: var(--font-weight-semibold);
  }

  .nav-icon {
    font-size: var(--font-size-xl);
    flex-shrink: 0;
  }

  .nav-label {
    transition: opacity var(--transition-base);
  }

  .sidebar.collapsed .nav-label {
    opacity: 0;
    width: 0;
    overflow: hidden;
  }

  .sidebar-footer {
    padding: var(--spacing-3) var(--spacing-4);
    border-top: 1px solid var(--color-neutral-700);
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    justify-content: space-between;
  }

  .version {
    margin: 0;
    font-size: var(--font-size-xs);
    color: var(--color-neutral-500);
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

  .ghost {
    border: none;
    background: transparent;
    color: var(--color-text-primary);
    font-size: 1rem;
    cursor: pointer;
    padding: var(--spacing-2);
    border-radius: var(--radius-base);
  }

  .ghost:hover {
    background: var(--color-neutral-100);
  }

  .avatar {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-2);
    padding: var(--spacing-2) var(--spacing-3);
    border-radius: var(--radius-full);
    background: var(--color-neutral-100);
    border: 1px solid var(--color-border);
    font-weight: var(--font-weight-medium);
  }

  .avatar .chevron {
    font-size: 0.8rem;
    color: var(--color-text-secondary);
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

  .global-toggle {
    position: fixed;
    left: var(--spacing-2);
    top: var(--spacing-2);
    z-index: var(--z-fixed);
    background: var(--color-primary-600);
    color: var(--color-text-inverse);
    border: none;
    border-radius: var(--radius-full);
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    box-shadow: var(--shadow-md);
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .global-toggle:hover {
    background: var(--color-primary-700);
  }

  @media (max-width: 768px) {
    .sidebar {
      width: 70px;
      position: fixed;
      left: 0;
      top: 0;
      z-index: var(--z-sticky);
    }

    .main-content {
      margin-left: 70px;
    }

    .nav-label {
      display: none;
    }

    .content-wrapper {
      padding: var(--spacing-4);
    }
  }
</style>
