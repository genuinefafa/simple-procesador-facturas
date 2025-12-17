# Especificación Técnica - Procesador de Facturas

**Versión actual**: v0.4.0
**Última actualización**: 2025-12-16

---

## 1. Visión y Evolución del Proyecto

### 1.1 Historia

El proyecto nació como una **CLI** (command-line interface) para procesar PDFs de facturas y evolucionó a través de múltiples iteraciones:

**v0.1 - CLI Básico** (Obsoleto)
- Comando `procesador process` para extracción batch
- Validación CUIT con módulo 11
- SQLite con schema.sql manual
- Web app solo para anotaciones

**v0.2 - Refactor Web-Only** (Nov 2024)
- ❌ CLI eliminado completamente
- ✅ API REST completa
- ✅ Drizzle ORM + migraciones automáticas
- ✅ Docker multi-stage
- Rutas: `/importar`, `/procesar`, `/facturas`

**v0.3 - OCR + Excel AFIP** (Nov-Dec 2024)
- ✅ Sistema OCR con Tesseract.js
- ✅ Soporte HEIC (fotos iPhone)
- ✅ Matching con Excel AFIP
- ✅ Sistema de archivos pendientes (`pending_files`)
- ✅ Toast notifications (sin alert/confirm)

**v0.4 - Dashboard + Comprobantes Hub** (Dec 2024)
- ✅ Melt UI Next (beta v0.42) migrado
- ✅ Dashboard principal
- ✅ **Comprobantes Hub** - Vista unificada reemplazando rutas legacy
- ✅ Gestión de emisores (alta, listado)
- ✅ Rail navigation con topbar
- ⚠️ Rutas legacy preservadas para referencia

### 1.2 Filosofía Actual

> **"La intervención humana es el núcleo, no un fallback"**

- El sistema **ayuda pero no decide**
- El usuario **siempre revisa** antes de confirmar
- OCR es **manual** (usuario clickea "Reconocer")
- Excel AFIP sirve para **completar datos**, no para automatizar

---

## 2. Arquitectura Actual (v0.4)

### 2.1 Stack Tecnológico

| Capa | Tecnología | Versión |
|------|------------|---------|
| **Framework** | SvelteKit | 2.x |
| **UI Library** | Svelte | 5.41.0 |
| **Components** | Melt UI Next | 0.42.0 (beta) |
| **Database** | SQLite + Drizzle ORM | - |
| **OCR** | Tesseract.js | - |
| **File Processing** | pdf-parse, sharp | - |
| **Notifications** | svelte-sonner | - |

### 2.2 Estructura de Directorios

