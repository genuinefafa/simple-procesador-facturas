<script lang="ts">
  import { Button, Input, Dialog, Tabs, Dropdown } from '$lib/components/ui';
  import CategorySelect from '$lib/components/CategorySelect.svelte';

  // State
  let dialogOpen = $state(false);
  let inputValue = $state('');
  let emailValue = $state('');
  let emailError = $state('');
  let activeTab = $state('button');

  // CategorySelect demo state
  const demoCategories = [
    { id: 1, description: 'Servicios', color: '#3b82f6' },
    { id: 2, description: 'Productos', color: '#10b981' },
    { id: 3, description: 'Impuestos', color: '#f59e0b' },
    { id: 4, description: 'Otros', color: '#8b5cf6' },
  ];
  let categoryA = $state<number | null>(null);
  let categoryB = $state<number | null>(2);
  let categoryLogs = $state<string[]>([]);

  function logCategory(msg: string) {
    const time = new Date().toLocaleTimeString();
    categoryLogs = [`[${time}] ${msg}`, ...categoryLogs.slice(0, 9)];
  }

  // Handlers
  function handleButtonClick() {
    alert('¡Botón clickeado!');
  }

  function validateEmail() {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailValue && !emailRegex.test(emailValue)) {
      emailError = 'Email inválido';
    } else {
      emailError = '';
    }
  }

  const demoTabs = [
    { value: 'button', label: 'Button' },
    { value: 'input', label: 'Input' },
    { value: 'dialog', label: 'Dialog' },
    { value: 'dropdown', label: 'Dropdown' },
    { value: 'category-select', label: 'CategorySelect' },
  ];

  const dropdownItems = [
    { label: 'Perfil', icon: '👤', onSelect: () => alert('Perfil') },
    { label: 'Configuración', icon: '⚙️', onSelect: () => alert('Configuración') },
    { type: 'separator' } as const,
    { label: 'Cerrar sesión', icon: '🚪', onSelect: () => alert('Cerrar sesión') },
  ];
</script>

<svelte:head>
  <title>UI Components Demo - Melt UI</title>
</svelte:head>

