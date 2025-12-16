<script lang="ts">
  import { page } from '$app/stores';
  import Input from '$lib/components/ui/Input.svelte';
  import '$lib/components/ui/tokens.css';

  type NavItem = {
    href: string;
    label: string;
    icon: string;
  };

  let { children } = $props();

  const navItems: NavItem[] = [
    { href: '/dashboard', label: 'Dashboard', icon: '🏠' },
    { href: '/comprobantes', label: 'Comprobantes', icon: '📋' },
    { href: '/emisores', label: 'Emisores', icon: '👥' },
    { href: '/entrenamiento', label: 'Entrenamiento', icon: '📝' },
  ];

  let railExpanded = $state(false);
  let searchQuery = $state('');
  let searchResults = $state<any[]>([]);
  let searchOpen = $state(false);

  function isActive(href: string): boolean {
    return $page.url.pathname.startsWith(href);
  }

  async function handleSearch(e: Event) {
    const input = e.target as HTMLInputElement;
    const q = input.value.trim();

    if (!q) {
      searchResults = [];
      searchOpen = false;
      return;
    }

    try {
      const res = await fetch(`/api/invoices/search?q=${encodeURIComponent(q)}&limit=8`);
      const json = await res.json();
      searchResults = json.items ?? [];
      searchOpen = true;
    } catch (error) {
      console.error('Search error:', error);
      searchResults = [];
    }
  }

  function clearSearch() {
    searchQuery = '';
    searchResults = [];
    searchOpen = false;
  }
</script>

