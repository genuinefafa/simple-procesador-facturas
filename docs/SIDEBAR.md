# Sidebar Component - Documentación Completa

**Componente**: `client/src/lib/components/ui/Sidebar.svelte`
**Última actualización**: 2025-12-16

---

## 1. Descripción

El componente `Sidebar` proporciona un patrón de navegación profesional y responsive diseñado para aplicaciones web. Reemplaza el anterior enfoque de toggle simple (← →) por un patrón más estándar y UX-friendly.

## 2. Características

### Desktop (≥ 768px)
- **Sidebar persistente**: Siempre visible en el lado izquierdo
- **Ancho fijo (280px)**: Proporciona amplitud visual
- **Navegación clara**: Items con iconos y etiquetas bien espaciados
- **Sticky positioning**: Permanece visible al scroll
- **Contenido personalizado**: Área para opciones/configuración
- **Accesibilidad**: Estructura semántica `<nav>` con `role="menuitem"`

### Mobile (< 768px)
- **Hamburguesa FAB**: Botón circular flotante en esquina inferior derecha
- **Drawer animado**: Sidebar desliza desde la izquierda con `transform: translateX(-100%)`
- **Overlay oscuro**: Fondo semitraslúcido que permite cerrar el drawer
- **Cerrar automático**: Al hacer click en un item, el drawer se cierra (en mobile)
- **Cerrar manual**: Botón ✕ en la esquina superior derecha

## 3. API del Componente

### Props

| Prop | Tipo | Default | Descripción |
|------|------|---------|-------------|
| `navItems` | `NavItem[]` | `[]` | Array de items de navegación |
| `title` | `string` | `'Menu'` | Título mostrado en el header |
| `open` | `boolean` | `true` | Estado del sidebar (bindable) |
| `onNavClick` | `(href: string) => void` | - | Callback al hacer click en un item |
| `children` | `Snippet` | - | Contenido personalizado (footer area) |
| `class` | `string` | `''` | Clases CSS adicionales |

### Estructura NavItem

```typescript
interface NavItem {
  href: string;      // URL del link
  label: string;     // Texto mostrado
  icon?: string;     // Emoji o icono (ej: '📥', '⚙️')
}
```

## 4. Uso Básico

```svelte
<script>
  import { Sidebar } from '$lib/components/ui';

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: '🏠' },
    { href: '/comprobantes', label: 'Comprobantes', icon: '📋' },
    { href: '/emisores', label: 'Emisores', icon: '👥' },
  ];

  let sidebarOpen = $state(true);
</script>

<Sidebar
  {navItems}
  title="🧾 Facturas"
  bind:open={sidebarOpen}
>
  {#snippet children()}
    <!-- Contenido personalizado aquí (opciones, dropdowns, etc.) -->
    <p class="version">v0.4.0</p>
  {/snippet}
</Sidebar>
```

## 5. Ejemplos de Uso

### Con Dropdown Menu

```svelte
<script>
  import { Sidebar, Dropdown } from '$lib/components/ui';
</script>

<Sidebar {navItems}>
  {#snippet children()}
    <Dropdown>
      {#snippet trigger()}
        <span>⚙️</span>
        <span>Opciones</span>
      {/snippet}
      {#snippet children()}
        <button class="dropdown-item">Configuración</button>
        <button class="dropdown-item">Sincronización</button>
        <button class="dropdown-item">Ayuda</button>
      {/snippet}
    </Dropdown>
  {/snippet}
</Sidebar>
```

### En Layout Global

```svelte
<!-- routes/+layout.svelte -->
<script>
  import { Sidebar } from '$lib/components/ui';
  import '$lib/components/ui/tokens.css';

  let sidebarOpen = $state(true);
</script>

<div class="app-container">
  <Sidebar {navItems} bind:open={sidebarOpen} />

  <main class="main-content">
    <slot />
  </main>
</div>

<style>
  .app-container {
    display: flex;
    min-height: 100vh;
  }

  .main-content {
    flex: 1;
    overflow: auto;
  }
</style>
```

## 6. Comportamiento

### Desktop
1. Sidebar siempre visible
2. Click en item navega (sin cerrar)
3. Scrollbar personalizado (ancho: 6px, color: neutral-600)

### Mobile
1. Botón hamburguesa flotante (☰) visible cuando drawer está cerrado
2. Click en hamburguesa abre el drawer con animación suave
3. Click en item navega Y cierra drawer automáticamente
4. Click en overlay (fondo oscuro) cierra drawer
5. Botón ✕ en header cierra drawer

## 7. Animaciones

- **Drawer slide-in**: `transform: translateX(-100%)` → `translateX(0)`
- **Overlay fade**: Opacity 0 → 1
- **Duración**: `var(--transition-base)` (típicamente 300ms)
- **Timing**: ease (suave)

