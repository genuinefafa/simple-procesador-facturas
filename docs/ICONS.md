# Sistema de Iconos

Este proyecto usa **lucide-svelte** para todos los iconos de la aplicación.

## Instalación

Ya incluido en el proyecto. No requiere instalación adicional.

## Uso Básico

### Import desde el sistema centralizado

```svelte
<script>
  import { Check, X, Search } from '$lib/components/icons';
</script>

<Check size={16} />
<X size={20} class="text-error" />
<Search size={18} />
```

### Con componente dinámico (Svelte 5 runes)

```svelte
<script>
  import { Check, X } from '$lib/components/icons';

  let isValid = $state(true);
  const StatusIcon = $derived(isValid ? Check : X);
</script>

<StatusIcon size={16} />
```

### En estructuras de datos

```typescript
import { Home, Users, FileText } from '$lib/components/icons';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Home },
  { href: '/users', label: 'Usuarios', icon: Users },
];
```

```svelte
{#each navItems as item}
  <item.icon size={20} />
  {item.label}
{/each}
```

## Tamaños Estándar

| Constante | Pixels | Uso típico |
|-----------|--------|------------|
| `xs` | 14 | Badges, indicadores inline, texto pequeño |
| `sm` | 16 | Botones pequeños, listas, tablas |
| `md` | 20 | Botones, navegación, acciones |
| `lg` | 24 | Headers, acciones principales |

```typescript
import { ICON_SIZES } from '$lib/components/icons';

// ICON_SIZES.xs = 14
// ICON_SIZES.sm = 16
// ICON_SIZES.md = 20
// ICON_SIZES.lg = 24
```

## Referencia de Iconos

### Navegación

| Icono | Componente | Uso |
|-------|------------|-----|
| ← | `ChevronLeft`, `ArrowLeft` | Volver, anterior |
| → | `ChevronRight` | Siguiente, avanzar |
| ▼ | `ChevronDown` | Desplegables |
| ▲ | `ChevronUp` | Colapsar |

### Estado / Indicadores

| Icono | Componente | Uso |
|-------|------------|-----|
| ✓ | `Check` | Éxito, selección, confirmación |
| ✗ | `X` | Cerrar, error, cancelar |
| ⚠ | `AlertTriangle` | Advertencias, alertas |
| — | `Minus` | Sin datos, vacío |
| ℹ | `Info` | Información |

### Estados de Resultado

| Icono | Componente | Uso |
|-------|------------|-----|
| ✅ | `CheckCircle` | Operación exitosa |
| ❌ | `XCircle` | Error, fallo |
| ⚠️ | `AlertCircle` | Advertencia con círculo |
| ⏳ | `Loader2` | Cargando (usar con `animate-spin`) |

### Archivos / Documentos

| Icono | Componente | Uso |
|-------|------------|-----|
| 📄 | `FileText` | Documento, factura, PDF |
| 📊 | `FileSpreadsheet` | Hoja de cálculo, Excel |
| 🖼️ | `Image` | Imagen |
| 📁 | `Folder` | Carpeta, directorio |
| 📋 | `ClipboardList` | Lista, clipboard |

### Acciones

| Icono | Componente | Uso |
|-------|------------|-----|
| 🔍 | `Search` | Buscar |
| 💾 | `Save` | Guardar |
| 🗑️ | `Trash2` | Eliminar |
| ⬇️ | `Download` | Descargar |
| ⬆️ | `Upload` | Subir |
| + | `Plus` | Agregar, nuevo |
| 👁 | `Eye` | Ver, previsualizar |
| ✏️ | `Edit` | Editar |
| 🔄 | `RefreshCw`, `RotateCw` | Actualizar, sincronizar |

### UI / Navegación

| Icono | Componente | Uso |
|-------|------------|-----|
| 🏠 | `Home` | Inicio, dashboard |
| 👥 | `Users` | Usuarios, emisores |
| 👤 | `User` | Usuario individual |
| 🏢 | `Building2` | Empresa, edificio |
| ☰ | `Menu` | Menú hamburguesa |
| ☁️ | `Cloud` | Nube, sincronización |
| 📦 | `Package` | Paquete, exportar |
| 📭 | `Inbox` | Bandeja vacía |

## Agregar Nuevos Iconos

1. Buscar el icono en [lucide.dev/icons](https://lucide.dev/icons)
2. Agregar el export en `client/src/lib/components/icons/index.ts`:
   ```typescript
   export {
     // ... iconos existentes
     NuevoIcono,
   } from 'lucide-svelte';
   ```
3. Documentar en esta guía si es de uso común

## Prohibiciones

- **NO usar** Unicode emoji como iconos (`📄`, `✓`, `←`, etc.)
- **NO usar** HTML entities (`&times;`, `&check;`)
- **NO usar** iconos inline como strings
- **NO usar** otros paquetes de iconos (Font Awesome, etc.)

## Props de Lucide

Los componentes de lucide-svelte aceptan estas props:

| Prop | Tipo | Default | Descripción |
|------|------|---------|-------------|
| `size` | `number \| string` | 24 | Tamaño en pixels |
| `strokeWidth` | `number` | 2 | Grosor del trazo |
| `class` | `string` | - | Clases CSS |
| `color` | `string` | currentColor | Color del icono |

```svelte
<Check
  size={16}
  strokeWidth={2.5}
  class="text-success"
/>
```

## Animaciones

Para iconos de carga, usar la clase `animate-spin`:

```svelte
<Loader2 size={16} class="animate-spin" />
```

O definir la animación en CSS:

```css
:global(.spin) {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
```

---

Última actualización: 2026-02-02