```
simple-procesador-facturas/
├── client/                    # 🎨 Frontend (SvelteKit)
│   ├── src/
│   │   ├── lib/
│   │   │   ├── components/
│   │   │   │   ├── ui/       # Componentes Melt UI
│   │   │   │   │   ├── tokens.css
│   │   │   │   │   ├── Button.svelte
│   │   │   │   │   ├── Input.svelte
│   │   │   │   │   ├── Dialog.svelte
│   │   │   │   │   ├── Tabs.svelte
│   │   │   │   │   ├── Dropdown.svelte
│   │   │   │   │   └── Sidebar.svelte
│   │   │   │   ├── TopBar.svelte
│   │   │   │   ├── RailNav.svelte
│   │   │   │   └── ComprobanteCard.svelte
│   │   │   └── stores/
│   │   │       └── toast.ts
│   │   └── routes/
│   │       ├── +layout.svelte          # Rail navigation
│   │       ├── dashboard/              ⭐ NUEVA
│   │       ├── comprobantes/           ⭐ HUB PRINCIPAL
│   │       │   ├── +page.svelte        # Listado con filtros
│   │       │   └── [id]/+page.svelte   # Detalle individual
│   │       ├── emisores/               ⭐ NUEVA
│   │       ├── google-sync/            ✅ Activa
│   │       ├── entrenamiento/          ✅ Activa (baja prioridad)
│   │       ├── annotate/               ✅ Activa (baja prioridad)
│   │       └── api/                    # Endpoints REST
│   └── vite.config.ts
│
├── server/                    # ⚙️ Backend (Services + DB)
│   ├── database/
│   │   ├── schema.ts                   # Drizzle schema
│   │   ├── repositories/
│   │   │   ├── invoice.ts
│   │   │   ├── pending-file.ts
│   │   │   ├── expected-invoice.ts
│   │   │   └── emitter.ts
│   │   └── migrations/
│   ├── services/
│   │   ├── invoice-processing.service.ts
│   │   ├── excel-import.service.ts
│   │   └── file-export.service.ts
│   ├── extractors/
│   │   ├── pdf-extractor.ts
│   │   └── ocr-extractor.ts
│   ├── validators/
│   │   └── cuit.ts
│   └── utils/
│       └── afip-codes.ts
│
├── docs/                      # 📚 Documentación consolidada
│   ├── ARCHITECTURE.md
│   ├── MELT-UI.md
│   ├── SIDEBAR.md
│   └── UI_UX.md
│
├── legacy/                    # 🔴 Rutas deprecadas (solo dev)
│   ├── +layout.svelte         # Guard: solo visible en dev
│   ├── importar/
│   ├── procesar/
│   ├── facturas/
│   └── pending-files/
│
├── SPEC.md                    # Este archivo
├── README.md
├── CHANGELOG.md
├── ROADMAP.md
└── package.json
```

### 2.3 Base de Datos (Drizzle Schema)

**Motor**: SQLite
**ORM**: Drizzle ORM
**Ubicación del archivo**: `data/database.sqlite` (desde root del proyecto)

**Configuración**:
- **Drizzle config**: `server/drizzle.config.ts`
- **Conexión**: `server/database/db.ts`
- **Schema**: `server/database/schema.ts`
- **Migraciones**: `server/database/migrations/`

**Comandos útiles**:
```bash
# Drizzle Studio (GUI)
npm run db:studio
# Conecta a: data/database.sqlite

# SQLite CLI directo
sqlite3 data/database.sqlite

# Aplicar migraciones
npm run db:migrate
```

**IMPORTANTE**: La base de datos NO está en `server/database/invoices.db` (archivo legacy vacío). Siempre usar `data/database.sqlite`.

---

**Tabla principal: `invoices`**
```typescript
{
  id: serial,
  emitterId: integer,          // FK a emitters
  cuit: text,
  invoiceType: text,           // "A", "B", "C"
  pointOfSale: integer,
  invoiceNumber: integer,
  issueDate: text,
  total: real,
  personType: "fisica" | "juridica" | null,
  categoryId: integer,         // FK a categories
  status: "pending" | "processed"
}
```

**Archivos pendientes: `pending_files`**
```typescript
{
  id: serial,
  fileName: text,
  mimeType: text,
  status: "pending" | "reviewing" | "processed" | "failed",
  extractedData: json,         // Datos OCR extraídos
  createdAt: text
}
```

**Facturas esperadas (AFIP): `expected_invoices`**
```typescript
{
  id: serial,
  batchId: text,
  cuit: text,
  invoiceType: text,
  pointOfSale: integer,
  invoiceNumber: integer,
  issueDate: text,
  total: real,
  status: "pending" | "matched" | "ignored"
}
```

**Emisores: `emitters`**
```typescript
{
  id: serial,
  cuit: text unique,
  name: text,
  alias: text nullable,
  createdAt: text
}
```

**Categorías: `categories`**
```typescript
{
  id: serial,
  name: text unique,
  icon: text,
  color: text
}
```

---

## 3. Rutas y Funcionalidades

### 3.1 Rutas Canónicas (v0.4)

