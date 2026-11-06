# Claude Code Instructions

Este archivo contiene instrucciones para Claude Code sobre cómo trabajar en este proyecto.

## Stack Tecnológico

- **Runtime y paquetes**: Bun ≥ 1.3 (`bun.lock` es el único lockfile)
- **Frontend**: SPA estática con SvelteKit 2.x (`adapter-static`) + Svelte 5 (runes)
- **UI**: Melt UI Next v0.44 + CSS puro con design tokens
- **Backend**: Hono (`server/http/`), que sirve la API y el SPA, + Drizzle ORM + `bun:sqlite`
- **Validación**: Zod para contracts de API

## Patrones Obligatorios

### 1. Validación con Zod (endpoints PATCH/POST)

```typescript
// server/contracts/[recurso].ts
import * as z from 'zod';
import { cuitSchema, dateStringSchema } from './schemas.js';

export const MiSchema = z.object({
  campo: cuitSchema.optional(),
  // ...
});

// En la ruta Hono (server/http/routes/[recurso].ts)
import { MiSchema, formatZodError } from '../../contracts/index.js';

const body: unknown = await c.req.json().catch(() => null);
const result = MiSchema.safeParse(body);
if (!result.success) {
  return c.json(formatZodError(result.error), 400);
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
│   ├── schemas.ts               # Schemas reutilizables
│   └── mi-recurso.ts
├── database/
│   ├── schema.ts
│   └── repositories/
├── http/
│   ├── app.ts
│   └── routes/                  # Un router Hono por recurso
└── services/

shared/src/                      # Código común a cliente y server (`@shared`)
```

## Base de Datos

- **Tablas principales**: `facturas`, `files`, `file_extraction_results`, `expected_invoices`, `emisores`, `categories`, `invoice_tax_lines`, `reconciliation_acks`
- **ORM**: Drizzle con repositorios en `server/database/repositories/`
- **Migraciones**: `bun run db:migrate` no es confiable porque el tracking está roto (ver #209); hoy el SQL de cada migración se aplica a mano

## Testing

### CUITs de prueba (NUNCA usar datos reales)
- Persona: `20-12345678-9`
- Empresa: `30-12345678-9`
- Monotributista: `23-12345678-9`

### Base de datos de test
Los tests usan `database.test.sqlite` automáticamente (detecta `VITEST=true`).

## Comandos

```bash
bun run dev          # Cliente (Vite)
bun run dev:hono     # API (Hono)
bun run check        # svelte-check; el server solo en modo --dry
bun run lint         # ESLint
bun run format       # Prettier
bun run test         # Tests del server
bun run db:migrate   # Migraciones (ver #209)
bun run db:studio    # GUI Drizzle

cd server && bun run typecheck   # TypeScript del server
cd client && bun run test:run    # Tests del cliente
```

## Workflow Obligatorio con Git

### Flujo de trabajo
**Siempre** seguir este orden, sin excepciones:

1. `git checkout main && git pull`
2. `git checkout -b <tipo>/<descripcion-corta>` (ej: `fix/qr-pdf-scale`, `feat/nueva-feature`)
3. Implementar en commits incrementales (un commit por paso lógico)
4. Push del branch: `git push -u origin <branch>`
5. Crear PR con `gh pr create`
6. Completar el Post-PR Checklist

**Nunca** commitear directo a `main`. **Nunca** empezar a escribir código sin crear el branch primero.

### Modelo de trabajo con agentes
Este proyecto usa un esquema de dos niveles:

- **Opus** (planificación): diseña el plan, define el approach, verifica el resultado final (QA)
- **Sonnet/Haiku** (ejecución): implementa el plan

Cuando Claude recibe una tarea de implementación no trivial, debe:
1. Pensar el plan antes de tocar código
2. Ejecutar en pasos verificables
3. Dejar el resultado en un estado que Opus pueda revisar (branch pusheado, PR abierto)

El objetivo es reducir interacción innecesaria: el usuario no debería tener que recordar el flujo ni hacer de QA manual.

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
