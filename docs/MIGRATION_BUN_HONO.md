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

**Decisión 2026-05-14**: NO migrar a sharp. Sharp prebuilt 0.34.5 NO decodifica HEIC sin libde265/libheif sistema (`heif: Error while loading plugin: Support for this compression format has not been built in`). Solo AVIF anda out-of-box. Migrar requeriría agregar libheif + libde265 al Dockerfile y aumentar superficie de deploy.

Smoke con `heic-convert` bajo tsx (sin bundle) **funciona**: archivo HEIC Coto 117KB → JPEG 297KB válido (`scripts/debug/heic-smoke.ts`). El bug B se resuelve solo al eliminar el bundle SSR de Kit. Decisión: mantener `heic-convert` / `libheif-js`. Commit 7 del plan original **se descarta**.

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
7. ~~**`feat(server): drop libheif, migrar HEIC a sharp`**~~ — **DESCARTADO 2026-05-14**. Sharp prebuilt no decodifica HEIC sin codec sistema; `heic-convert` (libheif-js) anda OK sin bundle. Ver sección "Resolución issue #180 → B".
8. **`chore: switch deploy a Hono, drop adapter-node`** — actualizar Dockerfile + scripts.
9. **`feat(client): swap router Kit → router liviano`** — convertir 6 pages, eliminar `+page.ts`. **Spike previo:** probar `sv-router` y `tinro` con 1 page cada uno, decidir antes del swap masivo.
10. **`refactor(client): replace $app/* imports`** — los 13 archivos.
11. **`chore: drop SvelteKit deps`** — quitar `@sveltejs/*`, `svelte-kit`. Vite plugin a `@sveltejs/vite-plugin-svelte` plain.
12. **`docs: actualizar DEPLOY.md y CLAUDE.md con stack nuevo`**

## Riesgos y unknowns

