<script lang="ts">
  type MenuItem =
    | { label: string; icon?: string; href?: string; onSelect?: () => void; type?: 'item' }
    | { type: 'separator' };

  interface Props {
    label?: string;
    items: MenuItem[];
    class?: string;
  }

  let { label = 'Opciones', items = [], class: className = '' }: Props = $props();

  let open = $state(false);
  let openUp = $state(false);
  let openLeft = $state(false);
  let buttonEl: HTMLButtonElement | undefined = $state();
  let menuEl: HTMLDivElement | undefined = $state();

  function handleSelect(entry: MenuItem) {
    if (entry.type === 'separator') return;
    entry.onSelect?.();
    open = false;
  }

  function handleClickOutside(e: MouseEvent) {
    if (buttonEl && !buttonEl.contains(e.target as Node)) {
      open = false;
    }
  }

  function checkPosition() {
    if (!buttonEl || !menuEl) return;

    const buttonRect = buttonEl.getBoundingClientRect();
    const menuHeight = menuEl.offsetHeight;
    const menuWidth = menuEl.offsetWidth;
    const spaceBelow = window.innerHeight - buttonRect.bottom;
    const spaceAbove = buttonRect.top;
    const spaceRight = window.innerWidth - buttonRect.left;

    // Decidir si abre hacia arriba
    openUp = spaceBelow < menuHeight + 8 && spaceAbove > menuHeight + 8;

    // Decidir si abre hacia la izquierda
    // Si el menú (con left: 0 del botón) se saldría del viewport, alinea a la derecha
    openLeft = spaceRight < menuWidth + 8;
  }

  $effect(() => {
    if (open) {
      document.addEventListener('click', handleClickOutside);
      // Verificar posición en el siguiente frame para que el menú ya esté renderizado
      requestAnimationFrame(() => checkPosition());
      return () => document.removeEventListener('click', handleClickOutside);
    }
  });
</script>

<div class="dropdown-container {className}">
  <button
    bind:this={buttonEl}
    class="dropdown-trigger"
    onclick={() => (open = !open)}
    aria-expanded={open}
  >
    <span>{label}</span>
    <span aria-hidden="true">▾</span>
  </button>

  {#if open}
    <div
      bind:this={menuEl}
      class="dropdown-menu"
      class:dropdown-menu-up={openUp}
      class:dropdown-menu-left={openLeft}
    >
      {#each items as entry}
        {#if entry.type === 'separator'}
          <div class="dropdown-separator"></div>
        {:else if entry.href}
          <a class="dropdown-item" href={entry.href} onclick={() => handleSelect(entry)}>
            {#if entry.icon}<span class="icon">{entry.icon}</span>{/if}
            <span>{entry.label}</span>
          </a>
        {:else}
          <button class="dropdown-item" onclick={() => handleSelect(entry)}>
            {#if entry.icon}<span class="icon">{entry.icon}</span>{/if}
            <span>{entry.label}</span>
          </button>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .dropdown-container {
    position: relative;
    display: inline-block;
  }

  .dropdown-trigger {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-2);
    padding: var(--spacing-2) var(--spacing-3);
    border: 1px solid currentColor;
    border-radius: var(--radius-base);
    background: transparent;
    cursor: pointer;
    font: inherit;
    color: inherit;
    transition: background var(--transition-fast);
  }

  .dropdown-trigger:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .dropdown-trigger:focus-visible {
    outline: 2px solid var(--color-primary-500);
    outline-offset: 2px;
  }

  .dropdown-menu {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: var(--z-dropdown);
    min-width: 100%;
    margin-top: var(--spacing-2);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    padding: var(--spacing-1) 0;
    white-space: nowrap;
  }

  .dropdown-menu-up {
    top: auto;
    bottom: 100%;
    margin-top: 0;
    margin-bottom: var(--spacing-2);
  }

  .dropdown-menu-left {
    left: auto;
    right: 0;
  }

  .dropdown-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    padding: var(--spacing-2) var(--spacing-3);
    background: transparent;
    border: none;
    color: var(--color-text-primary);
    cursor: pointer;
    text-decoration: none;
    font-size: var(--font-size-sm);
    text-align: left;
  }

  .dropdown-item:hover {
    background: var(--color-neutral-100);
  }

  .dropdown-item:focus-visible {
    outline: 2px solid var(--color-primary-500);
    outline-offset: -2px;
  }

  .dropdown-separator {
    height: 1px;
    background: var(--color-border);
    margin: var(--spacing-1) 0;
  }

  .icon {
    width: 1rem;
    display: inline-flex;
    justify-content: center;
  }
</style>
