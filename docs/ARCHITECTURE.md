# Arquitectura del Sistema

**Versión**: v0.4.0
**Última actualización**: 2025-12-16

---

## 1. Resumen

El sistema es una **aplicación fullstack** construida con SvelteKit que procesa facturas (PDFs/imágenes) mediante extracción de texto y OCR, permitiendo la gestión manual de comprobantes fiscales.

## 2. Stack Tecnológico

### Frontend
- **Framework**: SvelteKit 2.x
- **UI Library**: Svelte 5.41.0 (runes: $state, $derived, $bindable)
- **Components**: Melt UI Next v0.42 (beta) + @melt-ui/svelte v0.86
- **Styling**: CSS puro con design tokens (no Tailwind)
- **Notifications**: svelte-sonner

### Backend
- **Runtime**: Node.js 22.x
- **Database**: SQLite
- **ORM**: Drizzle ORM
- **PDF Processing**: pdf-parse
- **OCR**: Tesseract.js
- **Image Processing**: sharp, heic-convert

### DevOps
- **Package Manager**: npm
- **Build Tool**: Vite
- **Docker**: Multi-stage Dockerfile
- **CI/CD**: GitHub Actions

## 3. Estructura de Directorios

```
simple-procesador-facturas/
├── client/                         # Frontend (SvelteKit)
│   ├── src/
│   │   ├── lib/
│   │   │   ├── components/
│   │   │   │   ├── ui/            # Primitivos Melt UI
│   │   │   │   ├── TopBar.svelte
│   │   │   │   ├── RailNav.svelte
│   │   │   │   └── ComprobanteCard.svelte
│   │   │   └── stores/
│   │   │       └── toast.ts
│   │   └── routes/
│   │       ├── +layout.svelte
│   │       ├── dashboard/         # Dashboard principal
│   │       ├── comprobantes/      # Hub unificado
│   │       ├── emisores/          # Gestión de emisores
│   │       ├── google-sync/
│   │       ├── entrenamiento/
│   │       ├── annotate/
│   │       └── api/               # API endpoints
│   └── vite.config.ts
│
├── server/                         # Backend (Services + DB)
│   ├── database/
│   │   ├── schema.ts              # Drizzle schema
│   │   ├── repositories/          # Data access layer
│   │   └── migrations/
│   ├── services/
│   │   ├── invoice-processing.service.ts
│   │   ├── excel-import.service.ts
│   │   └── file-export.service.ts
│   ├── extractors/
│   │   ├── pdf-extractor.ts       # PDF_TEXT extraction
│   │   └── ocr-extractor.ts       # Tesseract OCR
│   ├── validators/
│   │   └── cuit.ts                # Validación módulo 11
│   └── utils/
│       └── afip-codes.ts          # Códigos de tipo de factura
│
├── docs/                           # Documentación consolidada
│   ├── ARCHITECTURE.md             # Este archivo
│   ├── MELT-UI.md
│   ├── SIDEBAR.md
│   └── UI_UX.md
│
├── legacy/                         # Rutas deprecadas (solo dev)
│   ├── +layout.svelte             # Guard: solo visible en dev
│   ├── importar/
│   ├── procesar/
│   ├── facturas/
│   └── pending-files/
│
├── examples/facturas/              # Test fixtures
├── SPEC.md                         # Especificación técnica
├── README.md
├── CHANGELOG.md
├── ROADMAP.md
├── package.json
└── docker-compose.yml
```

## 4. Capas del Sistema

### 4.1 Frontend (client/)

**Responsabilidades**:
- Interfaz de usuario
- Gestión de estado local (runes)
- Llamadas a API endpoints
- Validación de formularios
- Navegación SPA

**Componentes principales**:
- **Layout**: TopBar + RailNav (navegación lateral colapsable)
- **Pages**: Dashboard, Comprobantes Hub, Emisores
- **UI Components**: Button, Input, Dialog, Tabs, Dropdown, Sidebar

### 4.2 Backend (server/)

**Responsabilidades**:
- Lógica de negocio
- Acceso a base de datos
- Procesamiento de archivos
- Extracción de texto/OCR
- Matching con Excel AFIP

**Servicios principales**:
- **InvoiceProcessingService**: Orquesta extracción + matching + validación
- **ExcelImportService**: Parsea Excel AFIP y crea registros esperados
- **FileExportService**: Renombra y exporta archivos procesados

### 4.3 Base de Datos

**Motor**: SQLite (archivo local)
**ORM**: Drizzle

**Tablas principales**:
- `invoices` - Facturas procesadas
- `pending_files` - Archivos subidos pendientes de revisión
- `expected_invoices` - Facturas esperadas desde Excel AFIP
- `emitters` - Emisores de facturas
- `categories` - Categorías de facturas
- `import_batches` - Lotes de importación de Excel

## 5. Flujo de Datos

