# Melt UI Migration Status

Migración de `@melt-ui/svelte` (v0.86.6) a `melt` (v0.42.0) - Melt UI Next para Svelte 5

## Estado de Componentes

### ✅ Migrados a Melt Next

- **Button** - Solo HTML/CSS, sin dependencias Melt
- **Input** - Solo HTML/CSS, sin dependencias Melt
- **Dropdown** - Usa `Popover` de melt/builders con `floatingConfig`
- **Tabs** - Usa `Tabs` de melt/builders con nueva API
- **Sidebar** - Solo HTML/CSS, sin dependencias Melt

### ⚠️ Pendientes

- **Dialog** - Usa `createDialog` de @melt-ui/svelte viejo
  - **Nota**: No existe Dialog en melt next aún
  - **Opciones**:
    1. Mantener con melt viejo temporalmente
    2. Usar `<dialog>` HTML nativo
    3. Construir custom con Popover + modal overlay

## Sintaxis Nueva vs Vieja

### Melt Viejo (v0.86.6)

```svelte
import { createTabs, melt } from '@melt-ui/svelte';

const { elements, states } = createTabs(...);
<div use:melt={$root}>
  <button use:melt={$trigger}>
```

### Melt Next (v0.42.0)

```svelte
import { Tabs } from 'melt/builders';

const tabs = new Tabs(...);
<div {...tabs.triggerList}>
  <button {...tabs.getTrigger(id)}>
```

## Beneficios de Melt Next

1. **Diseñado para Svelte 5**: Usa runes nativos ($state, $derived, etc)
2. **API más simple**: Spread attributes en lugar de `use:melt`
3. **TypeScript mejorado**: Mejor inferencia de tipos
4. **Sin stores**: Usa propiedades reactivas directas
5. **Más liviano**: Menos overhead runtime

## Builders Disponibles en Melt Next

- Accordion
- Avatar
- Collapsible
- Combobox
- FileUpload
- PinInput
- **Popover** ← usado para Dropdown
- Progress
- RadioGroup
- Select
- Slider
- SpatialMenu
- **Tabs** ← migrado
- Toaster
- Toggle
- Tooltip
- Tree

## Builders NO Disponibles (aún)

- Dialog / Modal
- DropdownMenu (se usa Popover)
- NavigationMenu
- ContextMenu
- Menubar

## Próximos Pasos

1. ✅ Migrar Dropdown a Popover
2. ✅ Migrar Tabs al nuevo API
3. ✅ Limpiar imports de melt viejo
4. ⏳ Decidir estrategia para Dialog
5. ⏳ Testear en todas las páginas demo
6. ⏳ Documentar patrones comunes

## Referencias

- Documentación oficial: https://next.melt-ui.com/
- GitHub: https://github.com/melt-ui/next-gen
- Migration guide: (pendiente oficial)
