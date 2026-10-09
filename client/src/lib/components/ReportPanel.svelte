<script lang="ts">
  import type { Snippet } from 'svelte';
  import { X } from '$lib/components/icons';

  /**
   * Shared infobar container for import reports. Inner pieces (summary-item,
   * section, file-list, filename, link-button) are styled via :global under
   * .report-panel so parents can provide plain markup through the children snippet.
   */
  interface Props {
    title: string;
    icon?: Snippet;
    onClose?: () => void;
    children: Snippet;
  }

  let { title, icon, onClose, children }: Props = $props();
</script>

<div class="report-panel">
  <div class="report-header">
    <h3>
      {#if icon}{@render icon()}{/if}
      {title}
    </h3>
    {#if onClose}
      <button class="close-btn" onclick={onClose} aria-label="Cerrar">
        <X size={18} />
      </button>
    {/if}
  </div>

  {@render children()}
</div>

<style>
  .report-panel {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-6);
    margin-bottom: var(--spacing-6);
    box-shadow: var(--shadow-md);
  }

  .report-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-4);
    padding-bottom: var(--spacing-3);
    border-bottom: 1px solid var(--color-border);
  }

  .report-header h3 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
  }

  .close-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-text-secondary);
    padding: 0;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    transition: background-color 0.2s;
  }

  .close-btn:hover {
    background-color: var(--color-border);
  }

  .report-panel :global(.summary) {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
    margin-bottom: var(--spacing-6);
  }

  .report-panel :global(.summary-item) {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--spacing-2);
    padding: var(--spacing-2);
    border-radius: var(--radius-sm);
    font-weight: var(--font-weight-medium);
  }

  .report-panel :global(.summary-item.success) {
    background-color: color-mix(in srgb, var(--color-success) 12%, transparent);
    color: var(--color-text-primary);
  }

  .report-panel :global(.summary-item.warning) {
    background-color: color-mix(in srgb, var(--color-warning) 14%, transparent);
    color: var(--color-text-primary);
  }

  .report-panel :global(.summary-item.error) {
    background-color: color-mix(in srgb, var(--color-error) 12%, transparent);
    color: var(--color-text-primary);
  }

  .report-panel :global(.summary-item.info) {
    background-color: color-mix(in srgb, var(--color-info) 12%, transparent);
    color: var(--color-text-primary);
  }

  .report-panel :global(.summary-item.loading) {
    background-color: var(--color-surface-alt);
    color: var(--color-text-secondary);
  }

  .report-panel :global(.summary-item.success .icon) {
    color: var(--color-success);
  }

  .report-panel :global(.summary-item.warning .icon) {
    color: var(--color-warning);
  }

  .report-panel :global(.summary-item.error .icon) {
    color: var(--color-error);
  }

  .report-panel :global(.summary-item.info .icon) {
    color: var(--color-info);
  }

  .report-panel :global(.summary-item .icon) {
    display: flex;
    align-items: center;
  }

  .report-panel :global(.section) {
    margin-top: var(--spacing-6);
  }

  .report-panel :global(.section h4) {
    margin: 0 0 var(--spacing-3) 0;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-secondary);
  }

  .report-panel :global(.file-list) {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  .report-panel :global(.file-list li) {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    padding: var(--spacing-1) var(--spacing-2);
    font-size: var(--font-size-sm);
    border-left: 3px solid transparent;
  }

  .report-panel :global(.file-list li.duplicate-item) {
    background-color: color-mix(in srgb, var(--color-warning) 12%, transparent);
    border-left-color: var(--color-warning);
  }

  .report-panel :global(.file-list li.success-item) {
    background-color: color-mix(in srgb, var(--color-success) 12%, transparent);
    border-left-color: var(--color-success);
  }

  .report-panel :global(.file-list li.error-item) {
    background-color: color-mix(in srgb, var(--color-error) 12%, transparent);
    border-left-color: var(--color-error);
  }

  .report-panel :global(.filename) {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--color-text-primary);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .report-panel :global(.arrow) {
    color: var(--color-text-secondary);
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  .report-panel :global(.link-button) {
    background: none;
    border: none;
    color: var(--color-info);
    cursor: pointer;
    text-decoration: underline;
    font-family: inherit;
    font-size: inherit;
    padding: 0;
  }

  .report-panel :global(.link-button:hover:not(:disabled)) {
    color: var(--color-primary-700);
  }

  .report-panel :global(.link-button:disabled) {
    color: var(--color-text-secondary);
    text-decoration: none;
    cursor: default;
  }

  .report-panel :global(.file-list .link-button) {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
  }

  .report-panel :global(.hash) {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    margin-left: auto;
  }

  .report-panel :global(.duplicate-info) {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .report-panel :global(.error-message) {
    font-size: var(--font-size-sm);
    color: var(--color-error);
  }
</style>