## 8. Estilos y Colores

- **Background**: `var(--color-neutral-800)` (gris oscuro)
- **Text**: `var(--color-text-inverse)` (blanco/claro)
- **Borders**: `var(--color-neutral-700)`
- **Hover items**: `rgba(255, 255, 255, 0.1)` overlay
- **FAB button**: `var(--color-primary-600)` con shadow

## 9. Accesibilidad

- ✅ Botones con `aria-label` descriptivos
- ✅ Links con `href` semántico
- ✅ Items con `role="menuitem"`
- ✅ Estructura `<nav>` para lectores de pantalla
- ✅ Navegación por teclado soportada
- ✅ Focus visible states

## 10. Z-Index Layers

```css
FAB button:       var(--z-fixed)         /* 1000 */
Overlay:          var(--z-modal-backdrop) /* 1040 */
Drawer/Sidebar:   var(--z-sticky)        /* 500 */
```

## 11. Migración desde Patrón Antiguo

### Antes

```svelte
<!-- Patrón antiguo con toggle -->
<aside class="sidebar" class:collapsed={!sidebarOpen}>
  <button class="toggle" onclick={() => sidebarOpen = !sidebarOpen}>
    {sidebarOpen ? '←' : '→'}
  </button>
  <nav>
    {#each items as item}
      <a href={item.href}>{item.label}</a>
    {/each}
  </nav>
</aside>
```

### Después

```svelte
<!-- Patrón nuevo con componente Sidebar -->
<Sidebar {navItems} bind:open={sidebarOpen}>
  {#snippet children()}
    <!-- Contenido personalizado -->
  {/snippet}
</Sidebar>
```

### Diferencias Clave

| Aspecto | Antes | Ahora |
|--------|-------|-------|
| **Toggle** | Botón con flecha (← →) | Hamburguesa FAB en mobile |
| **Patrón** | Toggle collapse/expand | Drawer slide-in (mobile) / Persistent (desktop) |
| **UX Mobile** | Sidebar colapsada a 70px | Drawer fullscreen con overlay |
| **Accesibilidad** | Básica | Mejorada con roles ARIA |
| **Animaciones** | CSS simple | Smooth transitions |
| **Responsividad** | Breakpoint rígido | Flexible a partir de 768px |
| **Componibilidad** | Limitada | Snippets flexibles |

## 12. Personalización

### Estilos Custom

```svelte
<Sidebar {navItems} class="custom-sidebar">
  <!-- ... -->
</Sidebar>

<style>
  :global(.custom-sidebar) {
    /* Cambiar colores si es necesario */
    --color-neutral-800: #1a1a1a;
    --color-primary-600: #00bfa5;
  }
</style>
```

### Callbacks de Navegación

```svelte
<script>
  function handleNavClick(href: string) {
    console.log('Navegando a:', href);
    // Lógica personalizada (analytics, etc.)
  }
</script>

<Sidebar {navItems} onNavClick={handleNavClick} />
```

## 13. Troubleshooting

### Sidebar no aparece
- ✅ Verificar que `tokens.css` está importado en layout global
- ✅ Checar que `Sidebar` está importado de `$lib/components/ui`
- ✅ Revisar z-index si se ve detrás de otros elementos

### Drawer no cierra en mobile
- ✅ Verificar que `bind:open={state}` es bidireccional
- ✅ Check breakpoint: media query es `< 768px`
- ✅ Descartar conflicto de media queries en CSS global

### Items no navegan
- ✅ Verificar que `navItems` tiene estructura `{href, label, icon}`
- ✅ Checar que `href` es una ruta válida
- ✅ Revisar `onNavClick` callback si existe

## 14. Demo

**Ruta**: `/layout-demo`
**URL**: `http://localhost:5173/layout-demo`

La demo muestra:
- Layout completo con Sidebar + TopBar + Tabs
- Dropdown anidado en footer
- Responsive behavior (desktop/mobile)
- Todas las interacciones (FAB, overlay, navigation)

## 15. Compatibilidad

- ✅ Svelte 5+ (con $bindable, snippets)
- ✅ SvelteKit 2+
- ✅ CSS custom properties (design tokens)
- ✅ Mobile browsers (iOS Safari, Chrome mobile)
- ✅ Accesibilidad WCAG 2.1 AA

## 16. Próximas Mejoras

- [ ] Sub-menús/jerarquía (accordion anidado)
- [ ] Collapse inteligente basado en viewport
- [ ] Temas (claro/oscuro) con CSS variables
- [ ] Badges/contadores en items
- [ ] Iconos SVG en lugar de solo emoji

---

**Última revisión**: 2025-12-16
**Implementado por**: GitHub Copilot + Claude Sonnet 4.5