| Ruta | Descripción | Estado |
|------|-------------|--------|
| `/` | Redirect a `/dashboard` | ✅ |
| `/dashboard` | Vista principal, métricas y accesos rápidos | ✅ Implementada |
| `/comprobantes` | **Hub principal** - Listado unificado con filtros | ✅ Implementada |
| `/comprobantes/[id]` | Detalle individual del comprobante | ✅ Implementada |
| `/emisores` | Gestión de emisores (CRUD) | 🔶 Falta edit/delete |
| `/google-sync` | Integración con Google Drive/Sheets | ✅ Funcional |
| `/entrenamiento` | Templates de extracción (baja prioridad) | 🔵 Planeada |
| `/annotate` | Anotaciones manuales | ✅ Funcional |

### 3.2 Rutas Legacy (Archivadas)

**NOTA**: Estas rutas se archivaron en `/legacy` y solo son visibles en desarrollo.

| Ruta | Reemplazada por | Motivo |
|------|-----------------|--------|
| `/importar` | `/comprobantes` (tab Importar) | Hub unificado |
| `/procesar` | `/comprobantes` (tab Procesar) | Hub unificado |
| `/facturas` | `/comprobantes` | Hub unificado |
| `/pending-files` | `/comprobantes` (filtro Pendientes) | Hub unificado |
| `/revisar` | `/comprobantes` (tab Revisar) | Hub unificado |

### 3.3 Comprobantes Hub - Detalle Funcional

**Filtros disponibles:**
- `all` - Todos los comprobantes
- `pendientes` - Archivos subidos sin procesar
- `reconocidas` - Facturas ya procesadas
- `esperadas` - Importadas desde Excel AFIP sin match

**Acciones disponibles:**
- Subir archivo (PDF, JPG, PNG, HEIC)
- Importar Excel AFIP
- Reconocer automáticamente (OCR)
- Editar campos manualmente
- Asignar categoría
- Eliminar comprobante
- Exportar datos

**Vista de detalle (`/comprobantes/[id]`):**
- Preview del archivo
- Datos extraídos vs. Excel AFIP (comparación)
- Indicadores visuales: ✓ (coincide), ⚠ (difiere), ❌ (no detectado), ⚪ (sin datos)
- Botón "Confirmar y procesar"
- Botón "Reconocer de nuevo"

---

## 4. Flujos de Usuario

### 4.1 Flujo Principal (Happy Path)

```
1. Usuario accede a /dashboard
2. Clickea "Ir a Comprobantes" o navega desde rail
3. En /comprobantes:
   a. Sube archivo PDF/imagen (drag & drop)
   b. Sistema guarda en pending_files con status "pending"
   c. Clickea "Reconocer" en el comprobante
   d. Sistema extrae texto (PDF_TEXT o OCR)
   e. Busca match en expected_invoices (si existe Excel AFIP)
   f. Muestra datos extraídos + comparación Excel
4. Usuario revisa detalle (/comprobantes/[id])
   a. Corrige campos si es necesario
   b. Asigna categoría (opcional)
   c. Clickea "Confirmar y procesar"
5. Factura creada en `invoices` con status "processed"
6. Archivo marcado como "processed" en pending_files
```

### 4.2 Flujo Excel AFIP (Matching)

```
1. Usuario importa Excel AFIP desde /comprobantes
2. Sistema parsea columnas y crea registros en expected_invoices
3. Al procesar archivo:
   a. Sistema busca match exacto (CUIT + Tipo + PuntoVenta + Número)
   b. Si no hay exacto, busca candidatos (CUIT + Fecha ±7 días + Total ±10%)
   c. Si hay match único → auto-completa campos
   d. Si hay múltiples candidatos → usuario elige
   e. Si no hay match → procesamiento normal OCR
4. Usuario confirma match
5. expected_invoice marcado como "matched"
```

### 4.3 Flujo Emisores