<div class="demo-container">
  <header class="demo-header">
    <h1>🎨 UI Components Demo</h1>
    <p>Componentes primitivos construidos con Melt UI y CSS custom</p>
  </header>

  <Tabs tabs={demoTabs} bind:value={activeTab} />

  <div class="demo-content">
    {#if activeTab === 'button'}
      <section class="demo-section">
        <h2>Button Component</h2>
        <p class="section-description">Botones accesibles con múltiples variantes y tamaños.</p>

        <div class="demo-grid">
          <div class="demo-item">
            <h3>Variantes</h3>
            <div class="button-group">
              <Button variant="primary" onclick={handleButtonClick}>Primary</Button>
              <Button variant="secondary" onclick={handleButtonClick}>Secondary</Button>
              <Button variant="ghost" onclick={handleButtonClick}>Ghost</Button>
              <Button variant="danger" onclick={handleButtonClick}>Danger</Button>
            </div>
          </div>

          <div class="demo-item">
            <h3>Tamaños</h3>
            <div class="button-group">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </div>
          </div>

          <div class="demo-item">
            <h3>Estados</h3>
            <div class="button-group">
              <Button>Normal</Button>
              <Button disabled>Disabled</Button>
            </div>
          </div>
        </div>

        <div class="code-example">
          <h4>Ejemplo de código:</h4>
          <pre><code
              >&lt;Button variant="primary" onclick=&#123;handleClick&#125;&gt;
  Guardar
&lt;/Button&gt;</code
            ></pre>
        </div>
      </section>
    {:else if activeTab === 'input'}
      <section class="demo-section">
        <h2>Input Component</h2>
        <p class="section-description">
          Campos de entrada con labels, validación y mensajes de error.
        </p>

        <div class="demo-grid">
          <div class="demo-item">
            <h3>Input básico</h3>
            <Input
              bind:value={inputValue}
              label="Nombre"
              placeholder="Ingresa tu nombre"
              hint="Este campo es opcional"
            />
            <p class="value-display">Valor: {inputValue || '(vacío)'}</p>
          </div>

          <div class="demo-item">
            <h3>Input con validación</h3>
            <Input
              bind:value={emailValue}
              label="Email"
              type="email"
              placeholder="tu@email.com"
              required
              error={emailError}
              onchange={validateEmail}
            />
          </div>

          <div class="demo-item">
            <h3>Input disabled</h3>
            <Input value="No editable" label="Campo bloqueado" disabled />
          </div>
        </div>

        <div class="code-example">
          <h4>Ejemplo de código:</h4>
          <pre><code
              >&lt;Input
  bind:value=&#123;email&#125;
  label="Email"
  type="email"
  required
  error=&#123;emailError&#125;
/&gt;</code
            ></pre>
        </div>
      </section>
    {:else if activeTab === 'dialog'}
      <section class="demo-section">
        <h2>Dialog Component</h2>
        <p class="section-description">
          Modal accesible con focus trap, navegación por teclado y overlay.
        </p>

        <div class="demo-item">
          <h3>Demo Dialog</h3>
          <p>Click en el botón para abrir el modal. Puedes cerrarlo con ESC o clickeando fuera.</p>
          <Button onclick={() => (dialogOpen = true)}>Abrir Dialog</Button>

          <Dialog
            bind:open={dialogOpen}
            title="Ejemplo de Dialog"
            description="Este es un modal accesible construido con Melt UI"
          >
            <div class="dialog-demo-content">
              <p>Este dialog incluye:</p>
              <ul>
                <li>✅ Focus trap automático</li>
                <li>✅ Cerrar con ESC</li>
                <li>✅ Cerrar con click fuera</li>
                <li>✅ ARIA completo</li>
                <li>✅ Animaciones suaves</li>
              </ul>

              <div style="margin-top: var(--spacing-6);">
                <Input label="Prueba el focus" placeholder="El foco está atrapado aquí" />
              </div>

              <div style="margin-top: var(--spacing-6); display: flex; gap: var(--spacing-3);">
                <Button variant="primary" onclick={() => (dialogOpen = false)}>Confirmar</Button>
                <Button variant="secondary" onclick={() => (dialogOpen = false)}>Cancelar</Button>
              </div>
            </div>
          </Dialog>
        </div>

        <div class="code-example">
          <h4>Ejemplo de código:</h4>
          <pre><code
              >&lt;Dialog
  bind:open=&#123;dialogOpen&#125;
  title="Mi Dialog"
  description="Descripción del dialog"
&gt;
  &lt;p&gt;Contenido del dialog&lt;/p&gt;
&lt;/Dialog&gt;</code
            ></pre>
        </div>
      </section>
    {:else if activeTab === 'dropdown'}
      <section class="demo-section">
        <h2>Dropdown Component</h2>
        <p class="section-description">
          Menú dropdown accesible con posicionamiento inteligente y navegación por teclado.
        </p>

        <div class="demo-item">
          <h3>Demo Dropdown</h3>
          <Dropdown label="Opciones" items={dropdownItems} />
        </div>

        <div class="code-example">
          <h4>Ejemplo de código:</h4>
          <pre><code
              >&lt;Dropdown
  label="Opciones"
  items=&#123;[
    &#123; label: 'Perfil' &#125;,
    &#123; label: 'Configuración' &#125;,
    &#123; type: 'separator' &#125;,
    &#123; label: 'Cerrar sesión' &#125;,
  ]&#125;
