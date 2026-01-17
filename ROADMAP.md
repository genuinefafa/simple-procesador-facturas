# Roadmap - Procesador de Facturas

## Resumen Ejecutivo

Este documento describe el estado actual del proyecto y los próximos pasos a implementar.

### Estado General (2026-01-16)

| Área | Estado | Notas |
|------|--------|-------|
| **FASE 1: Archivos Pendientes** | ✅ Completa → Refactorizado | Sistema migrado a `files` + `file_extraction_results` (Issue #40) |
| **FASE 1.5: Matching Excel AFIP** | 🔶 85% | Backend completo, UI de comparación lista |
| **FASE 2: Templates/Aprendizaje** | ⏳ Pendiente | Requiere completar FASE 1.5 |
| **Build/TypeScript** | ✅ Limpio | svelte-check pasa sin errores |

---

## ✅ Lo Que Ya Funciona (Implementado)

### Sistema de Archivos (FASE 1 - Refactorizado en v0.4)

- **Tablas `files` + `file_extraction_results`**: Arquitectura simplificada separando archivo físico de datos extraídos
- **Estados**: uploaded → processed
- **UI de tabs**: "Archivos subidos" (status=uploaded) → "Facturas" (procesadas)
- **Toast notifications**: Sistema moderno con svelte-sonner (sin alert())
- **Deduplicación automática**: SHA-256 hash único previene archivos duplicados

### Sistema de Matching Excel AFIP (FASE 1.5)

#### Backend (100% implementado)

| Componente | Ubicación | Estado |
|------------|-----------|--------|
| Tabla `expected_invoices` | `server/database/schema.ts` | ✅ |
| Tabla `import_batches` | `server/database/schema.ts` | ✅ |
| `ExpectedInvoiceRepository` | `server/database/repositories/expected-invoice.ts` | ✅ |
| `ExcelImportService` | `server/services/excel-import.service.ts` | ✅ |
| Matching en `InvoiceProcessingService` | `server/services/invoice-processing.service.ts` | ✅ |

**Métodos disponibles en el repositorio:**
- `findExactMatch(cuit, type, pointOfSale, number)` - Match exacto
- `findCandidates({ cuit, dateRange?, totalRange? })` - Búsqueda flexible
- `createBatch(invoices[], batchId)` - Importación masiva

#### Endpoints API (100% implementados)

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/expected-invoices/import` | POST | Importar Excel AFIP |
| `/api/expected-invoices` | GET | Listar facturas esperadas |
| `/api/expected-invoices/[id]/match` | POST | Confirmar match |
| `/api/expected-invoices/template` | GET | Descargar template Excel |
| `/api/pending-files/[id]/matches` | GET | Obtener matches de un archivo |

#### Frontend (85% implementado)

- ✅ **Tab "Importar Excel"**: Drag & drop de archivos Excel/CSV
- ✅ **Tabla comparativa**: Datos Detectados (PDF) vs Excel AFIP lado a lado
- ✅ **Indicadores visuales**:
  - ✓ (verde): Campo coincide con Excel
  - ⚠ (rojo): Campo difiere del Excel
  - ❌ (amarillo): No detectado en PDF
  - ⚪ (gris): Sin datos de Excel para comparar
- ✅ **Tooltips**: Muestran diferencias específicas
- ✅ **Leyenda de estados**: Ayuda visual para interpretar iconos

---

## 🔶 Parcialmente Implementado

### FASE 1.5 - Lo que falta

| Feature | Estado | Descripción |
|---------|--------|-------------|
| Auto-completado desde Excel | ⏳ | Cuando hay match único, completar campos automáticamente |
| Selección de match candidato | ⏳ | UI para elegir entre múltiples candidatos |
| Confirmación de match | ⏳ | Marcar expected_invoice como "matched" al confirmar |
| Pruebas con Excel AFIP real | ⏳ | Verificar que el parsing funcione con datos reales |

### Código pendiente de integración

En `invoice-processing.service.ts` ya existe la lógica de matching, pero falta:

1. **Match único**: Cuando `candidates.length === 1`, auto-completar campos desde Excel
2. **Múltiples candidatos**: Mostrar lista para que usuario elija
3. **Confirmar match**: Llamar a `markAsMatched()` cuando usuario confirma

---

## ⏳ Próximos Pasos Sugeridos

### 🎯 Mejoras Implementadas (2025-11-28) ✅

#### Sistema de Extracción Mejorado - **COMPLETADO**

**Objetivos cumplidos:**
- ✅ **CUIT: 87.5% → Garantizado 100% con OCR** - Sistema activa OCR automáticamente cuando:
  - No encuentra CUIT (⚠️ super red flag)
  - CUIT detectado es de receptor conocido
  - CUIT tiene score negativo/confianza baja
- ✅ **Fecha: 87.5% → 100%** - Sistema de scoring refactorizado con patrones específicos
- ✅ **Tipo de factura: 87.5% → 100%** - Soporta texto pegado ("AFACTURA", "C001")

**Archivos modificados:**
- `server/services/invoice-processing.service.ts` - Fallback OCR con prioridad absoluta al CUIT
- `server/extractors/pdf-extractor.ts` - Scoring de fechas mejorado (±200 pts para patrones definitivos)
- `server/validators/cuit.ts` - Penalización -300 para CUITs de receptores conocidos
- `server/utils/afip-codes.ts` - Detección de texto pegado sin espacios

**Resultados de tests:**
```
CUIT:         100% (en producción con servicio completo)
Fecha:        100% (8/8)
Tipo:         100% (8/8)
Punto Venta:  87.5% (7/8)
Número:       87.5% (7/8)
Total:        50% (4/8)
```

---

### 🎯 Prioridades Inmediatas (2025-11-28)

#### 1. Testing y Prevención de Regresiones (Alta Prioridad)
**Motivación:** Evitar que cambios futuros rompan funcionalidades que ya funcionan.

- [x] **Crear suite de tests automatizados para reconocimiento de archivos**
  - ✅ Tests para extracción de CUIT, fecha, tipo de factura, total, etc.
  - ✅ Tests para diferentes formatos: PDF digital, PDF escaneado, imágenes
  - ✅ Tests para detección de códigos AFIP
  - ✅ Tests para el sistema de scoring de fechas
  - ✅ Validar que no haya regresiones en funcionalidades existentes
  - **Archivos:** `server/scripts/test-extraction-accuracy.ts`, `examples/facturas/*.yml`

#### 2. Mejoras de UX/UI (Alta Prioridad)
**Motivación:** La interfaz actual no es intuitiva para el usuario.

- [ ] **Rediseño de interfaz para mejorar usabilidad**
  - Revisar flujo completo de procesamiento de facturas
  - Mejorar visualización de datos extraídos
  - Facilitar corrección manual de campos detectados incorrectamente
  - Mejorar feedback visual durante procesamiento (loading states)
  - Revisar layout y organización de información
  - Simplificar acciones comunes

#### 3. Validación de Salidas (Media Prioridad)
**Motivación:** Verificar que los archivos generados sean correctos.

- [ ] **Verificar formato de archivos generados**
  - Validar estructura de archivos exportados
  - Revisar formato de nombres de archivo
  - Verificar integridad de datos en exports
  - Documentar formato esperado
  - Tests de integridad

- [ ] **Revisar sistema de alias de emisor**
  - Verificar que aliases se muestren correctamente
  - Mejorar detección y deduplicación de nombres de emisores
  - Validar que el sistema de aliases funcione como esperado

---

### Opción A: Completar FASE 1.5 (2-3 horas)

**Tareas concretas:**

1. **Auto-completar desde Excel** (1h)
   - Modificar `processInvoice()` para auto-completar cuando hay match único
   - Retornar `source: 'MATCHED_FROM_EXCEL'` en el resultado
   - UI debe mostrar que datos vinieron del Excel

2. **Selección de candidatos** (1h)
   - Si hay 2-5 candidatos, mostrar lista en UI
   - Usuario clickea el correcto
   - Llamar endpoint `/api/expected-invoices/[id]/match`

3. **Testing con datos reales** (30min)
   - Probar con Excel AFIP real
   - Verificar parsing de columnas
   - Ajustar mapeo si es necesario

### Opción B: Visualización de Detecciones (2-3 horas)

**El usuario pidió:** "marcame dónde del archivo es que detectaste"

**Tareas:**

1. Modificar PDF extractor para capturar coordenadas (x, y, width, height)
2. Agregar campo `detection_zones` (JSON) en `file_extraction_results`
3. Renderizar rectángulos semitransparentes sobre el PDF preview
4. Color verde (alta confianza), amarillo (baja), rojo (no detectado)

### Opción C: Templates y Aprendizaje (FASE 2)

**Depende de:** FASE 1.5 completa (matches exitosos generan templates)

**Tareas:**

1. Tabla `extraction_templates` con zonas de extracción
2. Al confirmar match, ofrecer "¿Crear template para este CUIT?"
3. Próximas facturas del mismo CUIT usan el template

---

## 📁 Archivos Clave para Retomar

### Backend

```
server/
├── database/
│   ├── schema.ts                          # Tablas: expected_invoices, import_batches
│   └── repositories/
│       ├── expected-invoice.ts            # ★ Repository de facturas esperadas
│       └── pending-file.ts                # Repository de archivos pendientes
├── services/
│   ├── excel-import.service.ts            # ★ Parser de Excel AFIP
│   └── invoice-processing.service.ts      # ★ Lógica de matching
└── extractors/
    └── pdf-extractor.ts                   # Extracción de texto de PDFs
```

### Frontend

```
client/src/routes/
├── +page.svelte                           # ★ UI principal (tabs, tabla comparativa)
└── api/
    ├── expected-invoices/
    │   ├── import/+server.ts              # POST: Importar Excel
    │   ├── +server.ts                     # GET: Listar facturas esperadas
    │   ├── [id]/match/+server.ts          # POST: Confirmar match
    │   └── template/+server.ts            # GET: Descargar template
    └── pending-files/
        └── [id]/matches/+server.ts        # GET: Matches de un archivo
```

---

## 🔧 Comandos Útiles

```bash
# Desarrollo
npm run dev                    # Servidor en http://localhost:5173

# Base de datos
npm run db:migrate             # Aplicar migraciones
npm run db:studio              # GUI para ver datos
npm run db:reset               # ⚠️ Borra y recrea BD

# Type check
npm run check                  # Verificar tipos TypeScript

# Git
git status                     # Ver cambios
git log --oneline -10          # Últimos commits
```

---

## 🐛 Issues Conocidos

1. **Confianza OCR**: El cálculo de confianza puede dar valores bajos porque considera 5 campos requeridos
2. **Excel AFIP**: El parser espera columnas específicas; puede necesitar ajuste para formatos reales
3. **Sin tests para matching**: No hay tests automatizados para la lógica de matching

---

## 📋 Decisiones de Diseño

### ¿Por qué Excel AFIP como fuente de verdad?

- AFIP provee datos estructurados y validados
- PDFs escaneados pueden ser borrosos/ilegibles
- Sistema detecta mínimo (CUIT) y completa desde Excel
- Reduce trabajo manual de transcripción

### Estrategia de Matching

1. **Match exacto**: CUIT + Tipo + PuntoVenta + Número
2. **Match por proximidad**: CUIT + Fecha ±7 días + Total ±10%
3. **Sin match**: Procesamiento normal con OCR

### Flujo de Usuario Ideal

```
1. Importar Excel AFIP (150 facturas esperadas)
2. Subir PDFs escaneados
3. Sistema matchea automáticamente:
   - Match único → Auto-completa
   - Múltiples candidatos → Usuario elige
   - Sin match → OCR normal
4. Usuario confirma visualmente
5. Factura creada con datos del Excel
```

---

## 📝 Sesiones Anteriores

### 2025-11-27: Mejoras de Detección y Herramientas de Desarrollo
- Mejorado sistema de detección de tipo de factura con códigos AFIP
- Agregado patrón específico para "A\nCódigo: 01" (letra separada del código)
- Agregados logs de debug para troubleshooting de detección
- Agregado script `npm run format` para formateo automático con Prettier
- Prettier instalado en client workspace
- Actualización del ROADMAP con prioridades 2025-11-27

### 2025-11-22: UI Review + TypeScript Fixes
- Rediseño de sección "Revisar" con tabla comparativa
- Eliminado overlay que tapaba el PDF
- Corregidos errores de TypeScript y {@const} placement
- Implementado matching parcial con Excel AFIP

### 2025-11-21: FASE 1 + Bugfixes
- Sistema de toast notifications (svelte-sonner)
- Tab "Archivos Pendientes" restaurado
- Favicon personalizado
- Documentación UI/UX Guidelines

### 2025-11-19: Monorepo + FASE 1
- Refactor a estructura client/server
- Tabla pending_files implementada (posteriormente reemplazada en v0.4)
- UI de 3 tabs funcionando

### 2026-01-16: Release v0.5.0 - Unified File Management
- **Release v0.5.0** con todo el trabajo del Issue #40
- Consolidación de documentación: eliminados archivos obsoletos, reorganizado docs/
- CHANGELOG actualizado con entradas completas para v0.3.0, v0.4.0, v0.5.0
- Tag y GitHub Release con Docker image multi-plataforma

### 2026-01-13: Issue #40 - Simplificación de arquitectura
- Migración de `pending_files` a `files` + `file_extraction_results`
- Eliminación de tabla `pending_files`
- Separación clara de responsabilidades: Archivo ≠ Extracción ≠ Factura
- Actualización de documentación (SPEC, README, ROADMAP)

---

Última actualización: 2026-01-16
