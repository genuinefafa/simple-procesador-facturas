<script lang="ts">
  export let data: {
    items: any[];
    categories: Array<{ id: number; key: string; description: string }>;
  };
  let selected: any | null = null;
  let sidebarOpen = false;
  let selectedCategoryId: number | null = null;

  function openSidebar(item: any) {
    selected = item;
    sidebarOpen = true;
    selectedCategoryId = item.categoryId ?? null;
  }
  async function saveCategory() {
    if (!selected || selected.source !== 'expected' || !selectedCategoryId) return;
    const res = await fetch('/api/invoices-known/category', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedId: selected.id, categoryId: selectedCategoryId }),
    });
    const out = await res.json();
    if (out.ok) {
      // Optimistic update
      selected.categoryId = selectedCategoryId;
      alert('Categoría asignada');
    } else {
      alert('Error: ' + (out.error || 'unknown'));
    }
  }

  function closeSidebar() {
    sidebarOpen = false;
    selected = null;
  }
</script>

<h1>Facturas conocidas</h1>
<div class="layout">
  <div>
    <table class="table">
      <thead>
        <tr>
          <th>Origen</th>
          <th>CUIT</th>
          <th>Fecha</th>
          <th>Tipo</th>
          <th>PV</th>
          <th>Número</th>
          <th>Total</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        {#each data.items as item}
          <tr>
            <td><span class="badge">{item.source}</span></td>
            <td>{item.cuit ?? item.cuit_guess ?? '-'}</td>
            <td>{item.issueDate ?? '-'}</td>
            <td>{item.invoiceType ?? '-'}</td>
            <td>{item.pointOfSale ?? '-'}</td>
            <td>{item.invoiceNumber ?? '-'}</td>
            <td>{item.total ?? '-'}</td>
            <td>
              <button on:click={() => openSidebar(item)}>Abrir</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <aside class="sidebar">
    {#if sidebarOpen && selected}
      <h2>Detalle</h2>
      <p><strong>Origen:</strong> {selected.source}</p>
      {#if selected.source === 'expected'}
        <p><strong>CUIT:</strong> {selected.cuit}</p>
        <p><strong>Fecha:</strong> {selected.issueDate}</p>
        <p>
          <strong>Comprobante:</strong>
          {selected.invoiceType}-{String(selected.pointOfSale).padStart(4, '0')}-{String(
            selected.invoiceNumber
          ).padStart(8, '0')}
        </p>
        <p><strong>Total:</strong> {selected.total ?? '-'}</p>
      {:else}
        <p><strong>Archivo:</strong> {selected.file}</p>
        <p><strong>CUIT (estimado):</strong> {selected.cuit_guess}</p>
        <p><strong>Año:</strong> {selected.year}</p>
      {/if}

      <hr />
      <h3>Categoría</h3>
      {#if selected.source === 'expected'}
        <select bind:value={selectedCategoryId}>
          <option value={null}>Sin categoría</option>
          {#each data.categories as c}
            <option value={c.id}>{c.description}</option>
          {/each}
        </select>
        <button style="margin-left:8px" on:click={saveCategory}>Asignar</button>
      {:else}
        <small>Las categorías se asignan a facturas esperadas.</small>
      {/if}

      <h3 style="margin-top:12px">Vista previa</h3>
      {#if selected.source === 'pdf'}
        <!-- TODO: render pdf preview from selected.file using pdfjs-dist -->
        <small>Preview PDF pendiente de implementación</small>
      {:else}
        <small>Asociar a un PDF no vinculado</small>
      {/if}

      <div style="margin-top:12px">
        <button on:click={closeSidebar}>Cerrar</button>
      </div>
    {:else}
      <p>Seleccioná una fila para ver detalles.</p>
    {/if}
  </aside>
</div>

<style>
  .layout {
    display: grid;
    grid-template-columns: 1fr 380px;
    gap: 16px;
  }
  .table {
    border-collapse: collapse;
    width: 100%;
  }
  .table th,
  .table td {
    border: 1px solid #ddd;
    padding: 8px;
  }
  .table th {
    background: #f5f5f5;
    text-align: left;
  }
  .sidebar {
    border: 1px solid #ddd;
    padding: 12px;
    border-radius: 8px;
  }
  .badge {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 6px;
    background: #eef;
  }
</style>
