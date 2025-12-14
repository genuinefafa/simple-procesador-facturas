# Sidebar Component - Patrón de Navegación Mejorado

## Descripción

El componente `Sidebar` proporciona un patrón de navegación profesional y responsive diseñado para aplicaciones web clásicas. Reemplaza el anterior enfoque de toggle simple (← →) por un patrón más estándar y UX-friendly.

## Características

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

## Uso Básico

```svelte
<Sidebar 
  {navItems} 
  title="🧾 Facturas" 
  bind:open={sidebarOpen}
>
  {#snippet children()}
    <!-- Contenido personalizado aquí (opciones, dropdowns, etc.) -->
    <Dropdown>
      {#snippet trigger()}
        <span>⚙️</span>
        <span>Opciones</span>
      {/snippet}
      {#snippet children()}
        <button class="dropdown-item">Configuración</button>
        <button class="dropdown-item">Sincronización</button>
      {/snippet}
    </Dropdown>
  {/snippet}
</Sidebar>
```

## Props

| Prop | Tipo | Default | Descripción |
|------|------|---------|-------------|
| `navItems` | `NavItem[]` | `[]` | Array de items de navegación |
| `title` | `string` | `'Menu'` | Título mostrado en el header |
| `open` | `boolean` | `true` | Estado del sidebar (bindable) |
| `onNavClick` | `(href: string) => void` | - | Callback al hacer click en un item |
| `children` | `Snippet` | - | Contenido personalizado (footer area) |
| `class` | `string` | `''` | Clases CSS adicionales |

## Estructura NavItem

```typescript
interface NavItem {
  href: string;      // URL del link
  label: string;     // Texto mostrado
  icon?: string;     // Emoji o icono (ej: '📥', '⚙️')
}
```

## Comportamiento

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

## Animaciones

- **Drawer slide-in**: `transform: translateX(-100%)` → `translateX(0)`
- **Overlay fade**: Opacity 0 → 1
- **Duración**: `var(--transition-base)` (típicamente 300ms)
- **Timing**: ease (suave)

## Estilos y Colores

- **Background**: `var(--color-neutral-800)` (gris oscuro)
- **Text**: `var(--color-text-inverse)` (blanco/claro)
- **Borders**: `var(--color-neutral-700)`
- **Hover items**: `rgba(255, 255, 255, 0.1)` overlay
- **FAB button**: `var(--color-primary-600)` con shadow

## Accesibilidad

- ✅ Botones con `aria-label` descriptivos
- ✅ Links con `href` semántico
- ✅ Items con `role="menuitem"`
- ✅ Estructura `<nav>` para lectores de pantalla
- ✅ Navegación por teclado soportada
- ✅ Focus visible states

## Ejemplo Completo (layout-demo)

```svelte
<Sidebar 
  navItems={[
    { href: '/importar', label: 'Importar', icon: '📥' },
    { href: '/procesar', label: 'Procesar', icon: '⚙️' },
    { href: '/entrenamiento', label: 'Entrenamiento', icon: '📝' },
    { href: '/facturas', label: 'Facturas', icon: '📋' },
  ]}
  title="🧾 Facturas" 
  bind:open={sidebarOpen}
>
  {#snippet children()}
    <Dropdown>
      {#snippet trigger()}
        <span>⚙️</span>
        <span class="nav-label">Opciones</span>
      {/snippet}
      {#snippet children()}
        <button class="dropdown-item">Configuración</button>
        <a href="/google-sync" class="dropdown-item">Sincronización</a>
        <button class="dropdown-item">Ayuda</button>
      {/snippet}
    </Dropdown>
    <p class="version">v0.2.0</p>
  {/snippet}
</Sidebar>
```

## Patrones Recomendados

### 1. Con Layout Global
```svelte
<!-- routes/+layout.svelte -->
<div class="app-container">
  <Sidebar {navItems} bind:open={sidebarOpen} />
  <main class="main-content">
    <slot />
  </main>
</div>
```

### 2. Con Dropdown Menu
```svelte
<Sidebar {navItems}>
  {#snippet children()}
    <Dropdown>
      <!-- Opciones adicionales -->
    </Dropdown>
  {/snippet}
</Sidebar>
```

### 3. Con Custom Footer
Usa el slot `children` para agregar cualquier contenido en el footer (versión app, etc.)

## Diferencias con Implementación Anterior

| Aspecto | Antes | Ahora |
|--------|-------|-------|
| **Toggle** | Botón con flecha (← →) | Hamburguesa FAB en mobile |
| **Patrón** | Toggle collapse/expand | Drawer slide-in (mobile) / Persistent (desktop) |
| **UX Mobile** | Sidebar colapsada a 70px | Drawer fullscreen con overlay |
| **Accesibilidad** | Básica | Mejorada con roles ARIA |
| **Animaciones** | CSS simple | Smooth transitions |
| **Responsividad** | Breakpoint rígido | Flexible a partir de 768px |

## Z-Index Layers

```css
FAB button:       var(--z-fixed)        /* 1000 */
Overlay:          var(--z-modal-backdrop) /* 1040 */
Drawer/Sidebar:   var(--z-sticky)       /* 500 */
```

## Compatibilidad

- ✅ Svelte 5+ (con $bindable, snippets)
- ✅ SvelteKit 2+
- ✅ CSS custom properties (design tokens)
- ✅ Mobile browsers (iOS Safari, Chrome mobile)
- ✅ Accesibilidad WCAG 2.1 AA

## Próximos Pasos

1. Migrar sidebars existentes al nuevo componente
2. Agregar animación suave con `transition:slide` en drawer
3. Considerar estado "collapse inteligente" basado en viewport
4. Agregar soporte para sub-menús/jerarquía
