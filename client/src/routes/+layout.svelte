<script lang="ts">
  import { page } from '$app/stores';
  import '$lib/components/ui/tokens.css';

  let { children } = $props();

  const navItems = [
    { href: '/importar', label: 'Importar', icon: '📥' },
    { href: '/procesar', label: 'Procesar', icon: '⚙️' },
    { href: '/entrenamiento', label: 'Entrenamiento', icon: '📝' },
    { href: '/facturas', label: 'Facturas', icon: '📋' },
  ];

  let sidebarOpen = $state(true);

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
  }

  function isActive(href: string): boolean {
    return $page.url.pathname.startsWith(href);
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
      <a href="/google-sync" class="sync-link" title="Sync">☁️</a>
      <p class="version">v0.2.0</p>
    </div>
  </aside>

  <!-- Main Content -->
  <main class="main-content">
    <div class="content-wrapper">
      {@render children()}
    </div>
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family:
      -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background: #f5f5f5;
    color: #333;
  }

  :global(*) {
    box-sizing: border-box;
  }

  .app-container {
    display: flex;
    min-height: 100vh;
    position: relative;
  }

  /* SIDEBAR */
  .sidebar {
    width: 280px;
    background: #1e293b;
    color: white;
    display: flex;
    flex-direction: column;
    border-right: 1px solid #334155;
    transition: all 0.3s ease;
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
  }

  .sidebar.collapsed {
    width: 80px;
  }

  .sidebar-header {
    padding: 1.5rem;
    border-bottom: 1px solid #334155;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .logo {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    white-space: nowrap;
    transition: opacity 0.3s;
  }

  .sidebar.collapsed .logo {
    font-size: 1.8rem;
  }

  .sidebar-toggle {
    background: none;
    border: none;
    color: white;
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 6px;
    transition: background 0.2s;
  }

  .sidebar-toggle:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  /* SIDEBAR NAV */
  .sidebar-nav {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem 0.75rem;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
    color: #cbd5e1;
    text-decoration: none;
    border-radius: 6px;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .nav-item:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }

  .nav-item.active {
    background: #2563eb;
    color: white;
    font-weight: 600;
  }

  .nav-icon {
    font-size: 1.2rem;
    flex-shrink: 0;
  }

  .nav-label {
    transition: opacity 0.3s;
  }

  .sidebar.collapsed .nav-label {
    opacity: 0;
    width: 0;
    overflow: hidden;
  }

  /* SIDEBAR FOOTER */
  .sidebar-footer {
    padding: 0.75rem 1rem;
    border-top: 1px solid #334155;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: center;
  }

  .version {
    margin: 0;
    font-size: 0.8rem;
    color: #64748b;
  }

  .sync-link {
    color: #94a3b8;
    text-decoration: none;
    font-size: 1rem;
  }
  .sync-link:hover {
    color: #cbd5e1;
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
    padding: 2rem;
    max-width: 1400px;
    margin: 0 auto;
    width: 100%;
  }

  /* RESPONSIVE */
  @media (max-width: 768px) {
    .sidebar {
      width: 70px;
      position: fixed;
      left: 0;
      top: 0;
      z-index: 1000;
      height: 100vh;
    }

    .sidebar.collapsed {
      width: 70px;
    }

    .main-content {
      margin-left: 70px;
    }

    .nav-label {
      display: none;
    }

    .content-wrapper {
      padding: 1rem;
    }
  }

  /* Global toggle (always visible to reopen) */
  .global-toggle {
    position: fixed;
    left: 8px;
    top: 8px;
    z-index: 2000;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 999px;
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
    cursor: pointer;
  }
  .global-toggle:hover {
    background: #1d4ed8;
  }

  @media (max-width: 480px) {
    .sidebar {
      width: 60px;
    }

    .main-content {
      margin-left: 60px;
    }

    .sidebar-header {
      padding: 1rem;
    }

    .nav-item {
      padding: 0.75rem 0.5rem;
    }

    .logo {
      font-size: 1.2rem;
    }
  }
</style>
