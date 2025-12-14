# UI Primitives

Sistema de componentes UI accesibles construidos con Melt UI y CSS custom.

## Filosofía

- **Headless UI**: Melt UI provee la lógica y accesibilidad, nosotros el estilo
- **Sin Tailwind**: CSS puro usando design tokens
- **Accesibilidad primero**: ARIA, focus trap, keyboard navigation
- **Svelte 5 runes**: Totalmente compatible con la última versión

## Componentes

### Button

Botón accesible con múltiples variantes y tamaños.

```svelte
<script>
  import { Button } from '$lib/components/ui';
</script>

<Button variant="primary" size="md" onclick={() => console.log('clicked')}>Guardar</Button>

<Button variant="secondary">Cancelar</Button>
<Button variant="ghost">Opciones</Button>
<Button variant="danger">Eliminar</Button>
```

**Props:**

- `variant`: 'primary' | 'secondary' | 'ghost' | 'danger' (default: 'primary')
- `size`: 'sm' | 'md' | 'lg' (default: 'md')
- `disabled`: boolean
- `type`: 'button' | 'submit' | 'reset'
- `onclick`: event handler

### Input

Campo de entrada con label, validación y mensajes de error/hint.

```svelte
<script>
  import { Input } from '$lib/components/ui';

  let email = $state('');
  let error = $state('');
</script>

<Input
  bind:value={email}
  label="Correo electrónico"
  type="email"
  placeholder="tu@email.com"
  required
  {error}
  hint="Usaremos este correo para notificaciones"
/>
```

**Props:**

- `value`: string (bindable)
- `label`: string
- `type`: text, email, password, number, search, tel, url
- `placeholder`: string
- `required`: boolean
- `disabled`: boolean
- `error`: string (mensaje de error)
- `hint`: string (texto de ayuda)

### Dialog

Modal accesible con focus trap y soporte de teclado (Melt UI).

```svelte
<script>
  import { Dialog, Button } from '$lib/components/ui';

  let open = $state(false);
</script>

<Button onclick={() => (open = true)}>Abrir Dialog</Button>

<Dialog
  bind:open
  title="Confirmar acción"
  description="¿Estás seguro de que deseas continuar?"
  closeOnOutsideClick={true}
  closeOnEscape={true}
>
  <div>
    <p>Contenido del dialog aquí</p>
    <Button onclick={() => (open = false)}>Cerrar</Button>
  </div>
</Dialog>
```

**Props:**

- `open`: boolean (bindable)
- `title`: string
- `description`: string
- `closeOnOutsideClick`: boolean (default: true)
- `closeOnEscape`: boolean (default: true)
- `onOpenChange`: (open: boolean) => void

**Accesibilidad:**

- ✅ Focus trap automático
- ✅ ESC para cerrar
- ✅ Click fuera para cerrar
- ✅ ARIA labels y roles

### Tabs

Pestañas accesibles con navegación por teclado (Melt UI).

```svelte
<script>
  import { Tabs } from '$lib/components/ui';

  const tabs = [
    {
      value: 'general',
      label: 'General',
      content: () => import('./GeneralTab.svelte'),
    },
    {
      value: 'advanced',
      label: 'Avanzado',
      content: () => import('./AdvancedTab.svelte'),
    },
    {
      value: 'disabled',
      label: 'Deshabilitado',
      disabled: true,
    },
  ];

  let activeTab = $state('general');
</script>

<Tabs {tabs} bind:value={activeTab} onValueChange={(val) => console.log('Tab changed:', val)} />
```

**Props:**

- `tabs`: Array de { value, label, content?, disabled? }
- `value`: string (bindable)
- `onValueChange`: (value: string) => void

**Accesibilidad:**

- ✅ Navegación con flechas
- ✅ Home/End para primera/última tab
- ✅ ARIA roles (tablist, tab, tabpanel)

## Design Tokens

Los tokens CSS están definidos en `tokens.css` e incluyen:

### Colores

- `--color-primary-*`: Azul primario (50-900)
- `--color-neutral-*`: Grises (50-900)
- `--color-success`, `--color-warning`, `--color-error`, `--color-info`
- `--color-surface`, `--color-background`, `--color-border`
- `--color-text-primary/secondary/tertiary`

### Espaciado

- `--spacing-{1-20}`: desde 4px hasta 80px

### Tipografía

- `--font-sans`, `--font-mono`
- `--font-size-{xs-4xl}`
- `--font-weight-{normal,medium,semibold,bold}`
- `--line-height-{tight,normal,relaxed}`

### Otros

- `--radius-{sm,base,md,lg,xl,full}`: Border radius
- `--shadow-{sm,base,md,lg,xl}`: Sombras
- `--transition-{fast,base,slow}`: Transiciones
- `--z-{dropdown,sticky,fixed,modal,popover,tooltip}`: Z-index

## Importar tokens

En tu `+layout.svelte` o componente raíz:

```svelte
<script>
  import '$lib/components/ui/tokens.css';
</script>
```

## Buenas prácticas

1. **Accesibilidad**: Siempre incluye labels, ARIA labels y maneja el foco
2. **Responsive**: Los componentes son responsive por defecto
3. **Themes**: Usa los tokens CSS para mantener consistencia
4. **Snippets**: Usa Svelte 5 snippets para contenido flexible
5. **Bindable**: Usa `$bindable()` para two-way binding cuando sea necesario

## Próximos componentes

- [ ] Select/Dropdown
- [ ] Tooltip
- [ ] Popover
- [ ] Toast/Notification
- [ ] Menu/Dropdown Menu
- [ ] Accordion
- [ ] Toggle/Switch
