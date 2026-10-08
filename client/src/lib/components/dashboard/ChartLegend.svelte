<script lang="ts">
  /** Color legend shared by the dashboard charts. */

  interface LegendItem {
    label: string;
    color: string;
  }

  interface Props {
    items: LegendItem[];
    label?: string;
  }

  let { items, label = 'Referencias' }: Props = $props();
</script>

<ul class="legend" aria-label={label}>
  {#each items as item (item.label)}
    <li class="legend-item">
      <span class="swatch" style:background={item.color}></span>
      <span>{item.label}</span>
    </li>
  {/each}
</ul>

<style>
  .legend {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-2) var(--spacing-4);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-2);
  }

  .swatch {
    width: var(--spacing-3);
    height: var(--spacing-3);
    border-radius: var(--radius-sm);
  }
</style>
