# Changelog

## [Unreleased]

<!-- Próximos cambios van aquí -->

---

## [0.5.0] - Unified File Management (2026-01-16)

### Overview

**Issue #40** - Refactoring arquitectónico mayor que reemplaza la tabla `pending_files` con una arquitectura más limpia de `files` + `file_extraction_results`, separando el almacenamiento de archivos de los datos de extracción.

### ✨ Added

#### Sistema de Gestión de Archivos Unificado
- **Tabla `files`**: Almacena archivos subidos con status (uploaded/processed) y hash SHA-256 para deduplicación
- **Tabla `file_extraction_results`**: Almacena datos de extracción (CUIT, fecha, tipo, monto) separados de los archivos
- **Repositorios**: `FileRepository` y `FileExtractionRepository` para acceso a datos
- **Endpoints `/api/files`**: Reemplazan `/api/pending-files` para todas las operaciones de archivos
- **Scripts de migración**: Migración automática de datos desde `pending_files` y columnas legacy de `facturas`

#### Integración ARCA
- **Códigos numéricos ARCA**: Migración de códigos de letra (A, B, C) a códigos numéricos (1, 6, 11, etc.)
- **Formatters ARCA**: Nuevas funciones utilitarias para mostrar tipos de factura
- **Selector de tipo Melt UI**: Nuevo componente dropdown para selección de tipo de factura
- **Import automático de emisores**: Emisores importados desde Excel ARCA durante importación de facturas

#### Experiencia de Desarrollo
- **`npm run ci:check`**: Nuevo script para validación CI local antes de pushear
- **Normalización de fechas ISO**: Todos los valores `extracted_date` ahora se almacenan en formato ISO
- **Naming scheme mejorado**: Esquema de nombres consistente usando códigos ARCA

### ♻️ Changed (BREAKING)

#### Arquitectura
- **Eliminada tabla `pending_files`**: Toda la funcionalidad movida a `files` + `file_extraction_results`
- **Eliminado concepto "pending" de UI**: La interfaz ahora usa terminología "file" en todo el sistema
- **Cambios de endpoints API**:
  - `/api/pending-files/*` → `/api/files/*`
  - Respuestas de Invoice ahora usan `fileId` en lugar de `pendingFileId`

#### UI/UX
- **Eliminadas todas las referencias a "pending"**: Terminología consistente "file"
- **Componente Category Pills**: Nuevo componente para selección de categorías con modos single/filter
- **Asignación rápida de categorías**: Asignar categorías directamente desde la vista de listado
- **Normalización de emisores**: Mostrar nombres de emisores normalizados desde datos ARCA
- **Drag & drop global**: Soltar archivos en cualquier lugar de la página comprobantes

#### Schema de Base de Datos
- Eliminadas columnas legacy de paths (`originalFile`, `processedFile`) de tabla `facturas`
- Campos de tipo de factura ahora almacenan códigos numéricos ARCA en lugar de códigos de letra
- Agregado CHECK constraint para formato de fecha ISO en `extracted_date`

### 🐛 Fixed

- Linking invoice-expected y consistencia de estados de archivo
- Estado de archivo no actualizaba correctamente después de crear factura
- Errores de lint en repositories y services del servidor
- Problemas de formateo en código de servidor y cliente
- Edición de categorías ahora opcional con UX click-to-edit
- Navegación SPA usando `goto()` en lugar de `window.location`
- Import Excel ARCA soportando variaciones en fila de títulos

### ❌ Removed

- Tabla `pending_files` y toda la infraestructura relacionada
- Endpoints `/api/pending-files` (reemplazados por `/api/files`)
- Campo `pendingFileId` de interface Invoice (reemplazado por `fileId`)
- Columnas legacy `originalFile` y `processedFile` de `facturas`
- Códigos de tipo de factura basados en letras (A, B, C, etc.)

### Notas de Migración

**Migración Automática**: La actualización incluye scripts de migración que automáticamente:
1. Crean nuevas tablas `files` y `file_extraction_results`
2. Migran datos de `pending_files` a `files`
3. Migran datos de extracción a `file_extraction_results`
4. Convierten tipos de factura de letras a códigos numéricos ARCA
5. Eliminan la tabla `pending_files`

**Cambios Breaking de API**: Si tenés integraciones externas:
- Actualizar endpoints de `/api/pending-files/` a `/api/files/`
- Reemplazar `pendingFileId` con `fileId` en todos los requests/responses
- Tipos de factura ahora son numéricos (1, 6, 11, 19, 51, etc.) no letras (A, B, C)

---

## [0.4.0] - ARCA Integration (2025-12-xx)

### ✨ Added

#### Sistema de Matching Excel AFIP (FASE 1.5)
- **Backend completo**: Tablas `expected_invoices` e `import_batches`
- **Repository**: `ExpectedInvoiceRepository` con métodos `findExactMatch`, `findCandidates`, `createBatch`
- **Service**: `ExcelImportService` para parsing de Excel/CSV AFIP
- **Endpoints API**:
  - `POST /api/expected-invoices/import` - Importar Excel
  - `GET /api/expected-invoices` - Listar facturas esperadas
  - `POST /api/expected-invoices/[id]/match` - Confirmar match
  - `GET /api/expected-invoices/template` - Descargar template

#### UI de Comparación
- **Tabla comparativa**: Datos Detectados (PDF) vs Excel AFIP lado a lado
- **Indicadores visuales**: ✓ (coincide), ⚠ (difiere), ❌ (no detectado), ⚪ (sin datos)
- **Tooltips informativos**: Muestran diferencias específicas al hover
- **Leyenda de estados**: Ayuda visual para interpretar iconos

### ♻️ Refactored

#### Rediseño de Tab "Revisar"
- **Eliminado overlay**: El overlay "Detección automática" tapaba el PDF
- **Nueva tabla comparativa**: Layout dos columnas (PDF vs datos)
- **Tabs unificados**: Reducido de 4 a 3 tabs principales

### 🐛 Fixed

- **{@const} placement**: Corregido para ser hijo directo de {#each} (Svelte 5)
- **Import error**: `@server/utils/validation.js` → `@server/validators/cuit.js`
- **TypeScript errors**: personType null→undefined, InvoiceType casts
- **OCR Confidence**: Ahora considera 5 campos requeridos (era 4)
- **findExactMatch/findCandidates**: Arregladas firmas de funciones
- **Warnings de a11y**: Dropzone convertido de div a button
- **CSS no usado eliminado**: .form-field, .data-item .label/.value

---

## [0.3.0] - Client/Server Refactor (2024-11-18)

### 🐛 Fixed

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

### ♻️ Refactored

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

---

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

---

## [0.1.0] - MVP Inicial (Obsoleto)

- CLI básico con comandos process, list, stats
- Extracción genérica de PDFs digitales
- Validación CUIT con módulo 11
- Base de datos SQLite con schema.sql
- Web app solo para anotaciones

---

**Formato basado en [Keep a Changelog](https://keepachangelog.com/)**