### 5.1 Procesamiento de Facturas

```
┌─────────────┐
│  Usuario    │
└──────┬──────┘
       │ 1. Sube archivo (PDF/JPG/PNG/HEIC)
       ↓
┌─────────────────────────────┐
│  POST /api/invoices/upload  │
└─────────────┬───────────────┘
              │ 2. Guarda en pending_files
              │    status = "pending"
              ↓
┌──────────────────────────────┐
│  GET /comprobantes           │ ← Usuario ve el archivo
└─────────────┬────────────────┘
              │ 3. Click "Reconocer"
              ↓
┌──────────────────────────────────┐
│  POST /api/invoices/process      │
│  ┌─────────────────────────────┐ │
│  │ InvoiceProcessingService    │ │
│  │ ├─ PDF_TEXT (si es digital) │ │
│  │ ├─ OCR (si es escaneado)    │ │
│  │ └─ Excel matching           │ │
│  └─────────────────────────────┘ │
└─────────────┬────────────────────┘
              │ 4. Retorna extractedData
              │    status = "reviewing"
              ↓
┌──────────────────────────────────┐
│  GET /comprobantes/[id]          │ ← Usuario revisa
│  ├─ Datos extraídos              │
│  ├─ Comparación con Excel AFIP   │
│  └─ Edición manual               │
└─────────────┬────────────────────┘
              │ 5. Click "Confirmar"
              ↓
┌──────────────────────────────────┐
│  PATCH /api/invoices/[id]        │
│  ├─ Crea registro en invoices    │
│  └─ status = "processed"         │
└──────────────────────────────────┘
```

### 5.2 Matching con Excel AFIP

```
┌─────────────┐
│  Usuario    │
└──────┬──────┘
       │ 1. Importa Excel AFIP
       ↓
┌──────────────────────────────────────┐
│  POST /api/expected-invoices/import  │
│  ┌─────────────────────────────────┐ │
│  │ ExcelImportService              │ │
│  │ ├─ Parsea columnas              │ │
│  │ └─ Crea registros en BD         │ │
│  └─────────────────────────────────┘ │
└──────────────────────────────────────┘
       │
       │ 2. Al procesar archivo
       ↓
┌──────────────────────────────────────┐
│  InvoiceProcessingService            │
│  ├─ Busca match exacto (CUIT+tipo+#) │
│  ├─ Busca candidatos (CUIT+fecha+$)  │
│  └─ Retorna matches encontrados      │
└─────────────┬────────────────────────┘
              │ 3a. Match único → auto-completa
              │ 3b. Múltiples → usuario elige
              │ 3c. Sin match → procesamiento normal
              ↓
┌──────────────────────────────────────┐
│  POST /api/expected-invoices/[id]/   │
│       match                          │
│  ├─ Marca expected_invoice matched   │
│  └─ Vincula con pending_file         │
└──────────────────────────────────────┘
```

## 6. Estrategias de Extracción

### 6.1 Prioridad de Métodos

```
1. PDF_TEXT (PDF digital con texto embebido)
   ├─ Más rápido
   ├─ Más preciso
   └─ Requiere PDF con capa de texto

2. OCR (Tesseract.js para PDFs escaneados/imágenes)
   ├─ Más lento
   ├─ Menos preciso
   └─ Funciona con cualquier imagen

3. Excel AFIP (auto-completar desde datos fiscales)
   ├─ Requiere importación previa
   └─ Sirve como fuente de verdad
```

### 6.2 Sistema de Scoring

Cada campo detectado recibe un score de confianza:

- **CUIT**: Score + validación módulo 11 + penalización si es receptor conocido
- **Fecha**: Patrones específicos (dd/mm/yyyy, dd-mm-yyyy) con ±200 pts
- **Tipo de factura**: Detección de código AFIP ("A", "B", "C", "01", "06", etc.)
- **Punto de venta**: Números de 4 dígitos
- **Número de factura**: Números de 8 dígitos

**Fallbacks**:
- Si CUIT no se encuentra → OCR automático
- Si CUIT es de receptor conocido → penalización -300
- Si confianza total < threshold → status "reviewing"

## 7. API REST

### 7.1 Endpoints por Recurso

#### Comprobantes
- `POST /api/invoices/upload` - Subir archivo
- `POST /api/invoices/process` - Procesar con OCR/matching
- `GET /api/invoices` - Listar facturas
- `PATCH /api/invoices/[id]` - Editar campos
- `DELETE /api/invoices/[id]` - Eliminar factura
- `POST /api/invoices/export` - Exportar con renombrado

#### Archivos Pendientes
- `GET /api/pending-files` - Listar archivos pendientes
- `GET /api/pending-files/[id]` - Obtener detalle
- `GET /api/pending-files/[id]/matches` - Matches con Excel AFIP
- `DELETE /api/pending-files/[id]` - Eliminar archivo