```
1. Usuario accede a /emisores
2. Ve lista de emisores existentes (CUIT, nombre, alias)
3. Clickea "Nuevo Emisor"
4. Ingresa CUIT, nombre, alias (opcional)
5. Sistema valida CUIT (módulo 11)
6. Emisor creado y disponible para asignar en facturas

Pendiente (M3):
- Editar emisor existente
- Eliminar emisor (con validación de facturas asociadas)
- Buscar emisor en facturas
```

---

## 5. Componentes UI (Melt UI Next)

### 5.1 Primitivos Implementados

| Componente | Ubicación | Basado en Melt | Notas |
|------------|-----------|----------------|-------|
| **Button** | `ui/Button.svelte` | ❌ CSS puro | 4 variantes, 3 tamaños |
| **Input** | `ui/Input.svelte` | ❌ CSS puro | Validación, error, hint |
| **Dialog** | `ui/Dialog.svelte` | ✅ Melt UI v0.86 | Focus trap, ESC close |
| **Tabs** | `ui/Tabs.svelte` | ✅ Melt UI Next | Keyboard navigation |
| **Dropdown** | `ui/Dropdown.svelte` | ✅ Melt Popover | Positioning inteligente |
| **Sidebar** | `ui/Sidebar.svelte` | ❌ Patrón custom | Drawer mobile + sticky desktop |

**IMPORTANTE**: Dialog usa `@melt-ui/svelte` v0.86 (viejo) porque no existe en Melt Next aún.

### 5.2 Design Tokens

Sistema completo de tokens CSS en `tokens.css`:

```css
--color-primary-600
--color-neutral-800
--spacing-4 (16px)
--font-size-base (1rem)
--border-radius-md (0.375rem)
--shadow-lg
--transition-base (300ms)
--z-modal (1050)
```

**Regla de oro**: NO usar valores hardcoded, siempre usar tokens.

### 5.3 Componentes de Layout

| Componente | Ubicación | Descripción |
|------------|-----------|-------------|
| **TopBar** | `TopBar.svelte` | Barra superior con título y acciones |
| **RailNav** | `RailNav.svelte` | Navegación lateral colapsable |
| **ComprobanteCard** | `ComprobanteCard.svelte` | Card individual en hub |

---

## 6. API REST Endpoints

### 6.1 Comprobantes

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/invoices/upload` | POST | Subir archivo (max 10MB) |
| `/api/invoices/process` | POST | Procesar con OCR/Excel matching |
| `/api/invoices/[id]` | PATCH | Editar campos manualmente |
| `/api/invoices/[id]` | DELETE | Eliminar factura |
| `/api/invoices/export` | POST | Exportar con renombrado |

### 6.2 Archivos Pendientes

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/pending-files` | GET | Listar archivos pendientes |
| `/api/pending-files/[id]` | GET | Obtener detalle |
| `/api/pending-files/[id]/matches` | GET | Matches con Excel AFIP |
| `/api/pending-files/[id]` | DELETE | Eliminar archivo |

### 6.3 Excel AFIP

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/expected-invoices/import` | POST | Importar Excel AFIP |
| `/api/expected-invoices` | GET | Listar facturas esperadas |
| `/api/expected-invoices/[id]/match` | POST | Confirmar match |
| `/api/expected-invoices/template` | GET | Descargar template Excel |

### 6.4 Emisores

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/emitters` | GET | Listar emisores |
| `/api/emitters` | POST | Crear emisor |
| `/api/emitters/[id]` | PATCH | Editar emisor (⏳ pendiente) |
| `/api/emitters/[id]` | DELETE | Eliminar emisor (⏳ pendiente) |

