<script lang="ts">
  /**
   * Layout Example con Melt UI
   * Ejemplo de cómo integrar los componentes UI primitivos en el layout
   */
  import { page } from '$app/state';
  import { Dropdown, Dialog } from '$lib/components/ui';

  let { children } = $props();

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

  let sidebarOpen = $state(true);
  let settingsOpen = $state(false);

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
  }

  function isActive(href: string): boolean {
    return page.url.pathname.startsWith(href);
  }
</script>

<svelte:head>
  <title>Procesador de Facturas</title>
</svelte:head>

<div class="app-container">
  {#if !sidebarOpen}
    <button class="global-toggle" onclick={toggleSidebar} aria-label="Abrir menú" title="Abrir menú"
      >→</button
    >
  {/if}

  <!-- Sidebar Global -->
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
      <!-- Dropdown con Melt UI para opciones -->
      <Dropdown label="Opciones" items={sidebarMenu} />

      <p class="version">v0.2.0</p>
    </div>
  </aside>

  <!-- Main Content -->
  <main class="main-content">
    <div class="content-wrapper">
      {@render children()}
    </div>
  </main>

  <!-- Dialog de configuración usando Melt UI -->
  <Dialog
    bind:open={settingsOpen}
    title="Configuración"
    description="Ajusta las preferencias de la aplicación"
  >
    <div style="padding: var(--spacing-4) 0;">
      <p>Aquí irían los ajustes de configuración...</p>
      <button class="btn btn-primary" onclick={() => (settingsOpen = false)}>Cerrar</button>
    </div>
  </Dialog>
</div>

<style>
  /* Usando los tokens CSS definidos */
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

  /* SIDEBAR usando tokens */
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

  .sidebar.collapsed .logo {
    font-size: var(--font-size-3xl);
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

  .sidebar-toggle:focus-visible {
    outline: 2px solid var(--color-primary-500);
    outline-offset: 2px;
  }

  /* SIDEBAR NAV */
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

  .nav-item:focus-visible {
    outline: 2px solid var(--color-primary-500);
    outline-offset: -2px;
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

  /* SIDEBAR FOOTER */
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

  /* MAIN CONTENT */
  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: auto;
  }

  .content-wrapper {
    flex: 1;
    padding: var(--spacing-8);
    max-width: 1400px;
    margin: 0 auto;
    width: 100%;
  }

  /* Global toggle */
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

  .global-toggle:focus-visible {
    outline: 2px solid var(--color-primary-500);
    outline-offset: 2px;
  }

  /* RESPONSIVE */
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
