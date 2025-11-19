# Changelog

## [Unreleased]

### 🔧 Fixed (2024-11-18)

#### Vulnerabilidades
- **Root**: 10 → 4 vulnerabilities (9 moderate + 1 high → 4 moderate)
  - Actualizado `vitest` 2.x → 4.x (arregla esbuild vulnerabilities)
  - Quedan 4 moderate en drizzle-kit (solo dev, deprecated @esbuild-kit deps)
- **Client**: 3 low → 0 vulnerabilities
  - Agregado override `cookie@^0.7.0` para fix CVE-2024-47764

#### GitHub Actions
- Actualizado CI para nueva estructura client/server
- Build job ahora builds frontend en vez de TypeScript root
- Tests y security audit con continue-on-error (aún sin tests)
- Solo fail en jobs críticos (quality, build)

### ♻️ Refactor (2024-11-18)

#### Estructura de Directorios
**BREAKING CHANGE**: Reorganización completa de estructura

Antes:
```
├── src/       (backend mezclado)
└── web/       (frontend)
```

Ahora:
```
├── server/    ⚙️  BACKEND (Services + DB)
└── client/    🎨  FRONTEND (SvelteKit)
```

**Motivación:**
- Separación clara entre frontend y backend
- Evitar confusión (ambos usan Vite)
- Logs distintivos al levantar apps
- Estructura más estándar

**Archivos actualizados:**
- `package.json`: paths en scripts
- `drizzle.config.ts`: paths a server/
- `Dockerfile`: COPY y WORKDIR
- `client/vite.config.ts`: alias + log visual
- `.github/workflows/ci.yml`: build simplificado
- Todos los imports: src/ → server/

**Log visual agregado:**
```
┌─────────────────────────────────────────┐
│  🎨 FRONTEND (SvelteKit)                │
└─────────────────────────────────────────┘
```

## [0.2.0] - Refactor Web-Only (2024-11-18)

### ✨ Added

#### Drizzle ORM
- Sistema de migraciones automáticas
- Schema TypeScript type-safe (`server/database/schema.ts`)
- Scripts npm: `db:generate`, `db:migrate`, `db:push`, `db:studio`
- Migraciones generadas automáticamente desde schema

#### Servicios Reutilizables
- `InvoiceProcessingService`: procesamiento y extracción
- `FileExportService`: renombrado y export automático

#### API REST
- `POST /api/invoices/upload` - Subir archivos (max 10MB)
- `POST /api/invoices/process` - Procesar con servicio
- `POST /api/invoices/export` - Export con renombrado
- `PATCH /api/invoices/[id]` - Editar campos manualmente
- `DELETE /api/invoices/[id]` - Eliminar factura

#### Docker
- Dockerfile multi-stage optimizado
- docker-compose.yml con volúmenes persistentes
- Usuario no-root por seguridad
- Healthchecks configurados

#### Configuración
- Vite puerto personalizable (`VITE_PORT`)
- `.env.example` para client y root
- Node version 22.21.0

### ❌ Removed

- **CLI completo** (src/cli/, src/main.ts)
- Dependencia `commander`
- `scripts/init-db.ts` (reemplazado por Drizzle)
- `scripts/migrate-zones.cjs` (reemplazado por Drizzle)

### 📝 Changed

**Breaking Changes:**
- CLI eliminado: `procesador process` ya no existe
- Comandos npm:
  - ❌ `npm run db:init` → ✅ `npm run db:migrate`
  - ❌ `npm run web:dev` → ✅ `npm run dev`
- Entry point eliminado: ya no hay `dist/main.js`

**Mejoras:**
- Schema TypeScript type-safe
- Migraciones automáticas
- Servicios desacoplados
- API REST testeable

## [0.1.0] - MVP Inicial (Obsoleto)

- CLI básico con comandos process, list, stats
- Extracción genérica de PDFs digitales
- Validación CUIT con módulo 11
- Base de datos SQLite con schema.sql
- Web app solo para anotaciones

---

**Formato basado en [Keep a Changelog](https://keepachangelog.com/)
