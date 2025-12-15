# Guía de Migración: Adopción del Componente Sidebar

## Resumen de Cambios

Se ha implementado un **componente `Sidebar`** mejorado que reemplaza el anterior patrón de toggle con flechas (← →). El nuevo enfoque sigue patrones UX profesionales:

- ✅ Desktop: Sidebar sticky persistente (280px)
- ✅ Mobile: Drawer animado con hamburguesa FAB (☰)
- ✅ Componible con dropdowns y contenido personalizado
- ✅ Completamente accesible (ARIA, keyboard navigation)

## Qué Cambió

### Antes
```svelte
<!-- Patrón antiguo -->
<aside class="sidebar" class:collapsed={!sidebarOpen}>
  <button class="toggle">← →</button>
  <!-- Nav items con collapse behavior -->
</aside>
```

### Ahora
```svelte
<!-- Patrón nuevo con Sidebar component -->
<Sidebar {navItems} bind:open={sidebarOpen}>
  {#snippet children()}
    <!-- Contenido personalizado (opciones, etc.) -->
  {/snippet}
</Sidebar>
```

## Beneficios

| Aspecto | Antes | Después |
|--------|-------|---------|
| **UX Pattern** | Toggle collapse/expand | Drawer slide-in (mobile) / Persistent (desktop) |
| **Accesibilidad** | Básica | ARIA completo + keyboard nav |
| **Mobile Experience** | Sidebar 70px | Hamburgesa FAB + fullscreen drawer |
| **Responsive** | Manual breakpoints | Automático 768px |
| **Componibilidad** | Limitada | Snippets flexibles |
| **Animaciones** | Simples | Smooth transitions + overlay |

## Cómo Migrar Sidebars Existentes

### Paso 1: Preparar NavItems

```typescript
const navItems = [
  { href: '/importar', label: 'Importar', icon: '📥' },
  { href: '/procesar', label: 'Procesar', icon: '⚙️' },
  { href: '/entrenamiento', label: 'Entrenamiento', icon: '📝' },
  { href: '/facturas', label: 'Facturas', icon: '📋' },
];
```

### Paso 2: Importar Sidebar

```svelte
<script>
  import { Sidebar, Dropdown, Button } from '$lib/components/ui';

  let sidebarOpen = $state(true);
</script>
```

### Paso 3: Usar Sidebar

```svelte
<div class="app-container">
  <Sidebar {navItems} title="Mi App" bind:open={sidebarOpen}>
    {#snippet children()}
      <!-- Contenido personalizado aquí -->
      <Dropdown><!-- ... --></Dropdown>
      <p class="version">v1.0.0</p>
    {/snippet}
  </Sidebar>

  <main>
    <!-- Contenido principal -->
  </main>
</div>

<style>
  .app-container {
    display: flex;
    min-height: 100vh;
  }

  main {
    flex: 1;
  }
</style>
```

## Ejemplo Completo: Integración en +layout.svelte

```svelte
<script lang="ts">
  import { page } from '$app/state';
  import { Sidebar, Dropdown } from '$lib/components/ui';
  import '$lib/components/ui/tokens.css';

  const navItems = [
    { href: '/facturas', label: 'Facturas', icon: '📋' },
    { href: '/reportes', label: 'Reportes', icon: '📊' },
    { href: '/configuracion', label: 'Configuración', icon: '⚙️' },
  ];

  let sidebarOpen = $state(true);
</script>

<div class="app">
  <Sidebar {navItems} title="🧾 Sistema" bind:open={sidebarOpen}>
    {#snippet children()}
      <Dropdown>
        {#snippet trigger()}
          <span>⚙️</span>
          <span>Más</span>
        {/snippet}
        {#snippet children()}
          <button class="dropdown-item">Perfil</button>
          <button class="dropdown-item">Ayuda</button>
          <button class="dropdown-item">Cerrar sesión</button>
        {/snippet}
      </Dropdown>
    {/snippet}
  </Sidebar>

  <main class="content">
    <slot />
  </main>
</div>

<style>
  .app {
    display: flex;
    min-height: 100vh;
  }

  .content {
    flex: 1;
    overflow: auto;
    background: var(--color-surface-alt);
  }
</style>
```

## Personalización

### Props del Sidebar

```svelte
<Sidebar
  navItems={items}           {/* Array de NavItem */}
  title="Mi App"             {/* Título del header */}
  bind:open={sidebarOpen}    {/* Control bindable del drawer */}
  onNavClick={handler}       {/* Callback al hacer click */}
  class="custom-class"       {/* CSS adicional */}
>
  {#snippet children()}
    {/* Contenido personalizado en footer */}
  {/snippet}
</Sidebar>
```

### Estilos Personalizados

Los colores y dimensiones usan CSS variables del sistema de tokens:

```css
/* Cambiar colores si lo necesitas */
:root {
  --color-neutral-800: #1f2937;  /* Fondo sidebar */
  --color-primary-600: #2563eb;  /* FAB button */
}
```

## Casos de Uso

### Con Dropdown en Footer
```svelte
<Sidebar {navItems}>
  {#snippet children()}
    <Dropdown>
      <button>Opciones</button>
    </Dropdown>
  {/snippet}
</Sidebar>
```

### Con Información de Usuario
```svelte
<Sidebar {navItems}>
  {#snippet children()}
    <div class="user-info">
      <img src={user.avatar} alt={user.name} />
      <p>{user.name}</p>
      <small>{user.email}</small>
    </div>
  {/snippet}
</Sidebar>
```

### Con Links Externos
```svelte
<Sidebar {navItems}>
  {#snippet children()}
    <a href="https://docs.ejemplo.com">📖 Documentación</a>
    <a href="https://github.com">🔗 GitHub</a>
  {/snippet}
</Sidebar>
```

## Testing

### En Navegador
1. Abre `/layout-demo` para ver demo completo
2. Desktop: Sidebar siempre visible, navega sin cerrar
3. Mobile (< 768px): Click ☰ abre drawer, click item cierra

### Con React DevTools
```javascript
// En consola dev
// Ver estado del drawer
const sidebar = document.querySelector('nav.sidebar');
console.log(sidebar.classList.contains('open')); // true/false
```

## Troubleshooting

### Sidebar no aparece
- Verificar que `tokens.css` está importado en layout global
- Checar que `Sidebar` está importado de `$lib/components/ui`
- Revisar z-index si se ve detrás de otros elementos

### Drawer no cierra en mobile
- Verificar que `bind:open={state}` es bidireccional
- Check breakpoint: media query es `< 768px`
- Descartar conflicto de media queries en CSS global

### Items no navegan
- Verificar que `navItems` tiene estructura `{href, label, icon}`
- Checar que `href` es una ruta válida
- Revisar `onNavClick` callback si existe

## Próximas Mejoras

- [ ] Sub-menús/jerarquía (accordion anidado)
- [ ] Animación de collapse inteligente basada en viewport
- [ ] Temas (claro/oscuro) con CSS variables
- [ ] Índice de iconos reutilizables (no solo emoji)
- [ ] Soporte para badger/contadores en items

## Documentación Relacionada

- [SIDEBAR-PATTERN.md](./SIDEBAR-PATTERN.md) - Detalles técnicos del componente
- [MELT-UI-SUMMARY.md](./MELT-UI-SUMMARY.md) - Overview de todos los componentes UI
- `/layout-demo` - Demo funcional con ejemplo completo
