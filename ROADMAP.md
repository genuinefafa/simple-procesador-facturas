# Roadmap - Procesador de Facturas

## Estado Actual (2026-02-02)

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

### Fase 1: Limpiar UI + Quick Wins
*Objetivo: Cerrar M7 y mejoras visuales rápidas*

| Orden | Issue | Título | Tipo | Esfuerzo |
|-------|-------|--------|------|----------|
| 1 | #136 | Eliminar TopBar Search temporalmente | Cleanup | Bajo |
| 2 | #114 | Migrar íconos Unicode a lucide-svelte | UI | Bajo-Medio |
| 3 | #124 | Fix emisores: historial desordenado y deep links | Bug | Bajo |

→ **Cierra M7** ✅

### Fase 2: Features Core
*Objetivo: Funcionalidades de alto valor*

| Orden | Issue | Título | Tipo | Esfuerzo |
|-------|-------|--------|------|----------|
| 4 | #120 | Balancear expected invoices (FAC ↔ NCR) | Feature | Alto |
| 5 | #76 | Múltiples métodos de extracción por archivo | Feature | Alto |
| 6 | #135 | Buscador manual de expected invoices | Feature | Medio |

### Fase 3: Tech Debt Estratégico
*Objetivo: Simplificar el modelo de datos*

| Orden | Issue | Título | Tipo | Esfuerzo |
|-------|-------|--------|------|----------|
| 7 | #91 | Verificar/cerrar: separar storage de OCR | Verificar | Bajo |
| 8 | #123 | Derivar estados desde FKs (eliminar campo status) | Refactor | Medio |
| 9 | #92 | Limpiar campos legacy en tabla facturas | Refactor | Bajo |

### Fase 4: Robustez y Calidad
*Objetivo: Estabilidad y UX avanzada*

| Orden | Issue | Título | Tipo | Esfuerzo |
|-------|-------|--------|------|----------|
| 10 | #56 | Detector de duplicados + merge de facturas | Feature | Alto |
| 11 | #51 | Operaciones batch en listado | Feature | Medio |
| 12 | #119 | Tests E2E con Playwright | QA | Alto |

---

## Milestones

### M7: UX Improvements (Febrero 2026) - En progreso
- [ ] #136 - Eliminar TopBar Search
- [ ] #114 - lucide-svelte icons
- [ ] #124 - Fix emisores
- [x] #132 - Categorías en expected/files
- [x] #121 - Consolidar filtros búsqueda
- [x] #90 - Rediseño UX vista comprobante
- [x] #83 - Navegación entre comprobantes
- [x] #75 - Documentación
- [x] #63 - Migrar Dialog a Melt Next
- [x] #55 - Categoría en expected invoices

### M8: UX & Data Quality (Q1 2026)
- [ ] #120 - Balancear expected invoices
- [ ] #56 - Detector duplicados
- [ ] #51 - Operaciones batch
- [ ] #119 - Tests E2E Playwright
- [ ] #92 - Limpiar campos legacy
- [ ] #123 - Derivar estados desde FKs
- [x] #79 - Rediseño vista detalle

### M9: Mejoras de Reconocimiento (Q1-Q2 2026)
- [ ] #76 - Múltiples métodos extracción
- [ ] #60 - Códigos ARCA nativos en extractores
- [ ] #54 - Simplificar algoritmo matching
- [ ] #93 - Testing extracción docs confidenciales

### M10: Cloud Sync (Q2 2026)
- [ ] #122 - Integración ARCA descarga automática
- [ ] #87 - Sincronización OneDrive
- [ ] #33 - Revisar UI Sincronización
- [ ] #20 - Migrar SyncPage y AnnotatePage

### Icebox
Issues depriorizados o en espera de mejor definición:
- #78 - Mejorar TopBar Search (reemplazado por #136)
- #82 - Copiar lista al portapapeles
- #89 - Contratos Zod completos
- #99 - Estrategia tipos fechas
- #100 - Renombrar endpoint process → extract
- #101 - Separar DocumentType
- #130 - Dashboard rediseño LayerChart
- #134 - Receptores en config JSON

---

## Issues sin asignar a milestone

Pendientes de clasificar o relacionados con fases actuales:

| Issue | Título | Sugerencia |
|-------|--------|------------|
| #135 | Buscador manual expected invoices | Fase 2 (relacionado #120) |
| #128 | OR en filtros con coma | M7 o Icebox |
| #129 | Importar desglose impositivo ARCA | M9 |

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

**Última actualización**: 2026-02-02
