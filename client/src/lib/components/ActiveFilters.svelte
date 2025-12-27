<script lang="ts">
  import type { FilterNode } from '$lib/search';

  let {
    filters = [],
    onremove,
  }: {
    filters: FilterNode[];
    onremove: (filter: FilterNode) => void;
  } = $props();

  function formatFilter(filter: FilterNode): string {
    const prefix = filter.negate ? 'NOT ' : '';

    switch (filter.type) {
      case 'emisor':
        return `${prefix}Emisor: ${filter.value}`;

      case 'fecha':
        return `${prefix}Fecha: ${formatDateFilter(filter)}`;

      case 'categoria':
        return filter.value === null
          ? `${prefix}Sin categoría`
          : `${prefix}Categoría: ${filter.value}`;

      case 'numero':
        return `${prefix}Número: ${filter.value}`;

      case 'total':
        return `${prefix}Total: ${formatTotalFilter(filter)}`;

      case 'tipo':
        return `${prefix}Tipo: ${filter.value}`;

      case 'freetext':
        return `${prefix}"${filter.value}"`;

      default:
        return '';
    }
  }

  function formatDateFilter(filter: FilterNode & { type: 'fecha' }): string {
    if (
      filter.operator === 'range' &&
      typeof filter.value === 'object' &&
      'start' in filter.value
    ) {
      const start = formatDate(filter.value.start);
      const end = formatDate(filter.value.end);
      return `${start} ... ${end}`;
    }

    if (filter.value instanceof Date) {
      const dateStr = formatDate(filter.value);
      const op =
        filter.operator === 'eq'
          ? ''
          : filter.operator === 'gte' || filter.operator === 'gt'
            ? '> '
            : '< ';
      return `${op}${dateStr}`;
    }

    return '';
  }

  function formatTotalFilter(filter: FilterNode & { type: 'total' }): string {
    if (filter.operator === 'range' && typeof filter.value === 'object' && 'min' in filter.value) {
      return `$${filter.value.min} ... $${filter.value.max}`;
    }

    if (typeof filter.value === 'number') {
      const op =
        filter.operator === 'eq'
          ? ''
          : filter.operator === 'gte' || filter.operator === 'gt'
            ? '> '
            : '< ';
      return `${op}$${filter.value}`;
    }

    return '';
  }

  function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
</script>

{#if filters.length > 0}
  <div class="active-filters">
    {#each filters as filter}
      <button
        class="filter-pill"
        class:negated={filter.negate}
        onclick={() => onremove(filter)}
        type="button"
        aria-label={`Remover filtro: ${formatFilter(filter)}`}
      >
        <span class="filter-label">{formatFilter(filter)}</span>
        <span class="remove-icon">✕</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .active-filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-2);
    align-items: center;
  }

  .filter-pill {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-2);
    padding: var(--spacing-1) var(--spacing-3);
    border: 1px solid var(--color-primary-300);
    border-radius: var(--radius-full);
    background: var(--color-primary-50);
    color: var(--color-primary-700);
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-base);
    white-space: nowrap;
  }

  .filter-pill:hover {
    background: var(--color-primary-100);
    border-color: var(--color-primary-400);
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .filter-pill.negated {
    background: #fef2f2;
    border-color: #fecaca;
    color: #dc2626;
  }

  .filter-pill.negated:hover {
    background: #fee2e2;
    border-color: #fca5a5;
  }

  .filter-label {
    flex: 1;
  }

  .remove-icon {
    font-size: 16px;
    opacity: 0.7;
    transition: opacity var(--transition-fast);
  }

  .filter-pill:hover .remove-icon {
    opacity: 1;
  }

  .filter-pill:focus-visible {
    outline: 2px solid var(--color-primary-500);
    outline-offset: 2px;
  }
</style>
