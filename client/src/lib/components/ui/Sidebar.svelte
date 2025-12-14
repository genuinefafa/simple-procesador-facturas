<script lang="ts">
  import type { Snippet } from 'svelte';

  interface NavItem {
    href: string;
    label: string;
    icon?: string;
  }

  interface Props {
    title?: string;
    navItems?: NavItem[];
    onNavClick?: (href: string) => void;
    children?: Snippet;
    open?: boolean;
    class?: string;
  }

  let {
    title = 'Menu',
    navItems = [],
    onNavClick,
    children,
    open = $bindable(true),
    class: className = '',
  }: Props = $props();

  function handleNavClick(href: string) {
    onNavClick?.(href);
    // En mobile, cerrar sidebar después de click
    if (window.innerWidth < 768) {
      open = false;
    }
  }
</script>

<!-- Overlay móvil -->
{#if !open}
  <button
    class="sidebar-overlay-closed"
    onclick={() => (open = true)}
    aria-label="Abrir navegación"
    title="Abrir navegación"
  >
    ☰
  </button>
{/if}

{#if open}
  <div class="sidebar-overlay-mobile" onclick={() => (open = false)} role="presentation"></div>
{/if}

<!-- Sidebar -->
<nav class="sidebar {className}" class:open>
  <!-- Header -->
  <div class="sidebar-header">
    <h1 class="sidebar-title">{title}</h1>
    <button
      class="sidebar-close-mobile"
      onclick={() => (open = false)}
      aria-label="Cerrar navegación"
      title="Cerrar"
    >
      ✕
    </button>
  </div>

  <!-- Nav Items -->
  {#if navItems.length > 0}
    <ul class="sidebar-nav">
      {#each navItems as item (item.href)}
        <li>
          <a
            href={item.href}
            class="sidebar-nav-item"
            onclick={() => handleNavClick(item.href)}
            role="menuitem"
          >
            {#if item.icon}
              <span class="nav-icon">{item.icon}</span>
            {/if}
            <span class="nav-label">{item.label}</span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}

  <!-- Custom content -->
  {#if children}
    <div class="sidebar-content">
      {@render children()}
    </div>
  {/if}
</nav>

<style>
  /* Botón hamburguesa fijo (móvil) */
  .sidebar-overlay-closed {
    display: none;
    position: fixed;
    bottom: var(--spacing-4);
    right: var(--spacing-4);
    z-index: var(--z-fixed);
    background: var(--color-primary-600);
    color: var(--color-text-inverse);
    border: none;
    border-radius: var(--radius-full);
    width: 48px;
    height: 48px;
    font-size: 1.25rem;
    cursor: pointer;
    box-shadow: var(--shadow-lg);
    transition: all var(--transition-fast);
    display: grid;
    place-items: center;
  }

  .sidebar-overlay-closed:hover {
    background: var(--color-primary-700);
    transform: scale(1.1);
  }

  .sidebar-overlay-closed:active {
    transform: scale(0.95);
  }

  /* Overlay móvil */
  .sidebar-overlay-mobile {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: var(--z-modal-backdrop);
    animation: fadeIn var(--transition-fast);
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* Sidebar */
  .sidebar {
    display: flex;
    flex-direction: column;
    width: 280px;
    height: 100vh;
    background: var(--color-neutral-800);
    color: var(--color-text-inverse);
    border-right: 1px solid var(--color-neutral-700);
    position: sticky;
    top: 0;
    overflow-y: auto;
    z-index: var(--z-sticky);
    transition: all var(--transition-base);
  }

  .sidebar-header {
    padding: var(--spacing-5) var(--spacing-4);
    border-bottom: 1px solid var(--color-neutral-700);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-2);
  }

  .sidebar-title {
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-bold);
    white-space: nowrap;
    flex: 1;
  }

  .sidebar-close-mobile {
    display: none;
    background: transparent;
    border: none;
    color: var(--color-text-inverse);
    font-size: var(--font-size-lg);
    cursor: pointer;
    padding: var(--spacing-2);
    border-radius: var(--radius-base);
    transition: background var(--transition-fast);
  }

  .sidebar-close-mobile:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .sidebar-nav {
    flex: 1;
    list-style: none;
    margin: 0;
    padding: var(--spacing-3);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  .sidebar-nav-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
    padding: var(--spacing-3) var(--spacing-4);
    color: var(--color-neutral-300);
    text-decoration: none;
    border-radius: var(--radius-base);
    transition: all var(--transition-fast);
    white-space: nowrap;
    font-weight: var(--font-weight-medium);
  }

  .sidebar-nav-item:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--color-text-inverse);
  }

  .sidebar-nav-item:active {
    background: rgba(255, 255, 255, 0.2);
  }

  .sidebar-nav-item:focus-visible {
    outline: 2px solid var(--color-primary-500);
    outline-offset: -2px;
    border-radius: var(--radius-sm);
  }

  .nav-icon {
    font-size: var(--font-size-xl);
    flex-shrink: 0;
    width: 24px;
    text-align: center;
  }

  .nav-label {
    flex: 1;
    transition: opacity var(--transition-base);
  }

  .sidebar-content {
    padding: var(--spacing-4);
    border-top: 1px solid var(--color-neutral-700);
  }

  .sidebar-footer {
    padding: var(--spacing-4);
    border-top: 1px solid var(--color-neutral-700);
    margin-top: auto;
  }

  /* Mobile (< 768px) */
  @media (max-width: 767px) {
    .sidebar-overlay-closed {
      display: grid;
    }

    .sidebar {
      position: fixed;
      left: 0;
      top: 0;
      bottom: 0;
      width: 280px;
      transform: translateX(-100%);
      transition: transform var(--transition-base);
      box-shadow: 2px 0 8px rgba(0, 0, 0, 0.2);
    }

    .sidebar.open {
      transform: translateX(0);
    }

    .sidebar-overlay-mobile {
      display: block;
    }

    .sidebar-close-mobile {
      display: block;
    }
  }

  /* Scrollbar styling */
  .sidebar::-webkit-scrollbar {
    width: 6px;
  }

  .sidebar::-webkit-scrollbar-track {
    background: transparent;
  }

  .sidebar::-webkit-scrollbar-thumb {
    background: var(--color-neutral-600);
    border-radius: var(--radius-full);
  }

  .sidebar::-webkit-scrollbar-thumb:hover {
    background: var(--color-neutral-500);
  }
</style>
