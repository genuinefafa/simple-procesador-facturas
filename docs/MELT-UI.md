# Melt UI - Documentación Completa

**Última actualización**: 2025-12-16

---

## 1. Resumen

Este proyecto utiliza **Melt UI Next** (beta v0.42.0) para Svelte 5, que proporciona primitivos headless accesibles. También mantiene **@melt-ui/svelte** (v0.86.6) temporalmente para componentes no disponibles en la versión Next.

## 2. Versiones Instaladas

```json
{
  "melt": "^0.42.0",              // Melt UI Next (beta) - Svelte 5 compatible
  "@melt-ui/svelte": "^0.86.6"    // Melt UI viejo - Solo para Dialog
}
```

## 3. Estado de Migración

### ✅ Migrados a Melt Next

| Componente | Basado en | Estado |
|------------|-----------|--------|
| **Tabs** | `Tabs` de melt/builders | ✅ Completamente migrado |
| **Dropdown** | `Popover` de melt/builders | ✅ Completamente migrado |

### ❌ Componentes sin Melt

| Componente | Tecnología | Razón |
|------------|-----------|-------|
| **Button** | CSS puro | No requiere Melt (solo estilos) |
| **Input** | CSS puro | No requiere Melt (solo estilos) |
| **Sidebar** | Patrón custom | Implementación propia con design tokens |

### ⚠️ Pendientes de Migración

| Componente | Estado | Notas |
|------------|--------|-------|
| **Dialog** | Usa `@melt-ui/svelte` v0.86 | No existe Dialog en Melt Next aún |

**Opciones para Dialog**:
1. ✅ Mantener con melt viejo temporalmente (opción actual)
2. Usar `<dialog>` HTML nativo
3. Construir custom con Popover + modal overlay

## 4. Sintaxis: Vieja vs Nueva

### Melt Viejo (v0.86.6)

```svelte
<script>
  import { createDialog, melt } from '@melt-ui/svelte';

  const {
    elements: { trigger, portalled, overlay, content, title, description, close },
    states: { open }
  } = createDialog();
</script>

<button use:melt={$trigger}>Abrir</button>

{#if $open}
  <div use:melt={$portalled}>
    <div use:melt={$overlay} />
    <div use:melt={$content}>
      <h2 use:melt={$title}>Título</h2>
      <p use:melt={$description}>Contenido</p>
    </div>
  </div>
{/if}
```

### Melt Next (v0.42.0)

```svelte
<script>
  import { Tabs } from 'melt/builders';

  const tabs = new Tabs({
    defaultValue: 'tab1'
  });
</script>

<div {...tabs.triggerList}>
  <button {...tabs.getTrigger('tab1')}>Tab 1</button>
  <button {...tabs.getTrigger('tab2')}>Tab 2</button>
</div>

<div {...tabs.getContent('tab1')}>
  Contenido 1
</div>
```

**Diferencias clave**:
- ❌ NO más `use:melt={$element}`
- ✅ Spread attributes `{...builder.element}`
- ❌ NO más stores (`$open`, `$trigger`)
- ✅ Propiedades reactivas directas con runes ($state)

## 5. Componentes Implementados

### 5.1 Button

**Ubicación**: `client/src/lib/components/ui/Button.svelte`
**Tecnología**: CSS puro + design tokens

**Variantes**: primary, secondary, ghost, danger
**Tamaños**: sm, md, lg

```svelte
<script>
  import { Button } from '$lib/components/ui';
</script>

<Button variant="primary" size="md" onclick={() => alert('Click')}>
  Guardar
</Button>
```

### 5.2 Input

**Ubicación**: `client/src/lib/components/ui/Input.svelte`
**Tecnología**: CSS puro + design tokens

**Tipos**: text, email, password, number, search, tel, url

```svelte
<script>
  import { Input } from '$lib/components/ui';

  let email = $state('');
</script>

<Input
  bind:value={email}
  type="email"
  label="Email"
  placeholder="tu@email.com"
  required
  error={emailError}
/>
```

### 5.3 Dialog

**Ubicación**: `client/src/lib/components/ui/Dialog.svelte`
**Tecnología**: `@melt-ui/svelte` v0.86 (viejo)

**Features**:
- Modal accesible con focus trap
- ESC para cerrar
- Click outside para cerrar
- Portal rendering
- Animaciones suaves

```svelte
<script>
  import { Dialog } from '$lib/components/ui';

  let open = $state(false);
</script>

<Dialog bind:open title="Confirmar acción">
  <p>¿Estás seguro de continuar?</p>
  <Button onclick={() => open = false}>Cancelar</Button>
  <Button variant="primary" onclick={handleConfirm}>Confirmar</Button>
</Dialog>
```

### 5.4 Tabs

**Ubicación**: `client/src/lib/components/ui/Tabs.svelte`
**Tecnología**: Melt UI Next (v0.42)

**Features**:
- Keyboard navigation (arrows, Home, End)
- Tabs deshabilitadas
- Scroll horizontal
- ARIA roles completos

```svelte
<script>
  import { Tabs } from '$lib/components/ui';

  const items = [
    { id: 'tab1', label: 'General', content: 'Contenido 1' },
    { id: 'tab2', label: 'Avanzado', content: 'Contenido 2' },
  ];
</script>

<Tabs {items} defaultValue="tab1" />
```

### 5.5 Dropdown

