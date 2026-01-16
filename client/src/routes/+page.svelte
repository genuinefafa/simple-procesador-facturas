<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  // Redirigir automáticamente a /comprobantes (centro unificado)
  onMount(() => {
    goto('/comprobantes', { replaceState: true });
  });
</script>

<svelte:head>
  <title>Procesador de Facturas</title>
</svelte:head>

<div class="redirect-container">
  <p>Redirigiendo a Comprobantes...</p>
</div>

<style>
  .redirect-container {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    color: var(--color-text-secondary);
  }
</style>
