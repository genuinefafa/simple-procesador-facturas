<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
    onclick?: (e: MouseEvent) => void;
    children?: Snippet;
    class?: string;
  }

  let {
    variant = 'primary',
    size = 'md',
    disabled = false,
    type = 'button',
    onclick,
    children,
    class: className = '',
  }: Props = $props();
</script>

<button
  {type}
  {disabled}
  class="btn btn-{variant} btn-{size} {className}"
  {onclick}
  aria-disabled={disabled}
>
  {#if children}
    {@render children()}
  {/if}
</button>

<style>
  .btn {
    font-family: var(--font-sans);
    font-weight: var(--font-weight-medium);
    border: none;
    border-radius: var(--radius-base);
    cursor: pointer;
    transition: all var(--transition-fast);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-2);
    text-decoration: none;
    outline: none;
    position: relative;
  }

  .btn:focus-visible {
    outline: 2px solid var(--color-primary-500);
    outline-offset: 2px;
  }

  .btn:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  /* Sizes */
  .btn-sm {
    padding: var(--spacing-2) var(--spacing-3);
    font-size: var(--font-size-sm);
    height: 32px;
  }

  .btn-md {
    padding: var(--spacing-3) var(--spacing-4);
    font-size: var(--font-size-base);
    height: 40px;
  }

  .btn-lg {
    padding: var(--spacing-4) var(--spacing-6);
    font-size: var(--font-size-lg);
    height: 48px;
  }

  /* Variants */
  .btn-primary {
    background: var(--color-primary-600);
    color: var(--color-text-inverse);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--color-primary-700);
  }

  .btn-primary:active:not(:disabled) {
    background: var(--color-primary-800);
  }

  .btn-secondary {
    background: var(--color-neutral-100);
    color: var(--color-text-primary);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--color-neutral-200);
  }

  .btn-secondary:active:not(:disabled) {
    background: var(--color-neutral-300);
  }

  .btn-ghost {
    background: transparent;
    color: var(--color-text-secondary);
  }

  .btn-ghost:hover:not(:disabled) {
    background: var(--color-neutral-100);
    color: var(--color-text-primary);
  }

  .btn-ghost:active:not(:disabled) {
    background: var(--color-neutral-200);
  }

  .btn-danger {
    background: var(--color-error);
    color: var(--color-text-inverse);
  }

  .btn-danger:hover:not(:disabled) {
    background: #dc2626;
  }

  .btn-danger:active:not(:disabled) {
    background: #b91c1c;
  }
</style>
