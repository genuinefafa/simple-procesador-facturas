<script lang="ts">
  import RevisionTable from '$lib/components/RevisionTable.svelte';
  export let data: {
    items: any[];
    categories: Array<{ id: number; key: string; description: string }>;
  };
  let selected: any | null = $state(null);

  async function onCategoryChange({ invoiceId, categoryId }: { invoiceId: number; categoryId: number }) {
    const res = await fetch('/api/invoices-known/category', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedId: invoiceId, categoryId }),
    });
    const out = await res.json();
    if (!out.ok) {
      alert('Error: ' + (out.error || 'unknown'));
    }
  }
</script>

<svelte:head>
  <title>Facturas - Procesador de Facturas</title>
</svelte:head>

<div class="invoices-page">
  <h1 style="margin: 0 0 1rem 0">📋 Facturas</h1>
  <RevisionTable
    invoices={data.items}
    categories={data.categories}
    selectedItem={selected}
    onSelect={(item) => (selected = item)}
    onCategoryChange={onCategoryChange}
  />
</div>

<style>
  .invoices-page {
    max-width: 1200px;
    margin: 0 auto;
  }
</style>