<svelte:head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<div class="layout">
  <!-- TOPBAR -->
  <header class="topbar">
    <div class="topbar-left">
      <button
        class="rail-toggle"
        onclick={() => (railExpanded = !railExpanded)}
        aria-label="Toggle menu"
        title="Menú"
      >
        ☰
      </button>
      <a href="/dashboard" class="logo app-logo" aria-label="Ir al dashboard">
        <img src="/favicon.svg" alt="Logo" class="logo-icon" />
        <span>Simple procesador de facturas</span>
      </a>
    </div>

    <div class="topbar-center">
      <div class="search-wrapper">
        <Input
          type="search"
          placeholder="Buscar facturas, CUIT, comprobante..."
          bind:value={searchQuery}
          oninput={handleSearch}
          class="search-input"
        />
        {#if searchOpen && searchResults.length > 0}
          <ul class="search-dropdown">
            {#each searchResults as result}
              <li>
                <a href={`/facturas?id=${result.id}`} onclick={clearSearch}>
                  <span class="result-number">{result.fullInvoiceNumber ?? '—'}</span>
                  <span class="result-cuit">{result.emitterCuit}</span>
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>

    <div class="topbar-right">
      <a href="/google-sync" class="topbar-icon" title="Sync Google">☁️</a>
      <div class="user-avatar">👤</div>
    </div>
  </header>

  <div class="main-container">
    <!-- RAIL (collapsible) -->
    <aside class="rail" class:expanded={railExpanded}>
      <nav class="rail-nav">
        {#each navItems as item}
          <a
            href={item.href}
            class="rail-item"
            class:active={isActive(item.href)}
            title={item.label}
            onclick={() => {
              if (window.innerWidth < 768) railExpanded = false;
            }}
          >
            <span class="rail-icon">{item.icon}</span>
            <span class="rail-label">{item.label}</span>
          </a>
        {/each}
      </nav>

      <div class="rail-footer">
        <p class="rail-version">v0.4.0</p>
      </div>
    </aside>

    <!-- CONTENT -->
    <main class="content">
      <div class="content-inner">
        {@render children()}
      </div>
    </main>
  </div>
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

  .layout {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  /* TOPBAR */
  .topbar {
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    padding: var(--spacing-3) var(--spacing-4);
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: var(--spacing-4);
    align-items: center;
    box-shadow: var(--shadow-sm);
    position: sticky;
    top: 0;
    z-index: var(--z-fixed);
  }

  .topbar-left {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
  }

  .rail-toggle {
    display: none;
    background: transparent;
    border: none;
    font-size: var(--font-size-lg);
    cursor: pointer;
    padding: 0.5rem;
    border-radius: var(--radius-base);
    color: var(--color-text-primary);
    transition: background var(--transition-fast);
  }

  .rail-toggle:hover {
    background: var(--color-surface-alt);
  }

  .logo {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
  }

  .app-logo {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-2);
    text-decoration: none;
    color: var(--color-text-primary);
    height: 28px;
  }

  .logo-icon {
    height: 24px;
    width: auto;
    display: block;
    object-fit: contain;
  }

  .topbar-center {
    display: flex;
    justify-content: center;
  }

  .search-wrapper {
    position: relative;
    width: 100%;
    max-width: 380px;
  }

  :global(.search-input) {
    width: 100%;
  }

  .search-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-top: none;
    border-radius: 0 0 var(--radius-base) var(--radius-base);
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 240px;
    overflow-y: auto;
    box-shadow: var(--shadow-md);
    z-index: 1;
  }

  .search-dropdown li {
    border-top: 1px solid var(--color-border);
  }

  .search-dropdown li:first-child {
    border-top: none;
  }

  .search-dropdown a {
    display: flex;
    gap: var(--spacing-2);
    padding: var(--spacing-2) var(--spacing-3);
    color: var(--color-text-primary);
    text-decoration: none;
    transition: background var(--transition-fast);
  }

  .search-dropdown a:hover {
    background: var(--color-surface-alt);
  }

  .result-number {
    font-weight: var(--font-weight-semibold);
    color: var(--color-primary-700);
  }

  .result-cuit {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .topbar-right {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
  }

  .topbar-icon {
    font-size: var(--font-size-lg);
    text-decoration: none;
    transition: opacity var(--transition-fast);
  }

  .topbar-icon:hover {
    opacity: 0.75;
  }

  .user-avatar {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-full);
    background: var(--color-primary-50);
    border: 1px solid var(--color-primary-200);
    font-size: var(--font-size-lg);
  }

  /* MAIN CONTAINER */
  .main-container {
    display: flex;
    flex: 1;
  }

  /* RAIL */
  .rail {
    width: 60px;
    background: var(--color-surface);
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    transition: width var(--transition-base);
    position: relative;
  }

  .rail.expanded {
    width: 220px;
  }

  .rail-nav {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: var(--spacing-2);
    gap: var(--spacing-2);
  }

  .rail-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
    padding: var(--spacing-3);
    color: var(--color-text-secondary);
    text-decoration: none;
    border-radius: var(--radius-base);
    transition: all var(--transition-fast);
    white-space: nowrap;
  }

  .rail-item:hover {
    background: var(--color-surface-alt);
    color: var(--color-text-primary);
  }

  .rail-item.active {
    background: var(--color-primary-50);
    color: var(--color-primary-700);
    font-weight: var(--font-weight-semibold);
  }

  .rail-icon {
    font-size: var(--font-size-lg);
    flex-shrink: 0;
  }

  .rail-label {
    opacity: 0;
    transition: opacity var(--transition-base);
    font-size: var(--font-size-sm);
  }

  .rail.expanded .rail-label {
    opacity: 1;
  }

  .rail-footer {
    padding: var(--spacing-2) var(--spacing-3);
    border-top: 1px solid var(--color-border);
    text-align: center;
  }

  .rail-version {
    margin: 0;
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }

  /* CONTENT */
  .content {
    flex: 1;
    overflow: auto;
  }

  .content-inner {
    padding: var(--spacing-6);
    max-width: 1400px;
    margin: 0 auto;
    width: 100%;
  }

  /* RESPONSIVE */
  @media (max-width: 768px) {
    .topbar {
      padding: var(--spacing-2) var(--spacing-3);
      gap: var(--spacing-2);
    }

    .topbar-left {
      gap: var(--spacing-2);
    }

    .rail-toggle {
      display: block;
    }

    .logo {
      font-size: var(--font-size-base);
    }

    .app-logo {
      height: 24px;
    }

    .logo-icon {
      height: 20px;
    }

    .search-wrapper {
      max-width: 100%;
    }

    .topbar-center {
      order: 3;
      grid-column: 1 / -1;
    }

    .rail {
      position: fixed;
      left: -220px;
      top: 0;
      height: 100vh;
      width: 220px;
      z-index: var(--z-modal-backdrop);
      box-shadow: var(--shadow-lg);
    }

    .rail.expanded {
      left: 0;
      width: 220px;
    }

    .rail-label {
      opacity: 1;
    }

    .content-inner {
      padding: var(--spacing-4);
    }
  }
</style>
