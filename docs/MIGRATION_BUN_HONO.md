# Migración: SvelteKit → Svelte 5 + Hono + Bun

> Plan acordado en sesión 2026-05-13. Branch: `feat/migrate-bun-hono`. Estrategia: PR único largo con commits incrementales.

## Motivación

Ver `~/Develop/homelab/claude-context/personal/procesador-facturas.md` sección "Decisión 2026-05-13". Resumen:

- Bundle Kit pesado y `__dirname` post-build rompe paths runtime (issue #180 A).
- Inlining ESM/CJS de `libheif-bundle.js` en chunk SSR rompe `/api/comprobantes` (issue #180 B).
- Proyecto NO usa features Kit fuertes (sin `+page.server.ts`, sin form actions, sin hooks).
- Bun resuelve CJS/ESM nativo y corre TS sin tsx/tsc.

La migración resuelve #180 A+B en el camino, no como tareas separadas.

## Inventario actual (snapshot 2026-05-13)

### Pages (6)
```
client/src/routes/+page.svelte                       (dashboard)
client/src/routes/comprobantes/+page.svelte
client/src/routes/comprobantes/[id]/+page.svelte
client/src/routes/emisores/+page.svelte
client/src/routes/emisores/[id]/+page.svelte
client/src/routes/ui-demo/+page.svelte
```

### API routes (31) — todas son `+server.ts` thin handlers
```
/api/categories
/api/comprobantes/[id]/file
/api/comprobantes
/api/emisores/[id]
/api/emisores/[id]/archivos
/api/emisores/[id]/archivos/rename
/api/emisores
/api/expected-invoices/[id]
/api/expected-invoices/[id]/balance/[memberId]
/api/expected-invoices/[id]/balance
/api/expected-invoices/[id]/match
/api/expected-invoices
/api/expected-invoices/import
/api/expected-invoices/search
/api/expected-invoices/template
/api/files/[...path]
/api/files/[id]
/api/files/[id]/matches
/api/files
/api/files/hash/[hash]
/api/invoices-known
/api/invoices-known/category
/api/invoices/[id]
/api/invoices/[id]/emisor
/api/invoices
/api/invoices/[id]/emisor
/api/invoices/export
/api/invoices/from-file/[fileId]
/api/invoices/pending
/api/invoices/process
/api/invoices/qr-paste/[fileId]
/api/invoices/search
/api/invoices/upload
```

Todas siguen el mismo patrón:
```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Repo } from '@server/database/repositories/...';

export const GET: RequestHandler = async ({ url, params }) => { ... };
```

### Features Kit usadas (`$app/*`)
```
$app/environment   → solo `browser`
$app/navigation    → `goto`
$app/state         → `page` (URL como fuente de verdad)
$app/stores        → `page` legado (a migrar a $app/state)
```

13 archivos importan algo de `$app/*`. Mapping en sección "Reemplazos" abajo.

### Load functions (4) — todas triviales
- `client/src/routes/+page.ts`
- `client/src/routes/comprobantes/+page.ts`
- `client/src/routes/comprobantes/[id]/+page.ts`
- `client/src/routes/emisores/+page.ts`

Todas hacen `fetch('/api/...')` y devuelven el JSON. Reemplazables por `$effect` + `$state` en componente.

### Layouts y hooks
- `+layout.svelte` (1) — barra de navegación, sidebar.
- `+layout.ts` (1) — `prerender = false` y `ssr = false` (config plana).
- NO `+layout.server.ts`, NO `+page.server.ts`, NO `hooks.server.ts`, NO form actions.

### Adapter actual
`@sveltejs/adapter-node` → `client/build/{server,client}/...`. El bundle SSR mete `libheif-bundle.js` inline ⇒ rompe en runtime (issue #180 B).

## Stack destino

| Capa | Antes | Después |
|------|-------|---------|
| Runtime servidor | Node 22 | Bun 1.x |
| HTTP framework | SvelteKit (adapter-node) | Hono |
| UI | Svelte 5 + Kit router | Svelte 5 + router liviano (sv-router/tinro) |
| Bundling client | Vite + plugin Kit | Vite + plugin Svelte plain |
| Dev | `vite dev` | `bun run dev` (Hono `--watch` + Vite) |
| TypeScript | tsx + tsc | Bun nativo |

### Dependencias a evaluar (consultar antes de instalar)
- `hono` — micro framework HTTP, runtime-agnostic.
- `@hono/node-server` o nativo Bun.
- Router cliente: `sv-router` vs `tinro` vs `svelte-routing`. **Pendiente decisión.**
- `bun` — runtime.

CLAUDE.md global: pedir aprobación antes de agregar deps. Esta sección documenta la lista propuesta, NO las instala.

## Reemplazos $app/*

| Kit | Reemplazo |
|-----|-----------|
| `import { goto } from '$app/navigation'` | `router.navigate(path)` (a definir según router) |
| `import { page } from '$app/state'` (Svelte 5) | `getRouter()` con stores reactivos del router elegido |
| `import { page } from '$app/stores'` (legacy) | Migrar a equivalente del router (eliminar `$page` global) |
| `import { browser } from '$app/environment'` | `typeof window !== 'undefined'` o variable expuesta por router |

`+page.ts` → eliminar archivo, mover fetch a `$effect` en `+page.svelte` (renombrar a `Page.svelte` sin convención `+`).

`$types` (`PageLoad`, `RequestHandler`) → eliminar, no son necesarios fuera de Kit. Tipos de Hono (`Context`) reemplazan `RequestHandler`.

## Mapping API routes Kit → Hono

Antes:
```ts
// client/src/routes/api/invoices/+server.ts
export const GET: RequestHandler = async ({ url }) => {
  const fileId = url.searchParams.get('fileId');
  return json({ ok: true });
};
```

Después:
```ts
// server/http/routes/invoices.ts
import { Hono } from 'hono';
import { InvoiceRepository } from '../../database/repositories/invoice.js';

export const invoicesRouter = new Hono()
  .get('/', async (c) => {
    const fileId = c.req.query('fileId');
    return c.json({ ok: true });
  });
```

Todo el código de `@server/database/repositories/*` queda igual. Sólo cambia el handler HTTP.

## Estructura de archivos destino

```
server/
├── http/                       ← NUEVO
│   ├── app.ts                  ← Hono app + middlewares
│   ├── server.ts               ← Bun.serve / @hono/node-server
│   └── routes/
│       ├── categories.ts
│       ├── comprobantes.ts
│       ├── emisores.ts
│       ├── expected-invoices.ts
│       ├── files.ts
│       ├── invoices.ts
│       └── invoices-known.ts
├── database/                   ← sin cambios
├── services/                   ← sin cambios
├── extractors/                 ← sin cambios
└── ...

client/
├── src/
│   ├── app.html                ← entry point Svelte (nuevo, sin Kit)
│   ├── routes/                 ← Svelte components, sin convención `+`
│   │   ├── Layout.svelte
│   │   ├── Dashboard.svelte
│   │   ├── Comprobantes.svelte
│   │   ├── ComprobanteDetail.svelte
│   │   ├── Emisores.svelte
│   │   ├── EmisorDetail.svelte
│   │   └── UiDemo.svelte
│   ├── router.ts               ← config router
│   └── lib/                    ← sin cambios mayores
└── vite.config.ts              ← sin plugin Kit
```

## Resolución issue #180 dentro de la migración

### A — `__dirname` en paths runtime
Bun corre TS nativo, no hay bundle SSR. `db.ts` puede usar `import.meta.dirname` (Bun lo soporta) o resolver desde `process.cwd()` con env `DB_PATH` respetada. Sin bundling intermedio, los paths funcionan como en dev.

**Cambios concretos:**
- `server/database/db.ts:join(__dirname, ...)` → `process.env.DB_PATH ?? join(import.meta.dirname, '../..', 'data', 'database.sqlite')`
- Mismo tratamiento en `connection.ts`, `db-test.ts`, `seed.ts`.

### B — libheif inlining
Hono no bundlea código servidor (Bun lo carga directo). `libheif-bundle.js` no se inlinea en ningún chunk SSR porque no existe chunk SSR.

**Decisión adicional:** evaluar reemplazar `heic-convert`/`heic-decode`/`libheif-js` por `sharp` (ya en `external`, soporta HEIC vía libvips). Reduce superficie de deps. Pendiente confirmar con usuario antes de hacerlo.

### C — googleapis OOM
Ya resuelto por PR #181. No aplica acá.

### D — Docs deploy
Crear `DEPLOY.md` al final de la migración, ya con instrucciones Bun + Hono.

## Orden de ejecución (commits incrementales)

> Único PR largo. Cada commit deja el repo en estado coherente — el dev viejo Kit sigue funcionando hasta el corte final.
>
> **Pre-requisito:** issue #182 (drop tabla huérfana `facturas_zonas_anotadas`) se cierra en un PR propio antes de arrancar la migración. Base limpia.

1. **`docs(migration): plan Bun+Hono`** — este archivo.
2. **`chore: add Bun + Hono deps`** — `package.json` workspace root + `server/package.json`. Pedir aprobación al usuario.
3. **`feat(server): bootstrap Hono app paralela`** — `server/http/app.ts` + `server.ts` levantando en otro puerto. Sin migrar rutas todavía.
4. **`feat(server): port API routes a Hono (batch 1: invoices/files)`** — espejar handlers, mantener Kit en paralelo.
5. **`feat(server): port API routes a Hono (batch 2: emisores/categorías/expected)`** — completar las 31.
6. **`feat(server): fix #180 A — paths runtime con import.meta.dirname`** — DB/connection/seed.
7. **`feat(server): drop libheif, migrar HEIC a sharp`** — fix #180 B. Aprobado: drop `heic-convert`, `heic-decode`, `libheif-js`.
8. **`chore: switch deploy a Hono, drop adapter-node`** — actualizar Dockerfile + scripts.
9. **`feat(client): swap router Kit → router liviano`** — convertir 6 pages, eliminar `+page.ts`. **Spike previo:** probar `sv-router` y `tinro` con 1 page cada uno, decidir antes del swap masivo.
10. **`refactor(client): replace $app/* imports`** — los 13 archivos.
11. **`chore: drop SvelteKit deps`** — quitar `@sveltejs/*`, `svelte-kit`. Vite plugin a `@sveltejs/vite-plugin-svelte` plain.
12. **`docs: actualizar DEPLOY.md y CLAUDE.md con stack nuevo`**

## Riesgos y unknowns

- **Router cliente**: ninguna opción es 1:1 con Kit. `sv-router` parece más cercano (filesystem routes) pero menos maduro. `tinro` es minimalista pero declarativo. **Decisión deferida**: spike con ambos en el paso 9 (1 page por opción) y elegir ahí.
- **SSR**: hoy `+layout.ts` declara `ssr = false`. La SPA pura post-migración sigue ese modelo. **Sin SSR, sin SEO** — el proyecto es interno, OK.
- **Static file serving** (`/api/files/[...path]`, `/api/comprobantes/[id]/file`): Hono sirve binarios con `c.body(stream)`. Confirmar que el rendimiento es comparable.
- **Vitest**: tests del workspace `server` no dependen de Kit. Bun-compat: `vitest` corre bien bajo Bun. Si hay fricción, mantener Node para test runner.
- **Pre-commit hook svelte-check**: `svelte-check` usa el preprocessor de Vite, no Kit-específico. Debería seguir andando con `@sveltejs/vite-plugin-svelte` plain.
- **`@server` alias**: definido en `svelte.config.js` y `vite.config.ts`. Sin Kit, queda solo en `vite.config.ts` + `tsconfig.json` paths.
- **Dockerfile**: actualizar a `oven/bun:1` base. Build phase y runtime convergen (Bun no necesita stage de bundle).

## Estimación

2-3 días concentrados. Más horas en pasos 4-5 (port mecánico de 31 routes) y paso 9 (router cliente).

## Estado

- [x] Plan documentado (commit `f93bbcd`)
- [x] Deps Hono instaladas (commit `59d7a84`) — `hono@4.12.18`, `@hono/node-server@2.0.2`, `@hono/zod-validator@0.8.0`
- [x] Bootstrap Hono paralelo (commit `9c8a914`) — health `GET /api/_hono/health` validado en `localhost:3001`
- [x] PR #182 cerrado (PR #184 mergeado) — base limpia
- [ ] Port API routes a Hono (commits 4-5, las 31 rutas)
- [ ] Fix #180 A — paths runtime con `import.meta.dirname` (commit 6)
- [ ] Drop libheif, migrar HEIC a sharp (commit 7) — **aprobado**
- [ ] Switch deploy a Hono, drop adapter-node (commit 8)
- [ ] Spike router cliente (sv-router vs tinro) + swap (commit 9)
- [ ] Reemplazar `$app/*` imports (commit 10)
- [ ] Drop deps SvelteKit (commit 11)
- [ ] Actualizar DEPLOY.md + CLAUDE.md (commit 12)

### Cómo verificar el bootstrap (estado actual del branch)

```bash
npm run dev:hono           # Hono en :3001 (default, override con HONO_PORT)
curl localhost:3001/api/_hono/health
# {"status":"ok","backend":"hono","version":"0.0.0"}
```

`npm run dev` (Kit) sigue corriendo en su puerto sin interferencia.

### Próximo paso para retomar

1. Verificar el bootstrap con `npm run dev:hono` + curl al health.
2. Commit 4 — port batch 1 de API routes (sugerencia: `invoices` + `files`, las más usadas). Patrón:
   - Crear `server/http/routes/invoices.ts` espejando `client/src/routes/api/invoices/+server.ts`.
   - Montar con `app.route('/api/invoices', invoicesRouter)` en `server/http/app.ts`.
   - Verificar respuesta en `localhost:3001/api/invoices` vs `localhost:5174/api/invoices` (Kit).
   - Mantener ambos handlers vivos hasta que se hayan portado todos los recursos.
3. NO borrar los handlers Kit todavía — el corte definitivo es el commit 8 (deploy switch).
