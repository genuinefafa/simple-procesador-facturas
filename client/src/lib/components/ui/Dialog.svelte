<script lang="ts">
  import { Dialog as MeltDialog } from 'melt/builders';
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

  const dialog = new MeltDialog({
    open: () => open,
    closeOnOutsideClick: () => closeOnOutsideClick,
    closeOnEscape: true,
    scrollLock: true,
    onOpenChange: (value) => {
      open = value;
      onOpenChange?.(value);
    },
  });

  function handleClose() {
    open = false;
    onOpenChange?.(false);
  }
</script>

{#if open}
  <div class="dialog-overlay" {...dialog.overlay}></div>
  <dialog {...dialog.content} class="dialog-content">
    {#if title}
      <h2 class="dialog-title">{title}</h2>
    {/if}

    {#if description}
      <p class="dialog-description">{description}</p>
    {/if}

    <div class="dialog-body">
      {#if children}
        {@render children()}
      {/if}
    </div>

    <button class="dialog-close" aria-label="Cerrar" onclick={handleClose}>
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
  </dialog>
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
    border: none;
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xl);
    padding: var(--spacing-6);
    max-width: 90vw;
    max-height: 90vh;
    width: 500px;
    overflow-y: auto;
    animation: slideIn var(--transition-base);
  }

  .dialog-content::backdrop {
    display: none;
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
