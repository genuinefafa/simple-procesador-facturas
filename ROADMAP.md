# Roadmap - Procesador de Facturas

## Estado Actual (2026-02-13)

| Área | Estado | Notas |
|------|--------|-------|
| **Sistema de Archivos** | ✅ Completo | `files` + `file_extraction_results` |
| **Matching Excel ARCA** | ✅ Completo | Backend + UI de comparación |
| **Categorías** | ✅ Completo | En invoices, expected_invoices y files |
| **Contratos Zod** | ✅ Completo | Validación runtime en PATCH endpoints |
| **Patrones SOLID** | ✅ Completo | ISP, DIP, Constructor Injection |
| **Build/TypeScript** | ✅ Limpio | svelte-check pasa sin errores |

---

## Cascada de Desarrollo

Plan de trabajo organizado en fases progresivas, alternando features con tech debt.

### ~~Fase 1: Limpiar UI + Quick Wins~~ ✅ Completada
*Objetivo: Cerrar M7 y mejoras visuales rápidas*

| Orden | Issue | Título | Tipo | Esfuerzo |
|-------|-------|--------|------|----------|
| 1 | #136 | ~~Eliminar TopBar Search temporalmente~~ | Cleanup | Bajo |
| 2 | #114 | ~~Migrar íconos Unicode a lucide-svelte~~ | UI | Bajo-Medio |
| 3 | #124 | ~~Fix emisores: historial desordenado y deep links~~ | Bug | Bajo |

→ **M7 Cerrado** ✅

### ~~Fase 2: Features Core~~ ✅ Completada
*Objetivo: Funcionalidades de alto valor*

| Orden | Issue | Título | Tipo | Esfuerzo | Estado |
|-------|-------|--------|------|----------|--------|
| 4 | #120 | ~~Balancear expected invoices (FAC ↔ NCR)~~ | Feature | Alto | ✅ PR #148 |
| 5 | #76 | ~~Múltiples métodos de extracción por archivo~~ | Feature | Alto | ✅ Completado |
| 6 | #135 | ~~Buscador manual de expected invoices~~ | Feature | Medio | ✅ Completado |
| - | #60 | ~~Extracción QR ARCA~~ | Feature | Medio | ✅ Completado |

### ~~Fase 3: Balance Groups~~ ✅ Completada
*Objetivo: Resolver expected invoices anuladas sin PDF*

| Orden | Issue | Título | Tipo | Esfuerzo | Estado |
|-------|-------|--------|------|----------|--------|
| 7 | #120 | Balancear expected invoices (FAC ↔ NCR) | Feature | Alto | ✅ PR #148 |

### ~~Fase 3.5: Fix Dropdowns~~ ✅ Completada
*Objetivo: Corregir posicionamiento de dropdowns Melt UI*

| Orden | Issue | Título | Tipo | Esfuerzo | Estado |
|-------|-------|--------|------|----------|--------|
| - | - | ~~Crear SelectDropdown wrapper + refactorizar Select-based dropdowns~~ | Fix/Refactor | Medio | ✅ PR #149 |
| - | #150 | Refactorizar EmitterCombobox para usar SelectDropdown | Tech Debt | Medio | Pendiente |

### Fase 4: Tech Debt Estratégico (M8)
*Objetivo: Simplificar el modelo de datos*

| Orden | Issue | Título | Tipo | Esfuerzo | Prioridad |
|-------|-------|--------|------|----------|-----------|
| 8 | #91 | Separar storage de OCR | Refactor | Bajo | ⬆️ Alta |
| 9 | #92 | Limpiar campos legacy en tabla facturas | Refactor | Bajo | ⬆️ Alta |
| 10 | #146 | Eliminar campo status de expected_invoices | Refactor | Bajo | Media |
| 11 | #123 | Derivar estados desde FKs (ex-M6) | Refactor | Medio | Media |
| 12 | #150 | Unificar EmitterCombobox con SelectDropdown | Refactor | Medio | Media |

### Fase 5: Robustez y Calidad (M8)
*Objetivo: Estabilidad y UX avanzada*

| Orden | Issue | Título | Tipo | Esfuerzo | Prioridad |
|-------|-------|--------|------|----------|-----------|
| 12 | #56 | Detector de duplicados + merge de facturas | Feature | Alto | Media |
| 13 | #51 | Operaciones batch en listado | Feature | Medio | Baja |
| 14 | #119 | Tests E2E con Playwright | QA | Alto | Paralelo |

---

## Milestones

### M7: UX Improvements (Febrero 2026) ✅ Cerrado
- [x] #136 - Eliminar TopBar Search
- [x] #114 - lucide-svelte icons
- [x] #124 - Fix emisores
- [x] #132 - Categorías en expected/files
- [x] #121 - Consolidar filtros búsqueda
- [x] #90 - Rediseño UX vista comprobante
- [x] #83 - Navegación entre comprobantes
- [x] #75 - Documentación
- [x] #63 - Migrar Dialog a Melt Next
- [x] #55 - Categoría en expected invoices

