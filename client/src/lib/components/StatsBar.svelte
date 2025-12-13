<script lang="ts">
  interface Stat {
    value: number;
    label: string;
  }

  interface Props {
    stats: Stat[];
  }

  let { stats }: Props = $props();
</script>

<div class="stats-bar">
  {#each stats as stat}
    <div class="stat">
      <span class="stat-value">{stat.value}</span>
      <span class="stat-label">{stat.label}</span>
    </div>
  {/each}
</div>

<style>
  .stats-bar {
    display: flex;
    gap: 1.5rem;
    justify-content: center;
    flex-wrap: wrap;
  }

  .stat {
    background: white;
    padding: 1.5rem 2rem;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    text-align: center;
    min-width: 120px;
  }

  .stat-value {
    display: block;
    font-size: 2.5rem;
    font-weight: bold;
    color: #2563eb;
  }

  .stat-label {
    display: block;
    font-size: 0.9rem;
    color: #666;
    margin-top: 0.5rem;
  }
</style>
