<script lang="ts">
  interface Props {
    value?: string;
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    type?: 'text' | 'email' | 'password' | 'number' | 'search' | 'tel' | 'url';
    id?: string;
    name?: string;
    label?: string;
    error?: string;
    hint?: string;
    class?: string;
    oninput?: (e: Event) => void;
    onchange?: (e: Event) => void;
  }

  let {
    value = $bindable(''),
    placeholder = '',
    disabled = false,
    required = false,
    type = 'text',
    id,
    name,
    label,
    error,
    hint,
    class: className = '',
    oninput,
    onchange,
  }: Props = $props();

  const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
  const hasError = $derived(!!error);
</script>

<div class="input-wrapper {className}">
  {#if label}
    <label for={inputId} class="input-label">
      {label}
      {#if required}
        <span class="required" aria-label="requerido">*</span>
      {/if}
    </label>
  {/if}

  <input
    {type}
    {name}
    {placeholder}
    {disabled}
    {required}
    id={inputId}
    class="input"
    class:error={hasError}
    bind:value
    {oninput}
    {onchange}
    aria-invalid={hasError}
    aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
  />

  {#if error}
    <p id="{inputId}-error" class="input-message error-message" role="alert">
      {error}
    </p>
  {:else if hint}
    <p id="{inputId}-hint" class="input-message hint-message">
      {hint}
    </p>
  {/if}
</div>

<style>
  .input-wrapper {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
    width: 100%;
  }

  .input-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
    display: flex;
    align-items: center;
    gap: var(--spacing-1);
  }

  .required {
    color: var(--color-error);
  }

  .input {
    width: 100%;
    padding: var(--spacing-3) var(--spacing-4);
    font-size: var(--font-size-base);
    font-family: var(--font-sans);
    line-height: var(--line-height-normal);
    color: var(--color-text-primary);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    transition: all var(--transition-fast);
    outline: none;
  }

  .input::placeholder {
    color: var(--color-text-tertiary);
  }

  .input:hover:not(:disabled) {
    border-color: var(--color-neutral-400);
  }

  .input:focus {
    border-color: var(--color-primary-500);
    box-shadow: 0 0 0 3px rgb(59 130 246 / 0.1);
  }

  .input:disabled {
    background: var(--color-neutral-100);
    cursor: not-allowed;
    opacity: 0.6;
  }

  .input.error {
    border-color: var(--color-error);
  }

  .input.error:focus {
    border-color: var(--color-error);
    box-shadow: 0 0 0 3px rgb(239 68 68 / 0.1);
  }

  .input-message {
    font-size: var(--font-size-sm);
    margin: 0;
  }

  .hint-message {
    color: var(--color-text-tertiary);
  }

  .error-message {
    color: var(--color-error);
  }
</style>
