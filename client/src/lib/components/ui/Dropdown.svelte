<script lang="ts">
  import { createDropdownMenu, melt } from '@melt-ui/svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    trigger?: Snippet;
    children?: Snippet;
    align?: 'start' | 'center' | 'end';
    class?: string;
  }

  let { trigger, children, align = 'start', class: className = '' }: Props = $props();

  const {
    elements: { menu, item, trigger: triggerEl },
    states: { open },
  } = createDropdownMenu({
    forceVisible: true,
    positioning: {
      placement: 'bottom-start',
      gutter: 8,
    },
  });
</script>

<div class="dropdown-container {className}">
  <div use:melt={$triggerEl}>
    {#if trigger}
      {@render trigger()}
    {/if}
  </div>

  {#if $open}
    <div use:melt={$menu} class="dropdown-menu align-{align}">
      {#if children}
        {@render children()}
      {/if}
    </div>
  {/if}
</div>

<style>
  .dropdown-container {
    position: relative;
  }

  .dropdown-menu {
    position: absolute;
    z-index: var(--z-dropdown);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    min-width: 200px;
    padding: var(--spacing-2);
    animation: slideDown var(--transition-fast);
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dropdown-menu.align-start {
    left: 0;
  }

  .dropdown-menu.align-center {
    left: 50%;
    transform: translateX(-50%);
  }

  .dropdown-menu.align-end {
    right: 0;
  }

  :global(.dropdown-item) {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
    padding: var(--spacing-3) var(--spacing-4);
    border-radius: var(--radius-base);
    cursor: pointer;
    transition: background var(--transition-fast);
    color: var(--color-text-primary);
    text-decoration: none;
    font-size: var(--font-size-sm);
    white-space: nowrap;
    width: 100%;
    border: none;
    background: transparent;
    text-align: left;
  }

  :global(.dropdown-item:hover) {
    background: var(--color-neutral-100);
  }

  :global(.dropdown-item:focus-visible) {
    outline: 2px solid var(--color-primary-500);
    outline-offset: -2px;
  }

  :global(.dropdown-separator) {
    height: 1px;
    background: var(--color-border);
    margin: var(--spacing-2) 0;
  }
</style>
