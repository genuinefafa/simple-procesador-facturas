<script lang="ts">
  interface Props {
    title: string;
    subtitle?: string;
  }

  let { title, subtitle }: Props = $props();
</script>

<div class="page-header">
  <h1>{title}</h1>
  {#if subtitle}
    <p class="subtitle">{subtitle}</p>
  {/if}
</div>

<style>
  .page-header {
    margin-bottom: 2rem;
    text-align: center;
  }

  .page-header h1 {
    margin: 0 0 0.5rem 0;
    font-size: 2rem;
  }

  .subtitle {
    margin: 0;
    color: #666;
    font-size: 1rem;
  }
</style>
