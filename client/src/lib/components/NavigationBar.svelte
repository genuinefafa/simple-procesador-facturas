<script lang="ts">
  /**
   * Navigation bar for comprobante detail view.
   *
   * Supports dependency injection for navigation callbacks (Dependency Inversion Principle).
   * If callbacks are not provided, uses default SvelteKit navigation.
   */

  import { goto } from '$app/navigation';
  import { navigationStore } from '$lib/stores/navigation';

  type Props = {
    /** ID actual del comprobante (ej: "factura:123") */
    currentId: string;
    /** Título a mostrar en el centro (ej: "FACB 0007-00000640") */
    title: string;
    /** Fecha del comprobante (se muestra al lado del título) */
    date?: string;
    /** Nombre del emisor */
    emitterName?: string;
    /** CUIT del emisor (se muestra al lado del nombre) */
    cuit?: string;
    /**
     * Optional callback for navigation. If provided, component delegates navigation to parent.
     * Receives the target ID (or null for list view).
     * If not provided, uses default goto('/comprobantes/...')
     */
    onnavigate?: (targetId: string | null) => void;
  };

  let { currentId, title, date, emitterName, cuit, onnavigate }: Props = $props();

  // Internal navigation helper - uses callback if provided, otherwise default goto
  function navigate(targetId: string | null) {
    if (onnavigate) {
      onnavigate(targetId);
    } else if (targetId === null) {
      goto('/comprobantes');
    } else {
      goto(`/comprobantes/${targetId}`);
    }
  }

  // Derivar navegación reactivamente cuando cambia currentId
  const nav = $derived.by(() => {
    const ctx = $navigationStore;
    const index = ctx.ids.indexOf(currentId);
    const hasContext = index >= 0;

    return {
      hasContext,
      previous: hasContext && index > 0 ? ctx.ids[index - 1] : null,
      next: hasContext && index < ctx.ids.length - 1 ? ctx.ids[index + 1] : null,
      position: hasContext ? { current: index + 1, total: ctx.ids.length } : null,
      filter: ctx.filter,
    };
  });

  function goToPrevious() {
    if (nav.previous) {
      navigate(nav.previous);
    }
  }

  function goToNext() {
    if (nav.next) {
      navigate(nav.next);
    }
  }

  function goToList() {
    navigate(null);
  }

  // Keyboard shortcuts - usar $effect para que se actualice cuando cambia nav
  $effect(() => {
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

      // Capturar valores actuales de nav
      const { previous, next } = nav;

      if (e.key === 'ArrowLeft' || e.key === 'j') {
        if (previous) {
          e.preventDefault();
          navigate(previous);
        }
      } else if (e.key === 'ArrowRight' || e.key === 'k') {
        if (next) {
          e.preventDefault();
          navigate(next);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        navigate(null);
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });
</script>

<nav class="navigation-bar">
  <div class="nav-left">
    {#if nav.hasContext}
      <button
        type="button"
        class="nav-btn"
        disabled={!nav.previous}
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
    <h1 class="nav-title">
      {title}
      {#if date}
        <span class="nav-date">({date})</span>
      {/if}
    </h1>
    {#if emitterName || cuit}
      <p class="nav-subtitle">
        {emitterName || ''}
        {#if cuit}
          <span class="nav-cuit">({cuit})</span>
        {/if}
      </p>
    {/if}
    {#if nav.position}
      <button
        type="button"
        class="nav-position-link"
        onclick={goToList}
        title="Volver al listado (Esc)"
      >
        ← Lista · {nav.position.current} de {nav.position.total}
      </button>
    {/if}
  </div>

  <div class="nav-right">
    {#if nav.hasContext}
      <button
        type="button"
        class="nav-btn"
        disabled={!nav.next}
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

  .nav-date {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-normal);
    color: var(--color-text-secondary);
  }

  .nav-subtitle {
    margin: var(--spacing-1) 0 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .nav-cuit {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }

  .nav-position-link {
    margin: var(--spacing-1) 0 0;
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    background: none;
    border: none;
    cursor: pointer;
    padding: var(--spacing-1) var(--spacing-2);
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
  }

  .nav-position-link:hover {
    color: var(--color-primary-700);
    background: var(--color-primary-50);
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