**Ubicación**: `client/src/lib/components/ui/Dropdown.svelte`
**Tecnología**: Melt UI Next Popover (v0.42)

**Features**:
- Posicionamiento inteligente (floatingConfig)
- Keyboard navigation
- Focus management
- Snippets customizables

```svelte
<script>
  import { Dropdown } from '$lib/components/ui';
</script>

<Dropdown>
  {#snippet trigger()}
    <span>⚙️ Opciones</span>
  {/snippet}

  {#snippet children()}
    <button class="dropdown-item">Editar</button>
    <button class="dropdown-item">Eliminar</button>
  {/snippet}
</Dropdown>
```

### 5.6 Sidebar

**Ubicación**: `client/src/lib/components/ui/Sidebar.svelte`
**Tecnología**: Patrón custom con design tokens

**Features**:
- Desktop: Sidebar sticky persistente (280px)
- Mobile: Drawer con hamburguesa FAB
- Navegación con iconos
- Contenido personalizable (snippets)

```svelte
<script>
  import { Sidebar } from '$lib/components/ui';

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: '🏠' },
    { href: '/comprobantes', label: 'Comprobantes', icon: '📋' },
  ];

  let sidebarOpen = $state(true);
</script>

<Sidebar {navItems} title="Mi App" bind:open={sidebarOpen}>
  {#snippet children()}
    <p class="version">v0.4.0</p>
  {/snippet}
</Sidebar>
```

## 6. Design Tokens

**Ubicación**: `client/src/lib/components/ui/tokens.css`

Sistema completo de design tokens CSS:

```css
/* Colores */
--color-primary-600
--color-neutral-800
--color-success-500
--color-danger-600

/* Espaciado */
--spacing-1 (4px)
--spacing-4 (16px)
--spacing-8 (32px)

/* Tipografía */
--font-size-base (1rem)
--font-size-lg (1.125rem)
--font-weight-medium (500)

/* Border Radius */
--border-radius-sm (0.25rem)
--border-radius-md (0.375rem)

/* Sombras */
--shadow-sm
--shadow-lg

/* Transiciones */
--transition-base (300ms)

/* Z-Index */
--z-dropdown (1000)
--z-modal (1050)
```

**IMPORTANTE**: Siempre usar tokens, nunca valores hardcoded.

## 7. Builders Disponibles en Melt Next

Componentes que existen en Melt Next (v0.42) y podemos usar:

- ✅ Accordion
- ✅ Avatar
- ✅ Collapsible
- ✅ Combobox
- ✅ FileUpload
- ✅ PinInput
- ✅ **Popover** (usado para Dropdown)
- ✅ Progress
- ✅ RadioGroup
- ✅ Select
- ✅ Slider
- ✅ SpatialMenu
- ✅ **Tabs** (migrado)
- ✅ Toaster
- ✅ Toggle
- ✅ Tooltip
- ✅ Tree

## 8. Builders NO Disponibles (aún)

Componentes que NO existen en Melt Next:

- ❌ Dialog / Modal (usamos melt viejo temporalmente)
- ❌ DropdownMenu (usamos Popover)
- ❌ NavigationMenu
- ❌ ContextMenu
- ❌ Menubar

## 9. Beneficios de Melt Next

1. **Diseñado para Svelte 5**: Usa runes nativos ($state, $derived, etc)
2. **API más simple**: Spread attributes en lugar de `use:melt`
3. **TypeScript mejorado**: Mejor inferencia de tipos
4. **Sin stores**: Usa propiedades reactivas directas
5. **Más liviano**: Menos overhead runtime
6. **Headless**: Total control de estilos

## 10. Testing

### Verificación de Build

```bash
cd client && npm run check
# ✅ svelte-check: 0 errors
```

### Demo Interactiva

```bash
npm run dev
# Visitar: http://localhost:5173/ui-demo
```

La demo muestra todos los componentes en acción con ejemplos de código.

## 11. Importación

**Archivo**: `client/src/lib/components/ui/index.ts`

```typescript
export { default as Button } from './Button.svelte';
export { default as Input } from './Input.svelte';
export { default as Dialog } from './Dialog.svelte';
export { default as Tabs } from './Tabs.svelte';
export { default as Dropdown } from './Dropdown.svelte';
export { default as Sidebar } from './Sidebar.svelte';
```

**Uso**:
```svelte
<script>
  import { Button, Input, Dialog, Tabs, Dropdown, Sidebar } from '$lib/components/ui';
</script>
```

## 12. Próximos Componentes Sugeridos

Componentes que podríamos agregar en el futuro:

- [ ] Select/Combobox (Melt UI Next)
- [ ] Tooltip (Melt UI Next)
- [ ] Popover standalone (Melt UI Next)
- [ ] Menu contextual (Melt UI Next)
- [ ] Accordion (Melt UI Next)
- [ ] Toast/Notification system (svelte-sonner ya instalado)
- [ ] Toggle/Switch (Melt UI Next)
- [ ] Progress bar (Melt UI Next)
- [ ] Skeleton loaders (custom)

## 13. Referencias

**Documentación oficial**:
- [Melt UI Next](https://context7.com/melt-ui/next-gen)
- [GitHub Melt Next](https://github.com/melt-ui/next-gen)
- [Melt UI viejo (v0.86)](https://melt-ui.com/)

**Migration guide**: Pendiente oficial (en beta)

---

**Última revisión**: 2025-12-16
**Implementado por**: GitHub Copilot + Claude Sonnet 4.5
