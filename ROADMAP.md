# Roadmap - Procesador de Facturas

## Estado Actual (2026-01-26)

| Área | Estado | Notas |
|------|--------|-------|
| **Sistema de Archivos** | ✅ Completo | `files` + `file_extraction_results` (Issue #40) |
| **Matching Excel AFIP** | 🔶 85% | Backend completo, UI de comparación lista |
| **Contratos Zod** | ✅ Completo | Validación runtime en PATCH endpoints |
| **Patrones SOLID** | 🔶 En progreso | ISP y DIP implementados en componentes clave |
| **Build/TypeScript** | ✅ Limpio | svelte-check pasa sin errores |

---

## Issues Abiertos Prioritarios

### Refactoring & Tech Debt

| Issue | Título | Prioridad |
|-------|--------|-----------|
| #113 | Implementar DI con Constructor Injection | Alta |
| #102 | Mover tipos compartidos a `shared/` | Alta |
| #101 | Separar DocumentType en InvoiceType + ExtractionMethod | Media |
| #100 | Renombrar `/api/invoices/process` → `/api/files/extract` | Media |
| #99 | Definir estrategia de tipos para fechas | Media |
| #92 | Limpiar campos legacy en tabla facturas | Media |
| #91 | Separar almacenamiento - OCR no debe renombrar | Media |
| #89 | Contratos API tipados con Zod (parcialmente hecho) | Baja |

### Features

| Issue | Título | Prioridad |
|-------|--------|-----------|
| #114 | Migrar íconos Unicode a lucide-svelte | Alta |
| #76 | Múltiples métodos de extracción por archivo | Media |
| #79 | Rediseño UI/UX de vista detalle | Media |
| #78 | Mejorar TopBar Search | Baja |
| #82 | Copiar lista de comprobantes al portapapeles | Baja |
| #87 | Sincronización con OneDrive | Baja |

### Documentación & QA

| Issue | Título | Prioridad |
|-------|--------|-----------|
| #75 | Reorganizar documentación | Alta (este issue) |
| #93 | Testing de extracción con docs confidenciales | Media |

---

## Milestones

### M6: Code Quality (Q1 2026)
- [ ] #113 - Constructor Injection
- [ ] #102 - Shared types
- [ ] #114 - lucide-svelte icons
- [ ] #75 - Documentación

### M7: UX Improvements (Q1 2026)
- [ ] #79 - Rediseño vista detalle
- [ ] #78 - TopBar Search
- [ ] #76 - Múltiples métodos extracción

### M8: Integrations (Q2 2026)
- [ ] #87 - OneDrive sync
- [ ] Google Drive improvements

---

## Patrones de Arquitectura Implementados

### Contratos Zod (`server/contracts/`)
Validación runtime con Zod para API boundaries:
- `InvoicePatchSchema` - PATCH /api/invoices/:id
- `ExpectedInvoicePatchSchema` - PATCH /api/expected-invoices/:id
- `formatZodError()` - Respuestas de error consistentes

### Servicios de Cliente (`client/src/lib/services/`)
Encapsulación de llamadas API:
- `ComprobanteService` - Operaciones CRUD de facturas
- `EmitterService` - Gestión de emisores
- Patrón `ApiResult<T>` para respuestas tipadas

### Interface Segregation (ISP)
Tipos segregados por caso de uso:
- `InvoiceCard.types.ts` - Tipos separados para view/create
- `InvoiceViewData` vs `InvoiceCreateData`

### Dependency Inversion (DIP)
Callbacks opcionales para testing:
- `NavigationBar.onnavigate` - Navegación inyectable
- `InvoiceCard.oncategorychange` - Acciones delegadas

---

## Historial de Releases

### v0.5.0 - Unified File Management (2026-01-16)
- Migración de `pending_files` a `files` + `file_extraction_results`
- Sistema de hashing SHA-256 para integridad
- Contratos Zod iniciales

### v0.4.0 - Dashboard + Hub (2025-12)
- Dashboard principal
- Comprobantes Hub unificado
- Gestión de emisores
- Rail navigation

### v0.3.0 - OCR + Excel (2025-11)
- Tesseract.js OCR
- Matching con Excel AFIP
- Soporte HEIC

### v0.2.0 - Web-Only (2025-11)
- API REST completa
- Drizzle ORM
- Docker setup

---

## Archivos Clave

### Backend
```
server/
├── contracts/           # Schemas Zod para validación
│   ├── index.ts
│   ├── invoice.ts
│   ├── expected-invoice.ts
│   └── shared.ts
├── database/
│   ├── schema.ts        # Drizzle schema
│   └── repositories/
├── services/
│   ├── invoice-processing.service.ts
│   └── excel-import.service.ts
└── extractors/
    ├── pdf-extractor.ts
    └── ocr-extractor.ts
```

### Frontend
```
client/src/
├── lib/
│   ├── components/
│   │   ├── InvoiceCard.svelte
│   │   ├── InvoiceCard.types.ts   # Tipos segregados
│   │   └── NavigationBar.svelte   # DI example
│   └── services/
│       ├── ComprobanteService.ts
│       └── EmitterService.ts
└── routes/
    ├── comprobantes/
    └── api/
```

---

## Comandos de Desarrollo

```bash
# Desarrollo
npm run dev              # http://localhost:5173

# Base de datos
npm run db:migrate       # Aplicar migraciones
npm run db:studio        # GUI Drizzle

# Calidad
npm run check            # TypeScript
npm run lint             # ESLint
npm run format           # Prettier

# Tests
npm run test             # Vitest
npm run test:extraction  # Tests de extracción
```

---

**Última actualización**: 2026-01-26
