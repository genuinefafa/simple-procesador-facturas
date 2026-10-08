<script lang="ts">
  /**
   * Donut by invoice letter. A and M (VAT credit) use the primary family,
   * B and C (cost) the neutral family. Next to it, the two aggregates:
   * "IVA computable" vs "Sin crédito fiscal".
   */
  import { PieChart, Tooltip } from 'layerchart';
  import { formatCurrency } from '$lib/formatters';
  import { formatPercent, letterAggregates, type LetterSlice } from '$lib/utils/dashboard';
  import ChartTooltip from './ChartTooltip.svelte';

  interface Props {
    slices: LetterSlice[];
    onselect?: (slice: LetterSlice) => void;
  }

  let { slices, onselect }: Props = $props();

  // A donut can only draw positive shares; negative letters stay in the list
  const drawable = $derived(slices.filter((s) => s.total > 0));
  const aggregates = $derived(letterAggregates(slices));
  const sliceByLetter = $derived(new Map(slices.map((s) => [s.letter, s])));
</script>

<div class="donut">
  <div class="chart" role="img" aria-label="Totales por letra de factura">
    {#if drawable.length > 0}
      <PieChart
        data={drawable}
        key="letter"
        label="label"
        value="total"
        c="color"
        innerRadius={-32}
        padAngle={0.02}
        cornerRadius={3}
        onArcClick={(_e: MouseEvent, detail: { data: LetterSlice }) => {
          const slice = sliceByLetter.get(detail.data.letter);
          if (slice) onselect?.(slice);
        }}
      >
        {#snippet tooltip({ context })}
          <Tooltip.Root {context}>
            {#snippet children({ data }: { data: LetterSlice })}
              <ChartTooltip
                title={data.label}
                rows={[
                  {
                    label: `${data.count} comprobantes`,
                    color: data.color,
                    amount: data.total,
                    percent: data.percent,
                  },
                ]}
              />
            {/snippet}
          </Tooltip.Root>
        {/snippet}
      </PieChart>
    {:else}
      <p class="empty">Sin importes positivos para graficar.</p>
    {/if}
  </div>

  <div class="side">
    <dl class="aggregates">
      <div class="aggregate vat">
        <dt>IVA computable (A y M)</dt>
        <dd>
          {formatCurrency(aggregates.vat.total)}
          <span class="aggregate-percent">({formatPercent(aggregates.vat.percent)})</span>
        </dd>
      </div>
      <div class="aggregate cost">
        <dt>Sin crédito fiscal (B, C y otras)</dt>
        <dd>
          {formatCurrency(aggregates.noCredit.total)}
          <span class="aggregate-percent">({formatPercent(aggregates.noCredit.percent)})</span>
        </dd>
      </div>
    </dl>

    <ul class="letters" aria-label="Letras">
      {#each slices as slice (slice.letter)}
        <li>
          <button type="button" class="letter" onclick={() => onselect?.(slice)}>
            <span class="swatch" style:background={slice.color}></span>
            <span class="letter-label">{slice.label}</span>
            <span class="letter-amount">{formatCurrency(slice.total)}</span>
            <span class="letter-percent">{formatPercent(slice.percent)}</span>
          </button>
        </li>
      {/each}
    </ul>
  </div>
</div>

<style>
  .donut {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--spacing-4);
    align-items: center;
  }

  .chart {
    height: calc(var(--spacing-20) * 3);
    min-width: 0;
    cursor: pointer;
  }

  .empty {
    margin: 0;
    color: var(--color-text-tertiary);
    font-size: var(--font-size-sm);
  }

  .side {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
    min-width: 0;
  }

  .aggregates {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
  }

  .aggregate {
    padding-left: var(--spacing-3);
    border-left: var(--spacing-1) solid var(--color-neutral-400);
  }

  .aggregate.vat {
    border-left-color: var(--color-primary-600);
  }

  .aggregate dt {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .aggregate dd {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .aggregate-percent {
    color: var(--color-text-tertiary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-normal);
  }

  .letters {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
  }

  .letter {
    width: 100%;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: var(--spacing-2);
    padding: var(--spacing-1) var(--spacing-2);
    background: transparent;
    border: 0;
    border-radius: var(--radius-base);
    font: inherit;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    text-align: left;
    cursor: pointer;
  }

  .letter:hover {
    background: var(--color-surface-alt);
  }

  .swatch {
    width: var(--spacing-3);
    height: var(--spacing-3);
    border-radius: var(--radius-sm);
  }

  .letter-amount {
    color: var(--color-text-primary);
    font-weight: var(--font-weight-medium);
  }

  .letter-percent {
    min-width: 3.5rem;
    text-align: right;
    color: var(--color-text-tertiary);
  }

  @media (max-width: 960px) {
    .donut {
      grid-template-columns: 1fr;
    }
  }
</style>