- **`better-sqlite3` incompatible con Bun** (descubierto 2026-05-14 al smoke-testear Hono bajo Bun): `bun run http/server.ts` levanta el server OK, health responde, pero cualquier endpoint que toque la DB explota con `ERR_DLOPEN_FAILED: 'better-sqlite3' is not yet supported in Bun` (ver oven-sh/bun#4290). Bajo Node (tsx) sigue funcionando. **Decisión pendiente**: migrar driver a `drizzle-orm/bun-sqlite` (usa `bun:sqlite` nativo) cuando se haga el switch de runtime, o mantener Node como runtime servidor y usar Bun solo para package manager + dev tooling. El driver Drizzle existe (`drizzle-orm/bun-sqlite`), API casi idéntica a better-sqlite3. **Bloqueante para commit 8 (deploy switch a Bun)**, no para commits 6-7.
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
- [x] Port API routes batch 1 (commit `def2b5a`) — `/api/invoices/*` (10 rutas) + `/api/files/*` (5 rutas)
- [x] Port API routes batch 2 (commit `8f4c95f`) — 17 rutas restantes en `server/http/routes/{categories,comprobantes,emisores,expected-invoices,invoices-known}.ts`. Total 32 endpoints en Hono (15 + 17)
- [x] Fix scripts root para Bun (commit `6903068`) — reemplazado `npm run X -w workspace` por `cd workspace && npm run X` (Bun rebote infinito con flag `-w`). Smoke OK con `bun run dev`, `bun run lint`, `bun run format:check`. npm sigue funcionando.
- [x] Fix #180 A — paths runtime con `import.meta.dirname` (commit `2e73d86`) — `db.ts`, `connection.ts`, `db-test.ts`, `migrate.ts`, `seed.ts`. Drop `fileURLToPath` boilerplate. `DB_PATH` env var override agregado en `db.ts`/`connection.ts`/`seed.ts` (test mode ignora env). Validado bajo tsx (Node) y Bun: `import.meta.dirname` resuelve correcto; tests 163/163 pass.
- [x] ~~Drop libheif, migrar HEIC a sharp (commit 7)~~ — **DESCARTADO 2026-05-14**. Sharp prebuilt sin codec HEVC. `heic-convert` anda sin bundle. Smoke en `scripts/debug/heic-smoke.ts`.
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

### Handoff 2026-05-14 — arranque del commit 8

**Estado:** commits 1-6 mergeados al branch. Commit 7 descartado (heic-convert se queda). Branch `feat/migrate-bun-hono` está pusheado al HEAD `9db8451`.

**Decisiones tomadas en sesión 2026-05-14:**
- **Runtime servidor en deploy: Bun**. Implica migrar driver Drizzle a `drizzle-orm/bun-sqlite` (usa `bun:sqlite` nativo). API Drizzle casi idéntica.
- **UI: SvelteKit → adapter-static (SPA)**. `+layout.ts` ya declara `ssr = false`, así que SPA fallback es transición limpia. Hono sirve `client/build/` con `serveStatic` + fallback `index.html`. Pages Svelte siguen Kit hasta commit 9 (router swap).

**Commit 8 — descompuesto en sub-commits sugeridos:**

1. **`feat(server): migrar driver Drizzle a bun-sqlite`**
   - `server/database/db.ts`: `import { drizzle } from 'drizzle-orm/bun-sqlite'` + `import { Database } from 'bun:sqlite'`. Eliminar `better-sqlite3` import en runtime path.
   - **PROBLEMA:** Vitest corre bajo Node, NO bajo Bun. `bun:sqlite` no existe en Node. Solución: usar **import condicional** o dejar `better-sqlite3` solo para tests. Sugerencia: crear `db.bun.ts` (driver Bun) y `db.node.ts` (driver Node/test) con re-export desde `db.ts` según `typeof Bun !== 'undefined'`. O migrar vitest a `bun test` (más cambios — evaluar).
   - `migrate.ts` y `db-test.ts` usan `getDb()` → siguen funcionando.
   - Verificar: `bun run http/server.ts` + curl endpoints DB → 200.

2. **`feat(client): adapter-static + SPA fallback`**
   - `client/svelte.config.js`: `import adapter from '@sveltejs/adapter-static'` + config `{ fallback: 'index.html', strict: false }`.
   - Build: `npm run build` debe outputs `client/build/{client,prerendered}/` con `index.html`. Confirmar que `+page.ts` con `ssr=false` no rompe build.
   - Smoke: `npx http-server client/build -p 5174` y verificar que pages cargan en browser (CSR puro).

3. **`feat(server): Hono serveStatic + SPA fallback`**
   - En `server/http/app.ts`: agregar `import { serveStatic } from '@hono/node-server/serve-static'` (o el equivalente Bun). Mount en `/`: `app.use('*', serveStatic({ root: 'client/build/client' }))`. Fallback a `index.html` para rutas que no matchean.
   - Orden de middlewares: API routes ANTES de serveStatic. Sino el catch-all SPA se come `/api/*`.
   - Smoke local con Bun.

4. **`chore: Dockerfile a Bun`**
   - Base: `FROM oven/bun:1-alpine` (o `oven/bun:1` debian — Bun nativo, no necesita python/make/g++ para better-sqlite3 porque ya no se usa en runtime).
   - `bun install --frozen-lockfile --production` reemplaza `npm ci`. Verificar que `bun.lockb` se genera y commitea, o seguir con `package-lock.json` (Bun lo lee).
   - CMD: `["bun", "server/http/server.ts"]` (o build con `bun build`, opcional).
   - Mantener `DB_PATH=/app/data/database.sqlite` env var.
   - Healthcheck: cambiar a `bun -e "..."` o `curl localhost:3000/api/_hono/health`.

5. **`chore: CI release workflow a Bun`**
   - `.github/workflows/release.yml`: reemplazar `setup-node-deps` action por setup Bun. `oven-sh/setup-bun@v1`.
   - Build step: `bun run build` (asume scripts root ya son Bun-compat, ver commit `6903068`).
   - Verificar que el Docker build dentro del workflow usa el nuevo Dockerfile (no necesita cambios — Docker build es self-contained).

6. **`chore(server): drop better-sqlite3 + sveltekit-node deps`** (si commit 1 sub-handoff dejó better-sqlite3 solo para tests, evaluar si lo dropeamos en commit 11 cuando se eliminen deps Kit). Si test runner ya migró a `bun test`, drop ahora.

**Bloqueantes / unknowns para arrancar:**
- `bun test` vs `vitest`: ¿migramos test runner ahora o mantenemos vitest bajo Node (con better-sqlite3 vivo solo para tests)? **Sugerencia**: mantener vitest bajo Node para commit 8, drop better-sqlite3 en commit posterior cuando se elimine Kit completamente.
- `adapter-static` strict mode: si alguna page Kit usa dynamic params sin prerender + `ssr=false`, strict tira error. Usar `strict: false` para empezar.
- `serveStatic` SPA fallback: confirmar que la sintaxis Hono soporta fallback HTML — sino, agregar handler explícito `app.get('*', c => c.html(readFileSync('client/build/client/index.html')))`.

**Cómo arrancar el próximo contexto:**
1. Leer este archivo (`docs/MIGRATION_BUN_HONO.md`) y la sección "Decisión 2026-05-13" en `~/Develop/homelab/claude-context/personal/procesador-facturas.md` si necesita más motivación.
2. Branch `feat/migrate-bun-hono` ya pusheado. `git pull origin feat/migrate-bun-hono` por las dudas.
3. Arrancar por sub-commit 1 (bun-sqlite). Confirmar approach del import condicional con el usuario antes de tocar tests.

### Handoff 2026-05-15 — arranque del sub-commit 4 (Dockerfile)

**Estado:** sub-commits 1, 2 y 3 del commit 8 mergeados al branch + un fix de paths runtime. Branch `feat/migrate-bun-hono` pusheado en `6af79c3`.

**Lo hecho en sesión 2026-05-15:**

- `259dfcf feat(server): migrar Drizzle driver a bun-sqlite` — `drizzle-orm/bun-sqlite` + `bun:sqlite` en todo el runtime (`db.ts`, `connection.ts`, `migrate.ts`, `seed.ts`, `normalize-cuits.ts`). `.pragma()` → `.exec('PRAGMA ...')`. `dissolveBalanceGroup` usa `.returning().length` (bun-sqlite update retorna `void`, no `RunResult`). `@types/bun` agregado a `server/devDependencies` + `tsconfig.types: ['bun', 'node']`. `bun.lock` commiteado.
- `f594e33 feat(client): adapter-static + SPA fallback` — `adapter-node` → `adapter-static` con `fallback: 'index.html'` y `strict: false`. Output a `client/build/`. Scripts `dev`/`build`/`preview` del client ahora invocan `bun --bun vite ...` (sin `--bun` Vite arranca bajo Node y explota con `bun:sqlite` `ERR_UNSUPPORTED_ESM_URL_SCHEME`). `bun:sqlite` agregado a `rollupOptions.external` y `ssr.external` en `vite.config.ts`.
- `53fb86b feat(server): Hono serveStatic + SPA fallback` — `hono/bun/serveStatic` montado en `*` después de las rutas `/api/*`. `BUILD_DIR` desde `import.meta.dirname`. `notFound` handler: `/api/*` → 404 JSON, resto → `index.html` (SPA fallback con lazy read).
- `6af79c3 fix(server): anchor runtime paths to import.meta.dirname` — bug encontrado al probar el SPA: `process.cwd()` ya no es `client/` ahora que Hono arranca desde la raíz del repo, así que `join(cwd, '..', 'data')` apuntaba al directorio padre. Fix en `comprobantes.ts`, `files.ts`, `invoices.ts`, `expected-invoices.ts`, `invoice-file.service.ts`, `config-loader.ts`. Smoke browser: `/`, `/comprobantes`, `/emisores` cargan sin errores; PDFs servidos vía `/api/comprobantes/file:NNN/file`.

**Decisiones de la sesión:**
- **Sin import condicional**: usar `bun:sqlite` directo. Tests vitest siguen rotos bajo Node hasta sub-commit posterior (decidido: que coexistan).
- **Lockfile canónico = `bun.lock`**. `package-lock.json` se dropea en el sub-commit 4 (Dockerfile) junto a `bun install --frozen-lockfile`. Memoria: `project_bun_lockfile.md`.

**Sub-commits restantes:**
4. **`chore: Dockerfile a Bun`** — `FROM oven/bun:1` (o `-alpine`), `bun install --frozen-lockfile --production`, drop `package-lock.json`, `CMD ["bun", "server/http/server.ts"]`. Mantener `DB_PATH=/app/data/database.sqlite`. Healthcheck con `curl` o `bun -e`. Verificar que el build del client se haga en una etapa previa (multi-stage) y se copie `client/build/` al runner.
5. **`chore: CI release workflow a Bun`** — `oven-sh/setup-bun@v1` en `.github/workflows/release.yml`. `bun run build`.
6. **`chore(server): drop better-sqlite3 + sveltekit-node deps`** — cuando el test runner pase a `bun test` o cuando se evalúe que vitest pueda correr bajo Bun (`bun --bun vitest`). `db-test.ts` rompe en runtime bajo Node, fix acá.

**Bloqueantes / unknowns:**
- Dockerfile actual probablemente es multi-stage (Node base + Kit build). Hay que revisar `Dockerfile` antes de tocar para entender el flow actual.
- ¿El healthcheck del deploy actual usa qué? Revisar `docker-compose*.yml` y `fly.toml` si aplica.
- Para sub-commit 6: `db-test.ts` necesita estrategia — o reescribir con bun:sqlite API directa, o quedar bloqueado al test runner.

**Cómo arrancar el próximo contexto:**
1. Leer este archivo y la sección "Handoff 2026-05-15" arriba.
2. `git pull origin feat/migrate-bun-hono` (HEAD: `6af79c3`).
3. Inspeccionar `Dockerfile` y `docker-compose*.yml` antes de tocar nada del sub-commit 4. Confirmar con el usuario si el deploy es Fly.io, self-hosted (Raspberry Pi LibreELEC?), o ambos.

### Handoff 2026-05-17 — fin sub-commits 4 y 5, pendiente sub-commit 6

**Estado:** sub-commits 4 y 5 mergeados al branch + cleanup colateral de rutas obsoletas. Branch `feat/migrate-bun-hono` pusheado en `9b14243`. PR draft #185 abierta para gatillar CI.

**Lo hecho en sesión 2026-05-17:**

- `b8a241a chore: Dockerfile + docker-compose a Bun` (sub-commit 4)
  - Dockerfile: `node:22.21.0-alpine` → `oven/bun:1-alpine`. Drop python3/make/g++, dumb-init, healthcheck. `npm ci --workspace=server --omit=dev` → `bun install --filter='./server' --production --frozen-lockfile`. Copia `client/package.json` además del root (Bun valida todos los workspaces del lockfile, no se puede filtrar sin tener los manifests). User `bun` (uid 1000, ya en imagen). `CMD ["bun", "server/http/server.ts"]`.
  - docker-compose.yml: simplificado a referencia mínima — drop healthcheck, `deploy.resources`, networks explícitas, comentarios de nginx. Decisión del usuario: cada deploy se arma el suyo; el repo queda como ejemplo.
  - Drop `package-lock.json` del repo. `bun.lock` queda como lockfile canónico.
  - Cambios atados:
    - `server/package.json`: `better-sqlite3` movido a `devDependencies` (sigue en runtime para `db-test.ts` bajo vitest, no para el server prod). Sin esto, el postinstall de better-sqlite3 (node-gyp) corre en `bun install` aunque no se use, porque Bun lo trustea por defecto.
    - `client/package.json`: removido `better-sqlite3` (artifact viejo, cero usos en `client/src/`).
    - `server/http/server.ts`: `HONO_PORT` (default 3001) → `PORT` (default 3000). Alinea con env vars estándar; ya no hay coexistencia con Kit prod.
    - `.githooks/pre-commit`: línea 17 `npx prettier --write` → `./server/node_modules/.bin/prettier --write` (Bun no hoist workspace bins al root `node_modules/.bin`).
- `8f7d1d8 chore(client): drop obsolete API routes` (sub-commit A — cleanup pre-CI)
  - 32 archivos `client/src/routes/api/**/+server.ts` borrados. adapter-static no compilaba esos endpoints (los ignora), pero `svelte-check` los typecheckaba y rompía porque importaban `@server/database/db.ts` (que usa `bun:sqlite`, tipo no presente en tsconfig del client).
- `9b14243 chore(ci): workflows + scripts root a Bun` (sub-commit 5)
  - Composite `.github/actions/setup-node-deps/` → `setup-bun-deps/`. `actions/setup-node@v4` + `npm ci` → `oven-sh/setup-bun@v2` + `bun install --frozen-lockfile`.
  - `ci.yml`, `release.yml`, `dependencies.yml`: refs al composite renombrado + `npm run X` → `bun run X`. Release: `npm run build` → `cd client && bun run build` (skipea check del root porque el job typescript de CI ya lo cubre).
  - `dependencies.yml`: `npm outdated` → `bun outdated`.
  - Drop `security` job de `ci.yml` y step de audit de `dependencies.yml`. Comments con razón: `npm audit` requería package-lock; `bun pm scan` requiere scanner externo en bunfig.toml (sin scanner oficial Bun aún). Pendiente: elegir scanner o esperar drop-in.
  - `package.json` (root): `npm run X` interno → `bun run X`. `engines.node`/`npm` → `engines.bun: >=1.3.0`. Script `check` ajustado para correr `tsc` desde `server/node_modules/.bin/` (Bun no hoist).
  - Lint cleanup colateral: typescript-eslint subió 8.56 → 8.59 al regenerar bun.lock. `no-unnecessary-type-assertion` se hizo más estricto. Auto-fix en 6 archivos (`comprobantes.ts`, `expected-invoices.ts`, `files.ts`, `invoices.ts`, `file-scanner.ts`, `excel-import.service.ts`); 1 `eslint-disable-next-line` en `invoices-known.ts` (sin el cast del `.catch()` el body pierde el narrow y los argumentos numéricos rompen el type check).

**Decisiones de la sesión:**

- **Repo = referencia mínima para deploy.** docker-compose.yml y Dockerfile son ejemplos; cada deploy se arma el suyo. Pendiente: ejemplo concreto en README (Pi LibreELEC u otro).
- **Healthcheck dropeado.** Pendiente cuando Bun proponga patrón oficial.
- **Security audit dropeado.** Pendiente: scanner Bun cuando exista o se elija uno.
- **Multi-arch sigue.** `release.yml` ya buildeaba `linux/amd64,linux/arm64` antes de la migración; no se tocó.
- **CI no se gatillaba** en push de feature branches (workflow tiene `pull_request: [main, master]`). PR draft #185 abierta para validar workflows nuevos en GH Actions reales.

**Sub-commits restantes:**

6. **`chore(server): drop better-sqlite3 + sveltekit-node deps`** — sigue pendiente. Bloquea: decidir test runner (`bun test` nativo, `bun --bun vitest`, o mantener vitest+Node con tests rotos). `db-test.ts` necesita estrategia. Lo más probable: `bun --bun vitest` ya que es drop-in compatible; ver si vitest carga sin issues bajo Bun runtime.

**Verificado en sesión 2026-05-18 (extensión de la del 17):**

- **CI run de PR #185:** Code Quality, TypeScript Validation, Build Frontend, CI Summary → **pass**. Tests & Coverage → **fail** (esperado): `Only URLs with a scheme in: file, data, and node are supported by the default ESM loader. Received protocol 'bun:'` — vitest corre bajo Node (workflow usa `bun run test` que invoca `vitest` directo, sin `--bun`). Fix va en sub-commit 6.
- **Smoke E2E con DB real:** `docker run -v $(pwd)/data:/app/data -e DB_PATH=/app/data/database.sqlite procesador-facturas:bun-test`. `/api/_hono/health` → 200; `/api/comprobantes?limit=2` → 200 con `{"count":475, "comprobantes":[…]}`. Listing real OK con bun:sqlite + drizzle/bun-sqlite. *Nota:* primer intento dio 404 transitorio — sleep 4s post-start no siempre alcanza, sleep 6s sí. No es bug.
- **PR #185 sigue draft.** Pendiente: cerrar sub-commit 6 + README ejemplo + ready → squash merge (decisión del usuario en sesión 2026-05-18).

**Bloqueantes / unknowns:**

- Sub-commit 6: probar `bun --bun vitest` localmente antes de tocar package.json del server. Si vitest carga bien bajo Bun runtime, cambiar `server/package.json` script `test` a `bun --bun vitest`. Mantener vitest como devDep mientras tanto. Después de eso, drop `better-sqlite3` de devDeps + reescribir `db-test.ts` con `bun:sqlite` API directa.
- README: agregar sección "Deploy" con ejemplo concreto. El comment del docker-compose.yml dice "ver README.md".

**Cómo arrancar el próximo contexto:**

1. Leer este archivo y la sección "Handoff 2026-05-17" arriba (incluye el bloque "Verificado en sesión 2026-05-18").
2. `git pull origin feat/migrate-bun-hono` (HEAD: post-handoff push).
3. `gh pr checks 185` para ver estado actual del CI (debería estar igual: tests fail, resto pass).
4. Sub-commit 6 — pasos sugeridos:
   - `cd server && bun --bun vitest --run` localmente. Si arranca sin error de loader, está. Si rompe, evaluar `bun test` nativo (sintaxis distinta — requiere migrar tests) o mantener vitest+Node y excluir tests que tocan `bun:sqlite`.
   - Si `bun --bun vitest` anda: cambiar `server/package.json` script `test` a `bun --bun vitest`. Actualizar `.github/workflows/ci.yml` para que el job test use el comando equivalente (el alias `bun run test` debería heredarlo).
   - Reescribir `server/database/db-test.ts` con `import { Database } from 'bun:sqlite'` directo.
   - Drop `better-sqlite3` de `server/devDependencies`. Drop `@types/better-sqlite3` también.
   - Drop `@sveltejs/adapter-node` de `client/devDependencies` (ya no se usa).
   - `bun install`, correr tests local, push, ver CI.
5. README — agregar sección "Deploy" con ejemplo concreto (probablemente Pi LibreELEC + recordatorio de los exports git para SSH al Pi).
6. PR draft → ready → squash merge. Mensaje del squash consolida los ~10 sub-commits en un solo "feat: migrate to Bun runtime + Hono server".
