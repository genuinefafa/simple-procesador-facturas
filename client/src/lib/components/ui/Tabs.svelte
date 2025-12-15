<script lang="ts">
  import { Tabs as MeltTabs } from 'melt/builders';
  import type { Snippet } from 'svelte';

  interface Tab {
    value: string;
    label: string;
    content?: Snippet;
    disabled?: boolean;
  }

  interface Props {
    tabs: Tab[];
    value?: string;
    onValueChange?: (value: string) => void;
    class?: string;
  }

  let {
    tabs,
    value = $bindable(tabs[0]?.value),
    onValueChange,
    class: className = '',
  }: Props = $props();

  const tabsBuilder = new MeltTabs({
    value: () => value,
    onValueChange: (newValue) => {
      value = newValue;
      onValueChange?.(newValue);
    },
  });
</script>

<div class="tabs-root {className}">
  <div {...tabsBuilder.triggerList} class="tabs-list">
    {#each tabs as tab}
      <button
        {...tabsBuilder.getTrigger(tab.value)}
        class="tab-trigger"
        class:active={tabsBuilder.value === tab.value}
        disabled={tab.disabled}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  {#each tabs as tab}
    <div {...tabsBuilder.getContent(tab.value)} class="tab-content">
      {#if tab.content}
        {@render tab.content()}
      {/if}
    </div>
  {/each}
</div>

<style>
  .tabs-root {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .tabs-list {
    display: flex;
    gap: var(--spacing-1);
    border-bottom: 1px solid var(--color-border);
    padding: 0;
    margin: 0;
    overflow-x: auto;
  }

  .tab-trigger {
    flex-shrink: 0;
    padding: var(--spacing-3) var(--spacing-4);
    font-family: var(--font-sans);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: all var(--transition-fast);
    position: relative;
    white-space: nowrap;
  }

  .tab-trigger:hover:not(:disabled) {
    color: var(--color-text-primary);
    background: var(--color-neutral-50);
  }

  .tab-trigger:focus-visible {
    outline: 2px solid var(--color-primary-500);
    outline-offset: -2px;
    border-radius: var(--radius-sm);
  }

  .tab-trigger.active {
    color: var(--color-primary-600);
    border-bottom-color: var(--color-primary-600);
    font-weight: var(--font-weight-semibold);
  }

  .tab-trigger:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .tab-content {
    padding: var(--spacing-4) 0;
    animation: fadeIn var(--transition-fast);
  }

  .tab-content:focus-visible {
    outline: 2px solid var(--color-primary-500);
    outline-offset: 2px;
    border-radius: var(--radius-base);
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Scrollbar styles for horizontal scroll */
  .tabs-list::-webkit-scrollbar {
    height: 4px;
  }

  .tabs-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .tabs-list::-webkit-scrollbar-thumb {
    background: var(--color-neutral-300);
    border-radius: var(--radius-full);
  }

  .tabs-list::-webkit-scrollbar-thumb:hover {
    background: var(--color-neutral-400);
  }
</style>