### 6.5 Categorías

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/categories` | GET | Listar categorías |
| `/api/categories` | POST | Crear categoría |
| `/api/categories/[id]` | PATCH | Editar categoría |
| `/api/categories/[id]` | DELETE | Eliminar categoría |

---

## 7. Reglas de Desarrollo

### 7.1 Convenciones de Código

**TypeScript:**
- Usar tipos estrictos, evitar `any`
- Interfaces en PascalCase
- Enums para estados: `"pending" | "processed"`

**Svelte 5:**
- Usar runes: `$state`, `$derived`, `$effect`, `$bindable`
- NO usar stores (`writable`, `derived`) salvo para casos específicos

**Formatters (`client/src/lib/formatters.ts`):**
- Usar funciones centralizadas para formateo consistente
- `formatCurrency(value)` → $1.234,56
- `formatNumber(value)` → 1.234,56
- `formatCuit(cuit)` → 30‑12345678‑9
- `formatDateISO(date)` → 15-dic-2025
- `formatDateShort(date)` → 15/dic
- `formatDateTime(date)` → 15-dic-2025 14:30
- ❌ **NO duplicar** lógica de formateo inline
- Snippets en lugar de slots

**Estilos:**
- CSS puro con design tokens
- NO Tailwind, NO @apply
- BEM naming cuando sea necesario

### 7.2 Políticas de UI/UX

**Prohibido:**
- ❌ `alert()`, `confirm()`, `prompt()`
- ❌ `window.location.href`, `window.location.replace()` (rompe SPA)
- ❌ Valores CSS hardcoded (usar tokens)
- ❌ Tailwind classes
- ❌ Stores para estado local (usar runes)

**Requerido:**
- ✅ Toast notifications (`svelte-sonner`)
- ✅ Dialog component para confirmaciones
- ✅ `goto()` de `$app/navigation` para navegación programática
- ✅ `invalidateAll()` de `$app/navigation` para refresh de datos
- ✅ Indicadores visuales (✓ ⚠ ❌ ⚪)
- ✅ Tooltips informativos
- ✅ Accesibilidad ARIA completa

**Navegación programática:**
```typescript
// ❌ MAL - Rompe SPA, recarga toda la página
window.location.href = '/comprobantes';

// ✅ BIEN - Mantiene SPA
import { goto } from '$app/navigation';
goto('/comprobantes');

