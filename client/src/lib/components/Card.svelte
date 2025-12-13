<script lang="ts">
  interface Props {
    class?: string;
  }

  let { class: className = '' }: Props = $props();
</script>

<div class="card {className}">
  <slot />
</div>

<style>
  .card {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    border: 2px solid #e5e7eb;
  }

  .card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
</style>
