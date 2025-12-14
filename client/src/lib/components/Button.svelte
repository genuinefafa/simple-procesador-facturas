<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'primary' | 'secondary' | 'danger' | 'success';
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    onclick?: () => void;
    class?: string;
    children?: Snippet;
  }

  let {
    variant = 'primary',
    size = 'md',
    disabled = false,
    onclick,
    class: className = '',
    children,
  }: Props = $props();
</script>

<button class="btn btn-{variant} btn-{size} {className}" {disabled} {onclick}>
  {@render children?.()}
</button>

<style>
  .btn {
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-block;
    white-space: nowrap;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* VARIANTS */
  .btn-primary {
    background: #2563eb;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .btn-secondary {
    background: #f3f4f6;
    color: #374151;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #e5e7eb;
  }

  .btn-danger {
    background: #ef4444;
    color: white;
  }

  .btn-danger:hover:not(:disabled) {
    background: #dc2626;
  }

  .btn-success {
    background: #16a34a;
    color: white;
  }

  .btn-success:hover:not(:disabled) {
    background: #15803d;
  }

  /* SIZES */
  .btn-sm {
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
  }

  .btn-md {
    padding: 0.75rem 1.5rem;
    font-size: 1rem;
  }

  .btn-lg {
    padding: 1rem 2rem;
    font-size: 1.1rem;
  }
</style>
