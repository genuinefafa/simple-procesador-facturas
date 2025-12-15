<script lang="ts">
  import { createDialog, melt } from '@melt-ui/svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    open?: boolean;
    title?: string;
    description?: string;
    children?: Snippet;
    onOpenChange?: (open: boolean) => void;
    closeOnOutsideClick?: boolean;
  }

  let {
    open = $bindable(false),
    title,
    description,
    children,
    onOpenChange,
    closeOnOutsideClick = true,
  }: Props = $props();

  const {
    elements: { trigger, overlay, content, title: titleEl, description: descEl, close, portalled },
    states: { open: openState },
  } = createDialog({
    forceVisible: true,
    closeOnOutsideClick,
    escapeBehavior: 'close',
    onOpenChange: ({ next }) => {
      open = next;
      onOpenChange?.(next);
      return next;
    },
  });

  $effect(() => {
    openState.set(open);
  });
</script>

{#if open}
  <div use:melt={$portalled}>
    <div use:melt={$overlay} class="dialog-overlay"></div>
    <div use:melt={$content} class="dialog-content">
      {#if title}
        <h2 use:melt={$titleEl} class="dialog-title">{title}</h2>
      {/if}

      {#if description}
        <p use:melt={$descEl} class="dialog-description">{description}</p>
      {/if}

      <div class="dialog-body">
        {#if children}
          {@render children()}
        {/if}
      </div>

      <button use:melt={$close} class="dialog-close" aria-label="Cerrar">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  </div>
{/if}

<style>
  .dialog-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal-backdrop);
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
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

  .dialog-content {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: var(--z-modal);
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xl);
    padding: var(--spacing-6);
    max-width: 90vw;
    max-height: 90vh;
    width: 500px;
    overflow-y: auto;
    animation: slideIn var(--transition-base);
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translate(-50%, -48%);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%);
    }
  }

  .dialog-title {
    margin: 0 0 var(--spacing-2) 0;
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    line-height: var(--line-height-tight);
  }

  .dialog-description {
    margin: 0 0 var(--spacing-4) 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    line-height: var(--line-height-normal);
  }

  .dialog-body {
    color: var(--color-text-primary);
  }

  .dialog-close {
    position: absolute;
    top: var(--spacing-4);
    right: var(--spacing-4);
    background: transparent;
    border: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    padding: var(--spacing-2);
    border-radius: var(--radius-base);
    transition: all var(--transition-fast);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dialog-close:hover {
    background: var(--color-neutral-100);
    color: var(--color-text-primary);
  }

  .dialog-close:focus-visible {
    outline: 2px solid var(--color-primary-500);
    outline-offset: 2px;
  }

  @media (max-width: 640px) {
    .dialog-content {
      width: 95vw;
      padding: var(--spacing-4);
    }
  }
</style>