#### Excel AFIP
- `POST /api/expected-invoices/import` - Importar Excel
- `GET /api/expected-invoices` - Listar facturas esperadas
- `POST /api/expected-invoices/[id]/match` - Confirmar match
- `GET /api/expected-invoices/template` - Descargar template

#### Emisores
- `GET /api/emitters` - Listar emisores
- `POST /api/emitters` - Crear emisor
- `PATCH /api/emitters/[id]` - Editar emisor (⏳ pendiente)
- `DELETE /api/emitters/[id]` - Eliminar emisor (⏳ pendiente)

#### Categorías
- `GET /api/categories` - Listar categorías
- `POST /api/categories` - Crear categoría
- `PATCH /api/categories/[id]` - Editar categoría
- `DELETE /api/categories/[id]` - Eliminar categoría

## 8. Seguridad

### 8.1 Validaciones

- **CUIT**: Validación módulo 11
- **Tipos de archivo**: Solo PDF, JPG, PNG, HEIC (max 10MB)
- **Sanitización**: Nombres de archivo sanitizados
- **SQL Injection**: Protegido por Drizzle ORM (prepared statements)

### 8.2 Autenticación

**Estado actual**: ❌ No implementada
**Futuro**: Considerar JWT o session-based auth

## 9. Performance

### 9.1 Optimizaciones Implementadas

- ✅ Lazy loading de componentes pesados
- ✅ Debounce en búsquedas (300ms)
- ✅ localStorage para filtros persistentes
- ✅ SPA navigation con `goto()` (sin full page reload)

### 9.2 Optimizaciones Pendientes

- [ ] Paginación en listados largos
- [ ] Virtual scrolling para miles de comprobantes
- [ ] Cache de previews de PDF
- [ ] Compresión de imágenes al subir
- [ ] Procesamiento en background (workers)

## 10. Testing

### 10.1 Tests Implementados

**Unit Tests**:
- ✅ Extracción de archivos (`server/scripts/test-extraction-accuracy.ts`)
- ✅ Validación CUIT
- ✅ Detección de códigos AFIP
- ✅ Sistema de scoring de fechas

**Métricas actuales**:
- CUIT: 100% (con OCR fallback)
- Fecha: 100%
- Tipo: 100%
- Punto Venta: 87.5%
- Número: 87.5%
- Total: 50%

### 10.2 Tests Faltantes

- [ ] Tests de matching con Excel AFIP
- [ ] Tests de servicios
- [ ] E2E tests (Playwright)
- [ ] Tests de componentes UI

## 11. Deployment

### 11.1 Docker

```bash
# Build
docker build -t procesador-facturas .

# Run
docker compose up -d
```

**Healthcheck**: `GET /api/health`

### 11.2 Variables de Entorno

```bash
# Client
VITE_PORT=5173
PUBLIC_API_URL=http://localhost:5173

# Server
DATABASE_URL=file:./database/invoices.db
NODE_ENV=production
```

## 12. Evolución Histórica

**v0.1 - CLI Básico**
- Comando `procesador process`
- SQLite con schema.sql manual

**v0.2 - Web-Only**
- API REST completa
- Drizzle ORM
- Docker setup

**v0.3 - OCR + Excel**
- Tesseract.js
- Matching AFIP
- Sistema pending_files

**v0.4 - Dashboard + Hub** (actual)
- Melt UI Next
- Comprobantes Hub unificado
- Gestión de emisores
- Rail navigation

## 13. Decisiones de Diseño

### 13.1 ¿Por qué SvelteKit?

- Fullstack framework (frontend + backend)
- File-based routing
- API endpoints integrados
- Svelte 5 con runes (reactivity moderna)

### 13.2 ¿Por qué SQLite?

- Sin dependencias externas (no Postgres/MySQL)
- Archivo local (fácil backup)
- Suficiente para uso mono-usuario
- Drizzle ORM soporta migraciones

### 13.3 ¿Por qué Melt UI Next?

- Headless (total control de estilos)
- Accesibilidad garantizada
- Compatible Svelte 5
- Sin dependencias pesadas (no Tailwind)

### 13.4 ¿Por qué Excel AFIP como fuente de verdad?

- AFIP provee datos estructurados y validados
- PDFs escaneados pueden ser borrosos/ilegibles
- Sistema detecta mínimo (CUIT) y completa desde Excel
- Reduce trabajo manual de transcripción

## 14. Referencias

- [SvelteKit Docs](https://kit.svelte.dev/docs)
- [Svelte 5 Runes](https://svelte.dev/docs/svelte/overview)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Melt UI Next](https://context7.com/melt-ui/next-gen)
- [Tesseract.js](https://tesseract.projectnaptha.com/)

---

**Última revisión**: 2025-12-16
**Mantenedor**: @fcaldera
