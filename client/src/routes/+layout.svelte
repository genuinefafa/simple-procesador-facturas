<script lang="ts">
  let { children } = $props();
</script>

<nav style="display:flex; gap:12px; align-items:center; padding:8px 12px; border-bottom:1px solid #eee;">
  <a href="/" style="font-weight:600">Inicio</a>
  <div style="margin-left:auto; display:flex; gap:12px;">
    <a href="/invoices">Facturas</a>
  </div>
  
</nav>

<main style="padding:12px;">
  {@render children()}
</main>