### M8: UX & Data Quality (Q1 2026) - Sprint Activo
**Prioridades sugeridas:**
1. #91 - Separar storage de OCR (Low)
2. #92 - Limpiar campos legacy (Low)
3. #146 - Eliminar campo status expected_invoices (Low)
4. #56 - Detector duplicados (High)

**Otros:**
- [ ] #51 - Operaciones batch
- [ ] #119 - Tests E2E Playwright
- [ ] #123 - Derivar estados desde FKs (movido de M6)
- [ ] #36 - Auditoría cambios
- [ ] #89 - Contratos Zod completos
- [ ] #150 - Unificar EmitterCombobox con SelectDropdown
- [x] #156 - Fix HEIC preview (PR #157)
- [x] #79 - Rediseño vista detalle
- [x] #135 - Buscador manual expected invoices
- [x] #120 - Balancear expected invoices (PR #148)
- [x] Fix posicionamiento dropdowns (PR #149)
- [x] Fix layout roto en lista comprobantes + URLs compartibles (PR #153)
- [x] #151 - Fix QR extractor sliding window (PR #154)
- [x] #152 - Cleanup fallbacks y restringir auto-extracción (PR #155)

### M9: Mejoras de Reconocimiento (Q1-Q2 2026)
- [x] #76 - Múltiples métodos extracción
- [x] #60 - Extracción QR ARCA
- [x] #151 - QR extractor no detecta QR de ARCA en imagen de Movistar (PR #154)
- [x] #152 - Limpiar fallbacks en extracción y restringir auto-procesamiento al subir (PR #155)
- [x] #156 - HEIC file preview broken (Content-Type hardcoded a application/pdf) (PR #156)
- [ ] #54 - Simplificar algoritmo matching
- [ ] #93 - Testing extracción docs confidenciales
- [ ] #129 - Importar desglose impositivo ARCA
- [ ] #134 - Receptores conocidos en JSON

### M10: Cloud Sync (Q2 2026)
- [ ] #122 - Integración ARCA descarga automática
- [ ] #87 - Sincronización OneDrive
- [ ] #33 - Revisar UI Sincronización
- [ ] #20 - Migrar SyncPage y AnnotatePage

### M6: Code Quality ✅ Cerrado
- 7 issues completados, 0 abiertos
- #99 y #100 movidos a Icebox, #123 movido a M8

### Icebox
Issues depriorizados o en espera de mejor definición:
- #11 - Migrar EmitterRepository/ZoneAnnotationRepository a Drizzle
- #31 - Revisar UI/UX página Entrenamiento
- #69 - Sincronizar datos facturas al actualizar expected_invoice
- #71 - File Integrity Checker
- #78 - Mejorar TopBar Search (reemplazado por #136)
- #82 - Copiar lista al portapapeles
- #99 - Estrategia tipos fechas (ex-M6)
- #100 - Renombrar endpoint process → extract (ex-M6)
- #128 - OR en filtros con coma
- #130 - Dashboard rediseño LayerChart
- #140 - Migrar íconos Unicode restantes

---

## Issues sin asignar a milestone

✅ **Todos los issues tienen milestone asignado** (actualizado 2026-02-13)

---

## Patrones de Arquitectura

### Contratos Zod (`server/contracts/`)
Validación runtime para API boundaries:
- `InvoicePatchSchema`, `ExpectedInvoicePatchSchema`
- `formatZodError()` para respuestas consistentes

### Servicios de Cliente (`client/src/lib/services/`)
Encapsulación de llamadas API:
- `ComprobanteService`, `EmitterService`, `CategoryService`
- Patrón `ApiResult<T>` para respuestas tipadas

### Interface Segregation (ISP)
Tipos segregados por caso de uso en `*.types.ts`

### Dependency Inversion (DIP)
Callbacks opcionales + Constructor Injection en servicios

---

## Historial de Releases

### v0.6.0 - Categories & UX (2026-02)
- Categorías en expected_invoices y files
- Pre-selección de categoría en uploads
- Filtros de búsqueda consolidados
- Navegación entre comprobantes

### v0.5.0 - Unified File Management (2026-01-16)
- Migración a `files` + `file_extraction_results`
- Sistema de hashing SHA-256
- Contratos Zod iniciales

### v0.4.0 - Dashboard + Hub (2025-12)
- Dashboard principal
- Comprobantes Hub unificado
- Gestión de emisores

### v0.3.0 - OCR + Excel (2025-11)
- Tesseract.js OCR
- Matching con Excel AFIP
- Soporte HEIC

---

## Comandos de Desarrollo

```bash
npm run dev              # Desarrollo http://localhost:5173
npm run check            # TypeScript
npm run lint             # ESLint
npm run test             # Vitest
npm run db:migrate       # Aplicar migraciones
npm run db:studio        # GUI Drizzle
```

---

**Última actualización**: 2026-02-13