// Para refresh de datos después de mutaciones:
import { invalidateAll } from '$app/navigation';
await invalidateAll(); // Re-ejecuta load functions
```

### 7.3 Git Workflow

**Idioma:**
- ✅ **Commits**: Inglés técnico (convención estándar internacional)
- ✅ **Pull Requests**: Español argentino formal (título y descripción)
- ✅ **Issues**: Español argentino formal
- ✅ **Documentación**: Español argentino formal
- ✅ **Código y comentarios**: Inglés

**Branches:**
- `main` - Producción
- `feat/*` - Nuevas features
- `fix/*` - Bugfixes
- `docs/*` - Solo documentación
- `refactor/*` - Refactoring sin cambios funcionales

### 7.4 Gestión de Issues y Prioridades

**Labels de Severidad:**
- 🔴 `critical` - Bloqueante, sistema no funcional o pérdida de datos
- 🟠 `bug` - Funcionalidad rota pero hay workaround
- 🟡 `enhancement` - Mejora o nueva funcionalidad
- 🔵 `documentation` - Solo documentación
- 🟣 `refactor` - Refactoring/tech-debt

**Labels de Prioridad:**
- `P0` - Inmediato (resolver HOY) - Color: rojo oscuro (#b60205)
- `P1` - Alto (resolver esta semana) - Color: naranja (#d93f0b)
- `P2` - Medio (resolver este mes) - Color: amarillo (#fbca04)
- `P3` - Bajo (cuando haya tiempo) - Color: verde (#0e8a16)

**Workflow de Priorización:**

1. **Bug crítico detectado**:
   - Crear issue con título descriptivo (ej: "bug: no se pueden guardar facturas editadas")
   - Asignar labels: `bug` + `critical` y/o `P0`/`P1` según severidad
   - Agregar a milestone `Hotfixes` si es P0/crítico
   - **Resolver ANTES que cualquier feature nueva**

2. **Feature/Enhancement**:
   - Asignar label: `enhancement` + prioridad (`P2`/`P3` típicamente)
   - Agregar a milestone correspondiente (ej: M3.6, M4.0)
   - Planificar en backlog

3. **Orden de ejecución**:
   ```
   P0/critical > P1/bug > P2/enhancement > P3
   ```

**Ejemplos:**
- `bug` + `P0` → Factura editada no se guarda (bloqueante) - Resolver HOY
- `bug` + `P1` → Tipo de comprobante parseado mal en import - Resolver esta semana
- `enhancement` + `P2` → Nuevo filtro de categorías - Resolver este mes
- `enhancement` + `P3` → Exportar a PDF - Backlog

**Commits (inglés):**
```
feat(comprobantes): add category filter
fix(ocr): improve CUIT detection with fallback
docs: consolidate sidebar documentation
refactor: archive legacy routes to /legacy
chore: update dependencies
```

**Pull Requests (español argentino formal):**
- Título y descripción en español argentino formal
- Asociar a milestone correspondiente
- Incluir descripción detallada con:
  - Resumen de cambios
  - Cambios específicos (bullet points)
  - Issues que cierra
  - Verificaciones realizadas
- Screenshots si hay cambios visuales
- Tests si hay lógica nueva

**Ejemplo de PR:**
```markdown
## 📋 Resumen

Consolida la documentación y archiva las rutas deprecadas.

## ✅ Cambios Realizados

- ✅ Creado SPEC.md completo
- ✅ Consolidados docs en /docs
- ✅ Archivadas rutas legacy

## 🎯 Cierra

- Cierra #45
- Cierra #46
```

### 7.4 Validaciones y CI/CD

**Git Hooks (Pre-commit):**

El proyecto usa un hook personalizado en `.githooks/pre-commit` que se ejecuta automáticamente antes de cada commit:

```bash
# Configurar hook (necesario en primera instalación)
git config core.hooksPath .githooks
```

**Qué hace el pre-commit hook:**
1. 🎨 **Auto-formateo con Prettier**: Formatea archivos `.ts` y `.svelte` en staging
2. 🔍 **Validación sintaxis Svelte**: Detecta errores comunes (etiquetas mal cerradas, etc.)
3. 🔬 **svelte-check**: Valida tipos TypeScript en componentes Svelte (opcional con confirmación)

**Importante**: Si no se ejecutó el hook, verificar:
```bash
# Ver configuración actual
git config core.hooksPath

# Debería mostrar: .githooks
# Si no, configurar manualmente:
git config core.hooksPath .githooks
```

**GitHub Actions CI:**

El proyecto tiene workflows configurados en `.github/workflows/`:

**`ci.yml` - Ejecuta en:**
- Push a `main` o `master`
- Pull Requests hacia `main` o `master`

**Jobs del CI:**
1. **Code Quality** (ESLint + Prettier check)
   - `npm run lint` - ESLint en todo el workspace
   - `npm run format:check` - Verificar formato Prettier

2. **TypeScript Validation**
   - `tsc --noEmit` en client/ y server/
   - Detecta errores de tipos sin generar archivos

3. **Build Frontend**
   - `npm run build` - Build completo de SvelteKit
   - Sube artifacts del build

4. **Tests & Coverage** (opcional, `continue-on-error: true`)
   - `npm run test:coverage` - Ejecuta tests con coverage
   - Sube reporte de cobertura

5. **Security Audit**
   - `npm audit` con diferentes niveles (high/critical)
   - No bloquea el merge (informativo)

6. **CI Summary**
   - Agrega resumen visual al PR
   - Falla si jobs críticos (quality, typescript, build) fallan

**Comandos locales equivalentes al CI:**
```bash
# Validación completa (igual que CI)
npm run check          # TypeScript check (client + server)
npm run lint           # ESLint
npm run format:check   # Prettier check
npm run build          # Build completo

# Autofix
npm run format         # Auto-formatear todo
```

**Troubleshooting común:**

| Problema | Causa | Solución |
|----------|-------|----------|
| Hook no se ejecuta | `core.hooksPath` no configurado | `git config core.hooksPath .githooks` |
| CI no corre en PR | PR no apunta a `main`/`master` | Cambiar base del PR |
| Falla lint en CI pero no local | Imports sin usar, tipos incorrectos | Ejecutar `npm run lint` localmente |
| Falla build en CI | Dependencias faltantes | Verificar `package.json` sincronizado |

**Convención de errores de lint permitidos:**

- ❌ **NO permitido**: Variables sin usar sin prefijo `_`
- ✅ **Permitido**: Variables con prefijo `_` (ej. `_unusedVar`)
- ❌ **NO permitido**: `any` sin justificación
- ❌ **NO permitido**: Imports sin usar

---

## 8. Testing

### 8.1 Estado Actual

**Unit Tests:**
- ✅ Tests de extracción de archivos (`server/scripts/test-extraction-accuracy.ts`)
- ✅ Tests de validación CUIT
- ✅ Tests de detección de códigos AFIP
- ❌ Falta: Tests de matching con Excel AFIP
- ❌ Falta: Tests de servicios

**E2E Tests:**
- ❌ No implementados

### 8.2 Archivos de Test

**Ejemplos para testing:**
```
examples/facturas/
├── factura1.yml          # Metadata esperada
├── factura1.pdf
├── factura2.yml
└── factura2.pdf
```

**Comando:**
```bash
npm run test:extraction
```

**Métricas actuales:**
- CUIT: 100% (con OCR fallback)
- Fecha: 100%
- Tipo: 100%
- Punto Venta: 87.5%
- Número: 87.5%
- Total: 50%

---

## 9. Roadmap y Backlog

### 9.1 Milestones Activos

Consultar GitHub Issues para tareas específicas:

**M0.5: Documentation & Cleanup** (Due: 2025-12-20)
- #45: Consolidar documentación y crear SPEC.md
- #46: Archivar rutas legacy a /legacy
- #47: Cerrar issues obsoletos

**M3: Emisores management** (Due: 2026-01-15)
- #48: Implementar edición de emisores
- Implementar eliminación con validación
- Búsqueda por CUIT/nombre

**M4: Dashboard features** (Due: 2026-02-01)
- Métricas y gráficos
- Accesos rápidos
- Notificaciones

**M5: Mejoras secundarias y nice-to-have**
- #31: Integración Google Sync
- #33: Annotate improvements
- Templates de extracción
- Mejoras de performance

### 9.2 Milestones Completados

**M0: DevOps y CI/CD** ✅
- Docker setup
- GitHub Actions
- Security audit

**M1: Navegación y layout** ✅
- Rail navigation
- TopBar component
- Responsive design

**M2: UI Components** ✅
- Melt UI migration
- Design tokens
- Sidebar pattern

---

## 10. Consideraciones Técnicas

### 10.1 Extracción de Datos

**Prioridad de métodos:**
1. **PDF_TEXT** (si el PDF tiene texto embebido)
2. **OCR** (Tesseract.js para PDFs escaneados/imágenes)
3. **Excel AFIP** (auto-completar campos desde datos fiscales)

**Estrategia de scoring:**
- Cada campo tiene un score de confianza
- CUIT tiene prioridad absoluta (activa OCR si falla)
- Fecha usa patrones específicos (±200 pts para match definitivo)
- Tipo de factura soporta texto pegado ("AFACTURA" → "A")

**Fallbacks:**
- Si CUIT detectado es de receptor conocido → penalización -300
- Si CUIT no se encuentra → OCR automático
- Si confianza total < threshold → status "reviewing"

### 10.2 Matching Excel AFIP

**Match exacto:**
```typescript
CUIT + Tipo + PuntoVenta + Número === expected_invoice
```

**Match por proximidad:**
```typescript
CUIT === expected.cuit
&& |Date - expected.date| <= 7 días
&& |Total - expected.total| <= 10%
```

**Estados:**
- `pending` - Factura esperada sin match
- `matched` - Match confirmado por usuario
- `ignored` - Usuario descartó la factura esperada

### 10.3 Performance

**Optimizaciones implementadas:**
- Lazy loading de componentes pesados
- Debounce en búsquedas (300ms)
- localStorage para filtros persistentes
- SPA navigation con `goto()` (sin full page reload)

**Pendientes:**
- Paginación en listados largos
- Virtual scrolling para miles de comprobantes
- Cache de previews de PDF

---

## 11. Dependencias Clave

### 11.1 Frontend (client/package.json)

```json
{
  "@sveltejs/kit": "^2.x",
  "svelte": "^5.41.0",
  "melt": "^0.42.0",                  // Melt UI Next (beta)
  "@melt-ui/svelte": "^0.86.6",       // Melt UI viejo (solo Dialog)
  "svelte-sonner": "^0.3.x",          // Toast notifications
  "prettier": "^3.x"
}
```

### 11.2 Backend (server/package.json)

```json
{
  "drizzle-orm": "^0.x",
  "better-sqlite3": "^11.x",
  "pdf-parse": "^1.x",
  "sharp": "^0.x",                    // Procesamiento de imágenes
  "tesseract.js": "^5.x",             // OCR
  "heic-convert": "^2.x"              // HEIC → JPEG
}
```

---

## 12. Deployment

### 12.1 Docker

**Build:**
```bash
docker build -t procesador-facturas .
```

**Run:**
```bash
docker compose up -d
```

**Healthcheck:**
```
GET http://localhost:5173/api/health
```

### 12.2 Variables de Entorno

**Client (.env):**
```bash
VITE_PORT=5173
PUBLIC_API_URL=http://localhost:5173
```

**Server (.env):**
```bash
DATABASE_URL=file:./database/invoices.db
NODE_ENV=production
```

---

## 13. Futuras Posibilidades (No Compromisos)

Estas ideas NO están en el roadmap actual pero podrían considerarse:

- [ ] Multi-tenant (varios usuarios, empresas separadas)
- [ ] API pública con autenticación JWT
- [ ] Exportación a formatos contables (Excel, CSV, JSON)
- [ ] Integración con sistemas ERP
- [ ] Machine Learning para mejorar detección
- [ ] OCR en tiempo real (mientras sube archivo)
- [ ] App mobile (React Native/Flutter)
- [ ] Notificaciones push
- [ ] Auditoría de cambios (historial de ediciones)
- [ ] Backup automático a Google Drive
- [ ] Plantillas de extracción por CUIT
- [ ] Detección de duplicados
- [ ] Validación contra constancia AFIP

---

## 14. Referencias

**Documentación oficial:**
- [Melt UI Next](https://context7.com/melt-ui/next-gen)
- [SvelteKit Docs](https://kit.svelte.dev/docs)
- [Svelte 5 Runes](https://svelte.dev/docs/svelte/overview)
- [Drizzle ORM](https://orm.drizzle.team/)

**Issues y Milestones:**
- [GitHub Issues](https://github.com/fcaldera/simple-procesador-facturas/issues)
- [GitHub Milestones](https://github.com/fcaldera/simple-procesador-facturas/milestones)

**Documentación interna:**
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/MELT-UI.md](docs/MELT-UI.md)
- [docs/SIDEBAR.md](docs/SIDEBAR.md)
- [docs/UI_UX.md](docs/UI_UX.md)

---

**Última revisión**: 2025-12-16
**Mantenedor**: @fcaldera
**Contribuidores**: Claude Sonnet 4.5, GitHub Copilot
