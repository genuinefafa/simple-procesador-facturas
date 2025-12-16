<script lang="ts">
  import { PageHeader } from '$lib/components';
  import RevisionTable from '$lib/components/RevisionTable.svelte';
  let {
    data,
  }: {
    data: { items: any[]; categories: Array<{ id: number; key: string; description: string }> };
  } = $props();
  let selected: any | null = $state(null);

  async function onCategoryChange({
    invoiceId,
    categoryId,
  }: {
    invoiceId: number;
    categoryId: number;
  }) {
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

<PageHeader title="📋 Facturas" subtitle="Revisá y categorizá facturas conocidas" />

<div class="invoices-page">
  <RevisionTable
    invoices={data.items}
    categories={data.categories}
    selectedItem={selected}
    onSelect={(item: any) => (selected = item)}
    {onCategoryChange}
  />
</div>

<style>
  .invoices-page {
    max-width: 1200px;
    margin: 0 auto;
  }
</style>