/&gt;</code
            ></pre>
        </div>
      </section>
    {:else if activeTab === 'category-select'}
      <section class="demo-section">
        <h2>CategorySelect Component</h2>
        <p class="section-description">
          Selector de categorías compacto usando Melt UI Select. Ideal para celdas de tabla.
        </p>

        <div class="demo-grid">
          <div class="demo-item">
            <h3>Sin selección inicial</h3>
            <div class="category-demo-container">
              <CategorySelect
                categories={demoCategories}
                bind:value={categoryA}
                onchange={(id) => logCategory(`A: seleccionó ${id}`)}
              />
            </div>
            <p class="value-display">Valor: {categoryA === null ? 'null' : categoryA}</p>
          </div>

          <div class="demo-item">
            <h3>Con valor pre-seleccionado</h3>
            <div class="category-demo-container">
              <CategorySelect
                categories={demoCategories}
                bind:value={categoryB}
                onchange={(id) => logCategory(`B: seleccionó ${id}`)}
              />
            </div>
            <p class="value-display">Valor: {categoryB === null ? 'null' : categoryB}</p>
          </div>

          <div class="demo-item">
            <h3>Disabled</h3>
            <div class="category-demo-container">
              <CategorySelect categories={demoCategories} value={3} disabled={true} />
            </div>
            <p class="value-display">disabled, valor fijo: 3</p>
          </div>
        </div>

        <div class="demo-item">
          <h3>Event Log</h3>
          <div class="category-log">
            {#if categoryLogs.length === 0}
              <p class="no-logs">Interactúa con los selectores para ver eventos</p>
            {:else}
              {#each categoryLogs as log}
                <div class="log-entry">{log}</div>
              {/each}
            {/if}
          </div>
          <div style="margin-top: var(--spacing-3); display: flex; gap: var(--spacing-2);">
            <Button
              size="sm"
              variant="secondary"
              onclick={() => {
                categoryA = null;
                logCategory('Reset A');
              }}
            >
              Reset A
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onclick={() => {
                categoryB = 1;
                logCategory('Set B = 1');
              }}
            >
              Set B = 1
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onclick={() => {
                categoryLogs = [];
              }}
            >
              Clear Log
            </Button>
          </div>
        </div>

        <div class="code-example">
          <h4>Ejemplo de código:</h4>
          <pre><code
              >&lt;CategorySelect
  categories=&#123;categories&#125;
  bind:value=&#123;categoryId&#125;
  onchange=&#123;(id) => saveCategory(id)&#125;
/&gt;</code
            ></pre>
        </div>
      </section>
    {/if}
  </div>

  <footer class="demo-footer">
    <p>
      📚 Documentación completa en
      <a href="https://melt-ui.com" target="_blank" rel="noopener noreferrer">Melt UI</a>
    </p>
    <p>
      Ver código fuente en
      <code>client/src/lib/components/ui/</code>
    </p>
  </footer>
</div>

<style>
  .demo-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--spacing-8);
  }

  .demo-header {
    margin-bottom: var(--spacing-8);
  }

  .demo-header h1 {
    font-size: var(--font-size-4xl);
    font-weight: var(--font-weight-bold);
    margin: 0 0 var(--spacing-2) 0;
    color: var(--color-text-primary);
  }

  .demo-header p {
    font-size: var(--font-size-lg);
    color: var(--color-text-secondary);
    margin: 0;
  }

  .demo-content {
    margin-top: var(--spacing-6);
  }

  .demo-section {
    animation: fadeIn var(--transition-base);
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .demo-section h2 {
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-semibold);
    margin: 0 0 var(--spacing-3) 0;
    color: var(--color-text-primary);
  }

  .section-description {
    color: var(--color-text-secondary);
    margin-bottom: var(--spacing-6);
  }

  .demo-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: var(--spacing-6);
    margin-bottom: var(--spacing-8);
  }

  .demo-item {
    background: var(--color-surface);
    padding: var(--spacing-6);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
  }

  .demo-item h3 {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    margin: 0 0 var(--spacing-4) 0;
    color: var(--color-text-primary);
  }

  .button-group {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-3);
  }

  .value-display {
    margin-top: var(--spacing-3);
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    font-family: var(--font-mono);
  }

  .dialog-demo-content ul {
    margin: var(--spacing-4) 0;
    padding-left: var(--spacing-6);
    color: var(--color-text-secondary);
  }

  .dialog-demo-content li {
    margin: var(--spacing-2) 0;
  }

  .code-example {
    background: var(--color-neutral-900);
    color: var(--color-neutral-100);
    padding: var(--spacing-4);
    border-radius: var(--radius-md);
    margin-top: var(--spacing-6);
  }

  .code-example h4 {
    margin: 0 0 var(--spacing-3) 0;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-neutral-300);
  }

  .code-example pre {
    margin: 0;
    overflow-x: auto;
  }

  .code-example code {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    line-height: var(--line-height-relaxed);
  }

  .demo-footer {
    margin-top: var(--spacing-12);
    padding-top: var(--spacing-8);
    border-top: 1px solid var(--color-border);
    text-align: center;
    color: var(--color-text-secondary);
  }

  .demo-footer p {
    margin: var(--spacing-2) 0;
  }

  .demo-footer a {
    color: var(--color-primary-600);
    text-decoration: none;
    font-weight: var(--font-weight-medium);
  }

  .demo-footer a:hover {
    text-decoration: underline;
  }

  .demo-footer code {
    background: var(--color-neutral-100);
    padding: var(--spacing-1) var(--spacing-2);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
  }

  /* CategorySelect demo styles */
  .category-demo-container {
    padding: var(--spacing-3);
    background: var(--color-surface-alt);
    border-radius: var(--radius-md);
    display: inline-block;
  }

  .category-log {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    background: var(--color-neutral-50);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-3);
    max-height: 150px;
    overflow-y: auto;
  }

  .category-log .no-logs {
    color: var(--color-text-tertiary);
    font-style: italic;
    margin: 0;
  }

  .category-log .log-entry {
    padding: var(--spacing-1) 0;
    border-bottom: 1px solid var(--color-border);
  }

  .category-log .log-entry:last-child {
    border-bottom: none;
  }

  @media (max-width: 768px) {
    .demo-container {
      padding: var(--spacing-4);
    }

    .demo-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
