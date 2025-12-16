<script lang="ts">
  import { dev } from '$app/environment';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  // Guard: Solo visible en desarrollo
  onMount(() => {
    if (!dev) {
      goto('/dashboard');
    }
  });
</script>

{#if dev}
  <div class="legacy-warning">
    <p>
      ⚠️ <strong>Rutas Legacy (Solo Dev)</strong> - Estas rutas están deprecadas y se mantendrán solo
      para referencia.
    </p>
  </div>
  <slot />
{/if}

<style>
  .legacy-warning {
    background: var(--color-warning-100, #fef3c7);
    border-left: 4px solid var(--color-warning-600, #d97706);
    padding: var(--spacing-4, 1rem);
    margin: var(--spacing-4, 1rem);
    border-radius: var(--border-radius-md, 0.375rem);
  }

  .legacy-warning p {
    margin: 0;
    color: var(--color-warning-900, #78350f);
  }
</style>
