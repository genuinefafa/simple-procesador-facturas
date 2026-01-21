<script lang="ts">
  import { goto } from '$app/navigation';
  import { useNavigation } from '$lib/stores/navigation';
  import { onMount } from 'svelte';

  type Props = {
    /** ID actual del comprobante (ej: "factura:123") */
    currentId: string;
    /** Título a mostrar en el centro */
    title: string;
    /** Subtítulo opcional (ej: emisor) */
    subtitle?: string;
  };

  let { currentId, title, subtitle }: Props = $props();

  const nav = useNavigation(currentId);

  function goToPrevious() {
    if ($nav.previous) {
      goto(`/comprobantes/${$nav.previous}`);
    }
  }

  function goToNext() {
    if ($nav.next) {
      goto(`/comprobantes/${$nav.next}`);
    }
  }

  function goToList() {
    goto('/comprobantes');
  }

  // Keyboard shortcuts
  onMount(() => {
    function handleKeydown(e: KeyboardEvent) {
      // Ignorar si está en un input/textarea/select
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      ) {
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'j') {
        if ($nav.previous) {
          e.preventDefault();
          goToPrevious();
        }
      } else if (e.key === 'ArrowRight' || e.key === 'k') {
        if ($nav.next) {
          e.preventDefault();
          goToNext();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        goToList();
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });
</script>

<nav class="navigation-bar">
  <div class="nav-left">
    {#if $nav.hasContext}
      <button
        type="button"
        class="nav-btn"
        disabled={!$nav.previous}
        onclick={goToPrevious}
        title="Anterior (← o j)"
      >
        <span class="nav-icon">←</span>
        <span class="nav-label">Anterior</span>
      </button>
    {:else}
      <button
        type="button"
        class="nav-btn back-btn"
        onclick={goToList}
        title="Volver al listado (Esc)"
      >
        <span class="nav-icon">←</span>
        <span class="nav-label">Volver</span>
      </button>
    {/if}
  </div>

  <div class="nav-center">
    <h1 class="nav-title">{title}</h1>
    {#if subtitle}
      <p class="nav-subtitle">{subtitle}</p>
    {/if}
    {#if $nav.position}
      <p class="nav-position">{$nav.position.current} de {$nav.position.total}</p>
    {/if}
  </div>

  <div class="nav-right">
    {#if $nav.hasContext}
      <button
        type="button"
        class="nav-btn"
        disabled={!$nav.next}
        onclick={goToNext}
        title="Siguiente (→ o k)"
      >
        <span class="nav-label">Siguiente</span>
        <span class="nav-icon">→</span>
      </button>
    {:else}
      <!-- Placeholder para mantener el layout centrado -->
      <div class="nav-placeholder"></div>
    {/if}
  </div>
</nav>

<style>
  .navigation-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-3) var(--spacing-4);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    margin-bottom: var(--spacing-4);
  }

  .nav-left,
  .nav-right {
    flex: 0 0 auto;
    min-width: 120px;
  }

  .nav-right {
    display: flex;
    justify-content: flex-end;
  }

  .nav-center {
    flex: 1;
    text-align: center;
    min-width: 0;
  }

  .nav-title {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .nav-subtitle {
    margin: var(--spacing-1) 0 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .nav-position {
    margin: var(--spacing-1) 0 0;
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }

  .nav-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-1);
    padding: var(--spacing-2) var(--spacing-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .nav-btn:hover:not(:disabled) {
    border-color: var(--color-primary-300);
    color: var(--color-primary-700);
    background: var(--color-primary-50);
  }

  .nav-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .nav-btn.back-btn {
    border-color: var(--color-primary-200);
    background: var(--color-primary-50);
    color: var(--color-primary-700);
  }

  .nav-btn.back-btn:hover {
    background: var(--color-primary-100);
  }

  .nav-icon {
    font-size: var(--font-size-base);
  }

  .nav-placeholder {
    width: 120px;
  }

  /* Responsive */
  @media (max-width: 640px) {
    .nav-label {
      display: none;
    }

    .nav-left,
    .nav-right {
      min-width: auto;
    }

    .nav-placeholder {
      width: 40px;
    }
  }
</style>
