# Claude Code Instructions

Este archivo contiene instrucciones para Claude Code sobre cómo trabajar en este proyecto.

## Stack Tecnológico

- **Frontend**: SvelteKit 2.x + Svelte 5 (runes)
- **UI**: Melt UI Next v0.44 + CSS puro con design tokens
- **Backend**: Node.js 22.x + Drizzle ORM + SQLite
- **Validación**: Zod para contracts de API

## Patrones Obligatorios

### 1. Validación con Zod (endpoints PATCH/POST)

```typescript
// server/contracts/[recurso].ts
import { z } from 'zod';
import { cuitSchema, dateStringSchema } from './shared';

export const MiSchema = z.object({
  campo: cuitSchema.optional(),
  // ...
});

// En el endpoint
import { MiSchema, formatZodError } from '@server/contracts';

const result = MiSchema.safeParse(body);
if (!result.success) {
  return json(formatZodError(result.error), { status: 400 });
}
```

### 2. Interface Segregation (componentes con múltiples modos)

Crear `Componente.types.ts` con tipos separados:

```typescript
// ViewData vs CreateData
interface ViewData { id: number; /* ... */ }
interface CreateData { id?: never; /* ... */ }
type Data = ViewData | CreateData;
```

### 3. Dependency Injection (navegación/acciones)

Callbacks opcionales con comportamiento por defecto:

```typescript
type Props = {
  onnavigate?: (targetId: string | null) => void;
};

function navigate(id: string | null) {
  if (onnavigate) {
    onnavigate(id);
  } else {
    goto(`/comprobantes/${id}`);
  }
}
```

### 4. Servicios de Cliente (llamadas API repetidas)

```typescript
// client/src/lib/services/MiService.ts
class MiService {
  async metodo(): Promise<ApiResult<T>> { /* ... */ }
}
export const miService = new MiService();
```

### 5. URL como Fuente de Verdad (estado de navegación)

Para drawers, modales con contexto, filtros: derivar estado de la URL.

```typescript
import { goto } from '$app/navigation';
import { page } from '$app/state';

// ✅ Derivar de URL
let selectedId = $derived(page.url.searchParams.get('selected'));

$effect(() => {
  if (selectedId) loadData(selectedId);
});

function openDrawer(id: string) {
  goto(`?selected=${id}`);  // pushState por defecto
}

function closeDrawer() {
  goto('/ruta-base');
}
```

Ver [docs/PATTERNS.md](./docs/PATTERNS.md#5-url-como-fuente-de-verdad-navigation-state) para más detalle.

## Prohibiciones

### UI/UX
- ❌ `alert()`, `confirm()`, `prompt()` → Usar Dialog de Melt UI
- ❌ `window.location.href` → Usar `goto()` de `$app/navigation`
- ❌ `history.pushState()` → Usar `goto()` (ver patrón #5)
- ❌ Tailwind classes
- ❌ Valores CSS hardcoded → Usar tokens de `tokens.css`

### Iconos
- ❌ Unicode emoji como iconos (`📄`, `✓`, `←`, `🔍`, etc.) → Usar lucide-svelte
- ❌ HTML entities (`&times;`, `&check;`) → Usar componentes de `$lib/components/icons`

### Svelte
- ❌ Stores (`writable`, `derived`) para estado local → Usar runes (`$state`, `$derived`)
- ❌ Slots → Usar snippets

### Código
- ❌ `any` sin justificación
- ❌ Datos reales en tests (CUITs, nombres, etc.)

## Convenciones

### Idioma
- **Commits**: Inglés (`feat(scope): description`)
- **PRs/Issues**: Español argentino formal
- **Código/comentarios**: Inglés

### Formateo de datos
Usar funciones de `client/src/lib/formatters.ts`:
- `formatCurrency()` → $1.234,56
- `formatCuit()` → 30-12345678-9
- `formatDateShort()` → 15/dic
- `getFriendlyType()` → FACA, FACB

### Nombres de archivo
- Componentes: `PascalCase.svelte`
- Tipos: `PascalCase.types.ts`
- Servicios: `PascalCase.ts` en `lib/services/`
- Contracts: `kebab-case.ts` en `server/contracts/`

### Iconos
- Importar desde `$lib/components/icons` o `$lib/components`
- Tamaños estándar: xs (14), sm (16), md (20), lg (24)
- Ver [docs/ICONS.md](./docs/ICONS.md) para referencia completa

## Estructura de Archivos

```
client/src/lib/
├── components/
│   ├── MiComponente.svelte
│   └── MiComponente.types.ts    # Si tiene múltiples modos
├── services/
│   └── MiService.ts
└── formatters.ts

server/
├── contracts/
│   ├── index.ts                 # Re-exporta todo
│   ├── shared.ts                # Schemas reutilizables
│   └── mi-recurso.ts
├── database/
│   ├── schema.ts
│   └── repositories/
└── services/
```

## Base de Datos

- **Tablas principales**: `invoices`, `files`, `file_extraction_results`, `expected_invoices`, `emitters`, `categories`
- **ORM**: Drizzle con repositorios en `server/database/repositories/`
- **Migraciones**: `npm run db:migrate`

## Testing

### CUITs de prueba (NUNCA usar datos reales)
- Persona: `20-12345678-9`
- Empresa: `30-12345678-9`
- Monotributista: `23-12345678-9`

### Base de datos de test
Los tests usan `database.test.sqlite` automáticamente (detecta `VITEST=true`).

## Comandos

```bash
npm run dev          # Desarrollo
npm run check        # TypeScript
npm run lint         # ESLint
npm run format       # Prettier
npm run db:migrate   # Migraciones
npm run db:studio    # GUI Drizzle
```

## Post-PR Checklist

After creating or merging a PR, always:

1. **Update [ROADMAP.md](./ROADMAP.md)**: Mark completed items, add new issues, update dates
2. **Create issues for known tech debt** discovered during implementation
3. **Link issues in code comments** (`TODO: See issue #NNN`) when deferring work

This ensures the roadmap stays in sync and deferred work is tracked, not forgotten.

## Issues Abiertos Relevantes

Ver [ROADMAP.md](./ROADMAP.md) para la lista actualizada de issues y prioridades.

## Referencias

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) - Arquitectura completa
- [docs/PATTERNS.md](./docs/PATTERNS.md) - Patrones SOLID detallados
- [docs/UI_UX.md](./docs/UI_UX.md) - Guías de UI/UX
- [docs/ICONS.md](./docs/ICONS.md) - Sistema de iconos (lucide-svelte)
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Guía para contributors
