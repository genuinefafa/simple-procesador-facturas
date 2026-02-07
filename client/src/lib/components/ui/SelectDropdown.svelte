<script lang="ts">
  /**
   * SelectDropdown - Content wrapper for Melt UI Select/Combobox dropdowns.
   *
   * Provides correct CSS that does NOT conflict with Melt UI's Floating UI
   * positioning. Melt uses @floating-ui/dom to compute position/top/left
   * as inline styles, and the native Popover API (popover="manual") for
   * top-layer rendering. This wrapper only sets visual properties (background,
   * border, shadow, z-index, overflow) and leaves positioning to Floating UI.
   *
   * @example
   * ```svelte
   * <SelectDropdown contentAttrs={select.content} maxWidth="400px">
   *   {#each options as opt}
   *     <div {...select.getOption(opt.id, opt.label)}>
   *       {opt.label}
   *     </div>
   *   {/each}
   * </SelectDropdown>
   * ```
   */

  import type { Snippet } from 'svelte';

  interface Props {
    /** Melt UI builder .content attributes (from Select or Combobox) */
    contentAttrs: Record<string, unknown>;
    /** Options to render inside the dropdown */
    children: Snippet;
    /** Maximum width of the dropdown */
    maxWidth?: string;
    /** Maximum height of the dropdown. Default: '250px' */
    maxHeight?: string;
    /** Additional CSS class for the dropdown container */
    class?: string;
  }

  let {
    contentAttrs,
    children,
    maxWidth,
    maxHeight = '250px',
    class: className = '',
  }: Props = $props();
</script>

<div
  {...contentAttrs}
  class="select-dropdown {className}"
  style:max-width={maxWidth}
  style:max-height={maxHeight}
>
  {@render children()}
</div>

<style>
  .select-dropdown {
    /* Visual — Floating UI never touches these properties */
    z-index: var(--z-dropdown);
    min-width: var(--melt-invoker-width);
    width: fit-content;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    overflow-y: auto;
    padding: var(--spacing-1);
  }

  /*
   * Do NOT set: position, top, left, right, bottom, margin, inset, transform
   * Floating UI (via useFloating) computes and applies these as inline styles.
   * The Popover API renders the element in the top layer — no need for
   * position: relative on the parent.
   */
</style>
