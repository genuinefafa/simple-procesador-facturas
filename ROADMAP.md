# Roadmap - Procesador de Facturas

## Estado Actual (2025-11-19)

### ✅ Completado Recientemente

#### Refactor a Monorepo SvelteKit (Sesión anterior)
- ✅ Eliminado CLI, migrado a app web única
- ✅ Estructura reorganizada: `web/` → `client/`, `src/` → `server/`
- ✅ Instalado Drizzle ORM + better-sqlite3
- ✅ REST API completa (upload, process, export, annotations)
- ✅ Vulnerabilidades resueltas, GitHub Actions funcionando
- ✅ Scripts de package.json simplificados (21 → 13)

#### Bugfixes de Hoy (2025-11-19)
- ✅ **Canvas Fix**: Reemplazado `tick()` por `$effect()` en herramienta de anotación
- ✅ **Property Names**: Corregido mismatch entre service/repository al crear emisor
- ✅ **Logging**: Agregado logging exhaustivo a upload, process y service
- ✅ **Valores Extraídos**: UI de anotación muestra qué se reconoció en cada campo

### 🔴 Problema Principal Identificado

**El flujo actual es demasiado rígido:**
- Si falla cualquier validación (CUIT inválido, falta fecha, etc.), el archivo no se guarda
- El usuario sube el archivo pero desaparece de la UI si no se procesa completamente
- No hay forma de ver archivos "pendientes" que requieren corrección manual
- El renombrado depende del contenido, pero si no se reconoce no se puede guardar

---

## 🎯 Roadmap por Fases

### FASE 1: Workflow Redesign - Sistema de Archivos Pendientes
**Objetivo**: Permitir que archivos se guarden aunque la extracción falle

**Prioridad**: 🔴 CRÍTICA (bloquea workflow normal del usuario)

#### 1.1. Crear Tabla `pending_files`
```sql
CREATE TABLE pending_files (
  id INTEGER PRIMARY KEY,
  original_filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Datos extraídos (pueden estar incompletos/nulos)
  extracted_cuit TEXT,
  extracted_date TEXT,
  extracted_total REAL,
  extracted_type TEXT,
  extracted_point_of_sale INTEGER,
  extracted_invoice_number INTEGER,

  extraction_confidence INTEGER,
  extraction_errors TEXT, -- JSON con array de errores

  -- Estados: pending, reviewing, processed, failed
  status TEXT DEFAULT 'pending',

  -- Referencia a factura final (si se completó)
  invoice_id INTEGER REFERENCES facturas(id),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Migración**: `server/database/migrations/000X_create_pending_files.sql`

#### 1.2. Crear Repository
**Archivo**: `server/database/repositories/pending-file.ts`

Métodos:
- `create(data)` - Crear registro de archivo pendiente
- `findById(id)` - Buscar por ID
- `list(filters)` - Listar con filtros (status, date range)
- `updateExtractedData(id, data)` - Actualizar datos extraídos
- `updateStatus(id, status)` - Cambiar estado
- `linkToInvoice(id, invoiceId)` - Asociar a factura procesada
- `delete(id)` - Eliminar registro

#### 1.3. Modificar Flujo de Upload/Process

**Upload Endpoint** (`/api/invoices/upload`):
```typescript
// ANTES: Solo guarda archivos en filesystem
// DESPUÉS:
1. Guardar archivo en data/input/
2. Crear registro en pending_files con estado 'pending'
3. Retornar { success, pendingFileId, fileName }
```

**Process Endpoint** (`/api/invoices/process`):
```typescript
// ANTES: Intenta procesar y crea factura o falla
// DESPUÉS:
1. Recibir pendingFileId[]
2. Para cada archivo:
   a. Intentar extracción PDF
   b. Guardar TODOS los datos extraídos en pending_files (aunque sean incompletos)
   c. Calcular confidence
   d. Si confidence >= 80% Y todos los campos requeridos:
      - Crear emisor (si no existe)
      - Crear factura
      - Renombrar archivo a data/processed/CUIT/YYYY/Tipo-PV-Num.pdf
      - Actualizar pending_files: status='processed', invoice_id=X
   e. Si no:
      - Actualizar pending_files con datos parciales
      - Guardar errores en extraction_errors (JSON)
      - Mantener status='pending'
3. Retornar estadísticas: processed, pending, failed
```

#### 1.4. Nuevo Endpoint `/api/pending-files`
```typescript
GET  /api/pending-files?status=pending
  → Lista archivos pendientes con datos extraídos

GET  /api/pending-files/:id
  → Detalle de archivo pendiente

PATCH /api/pending-files/:id
  → Actualizar datos extraídos manualmente
  → Cambiar estado

POST /api/pending-files/:id/finalize
  → Intentar procesar nuevamente con datos actualizados
  → Si OK: crear factura, renombrar, marcar como processed

DELETE /api/pending-files/:id
  → Eliminar registro y archivo físico
```

#### 1.5. UI: Pestaña "Archivos Pendientes"

**Ubicación**: Nueva tab en `client/src/routes/+page.svelte`

**Estados visuales**:
- 🟡 **Pendiente**: Archivo subido, extracción incompleta
  - Mostrar campos extraídos (algunos vacíos)
  - Botón "Editar" → abrir formulario de corrección
  - Botón "Anotar" → ir a herramienta de anotación
- 🔵 **Revisión**: Usuario editando/completando datos
  - Formulario con todos los campos
  - Valores extraídos como placeholders
  - Botón "Guardar y Procesar"
- ✅ **Procesado**: Todo OK, factura creada
  - Link a factura final
  - Mostrar archivo renombrado
- ❌ **Error**: Fallo irrecuperable
  - Mostrar errores
  - Botón "Reintentar" o "Eliminar"

**Acciones**:
- Ver todos los archivos (pendientes + procesados + errores)
- Filtrar por estado
- Editar campos manualmente
- Procesar individualmente o en lote
- Eliminar archivos problemáticos

---

### FASE 2: Templates y Aprendizaje
**Objetivo**: Sistema de templates asociados a emisores

**Prioridad**: 🟡 ALTA (mejora reconocimiento)

#### 2.1. Tabla `extraction_templates`
```sql
CREATE TABLE extraction_templates (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  emitter_cuit TEXT,  -- NULL = template genérico

  -- Zonas de extracción (JSON array)
  zones TEXT NOT NULL,

  -- Metadata
  confidence_threshold INTEGER DEFAULT 80,
  created_from_invoice_id INTEGER REFERENCES facturas(id),
  usage_count INTEGER DEFAULT 0,
  success_rate REAL DEFAULT 0,

  active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (emitter_cuit) REFERENCES emisores(cuit)
);
```

#### 2.2. Flujo de Creación de Template
1. Usuario anota factura con canvas (ya implementado)
2. Al guardar anotaciones:
   - Ofrecer "¿Crear template para este emisor?"
   - Si acepta: crear registro en `extraction_templates`
   - Asociar zonas guardadas con template
3. Template queda asociado a `emitter_cuit`

#### 2.3. Aplicar Template en Extracción
**Modificar**: `server/extractors/pdf-extractor.ts`

```typescript
async extract(filePath: string, templateId?: number): Promise<ExtractionResult> {
  // Si hay template:
  //   1. Renderizar PDF a imagen
  //   2. Para cada zona del template:
  //      - Extraer región específica (x, y, width, height)
  //      - OCR solo de esa región
  //      - Asignar a campo correspondiente
  //   3. Confidence basada en zonas encontradas

  // Si NO hay template:
  //   - Usar extracción genérica actual (patrones regex)
}
```

#### 2.4. Auto-detección de Template
```typescript
// En InvoiceProcessingService.processInvoice()
1. Extraer CUIT (método genérico)
2. Si CUIT válido:
   a. Buscar emisor
   b. Verificar si tiene template preferido
   c. Si tiene: usar ese template para extraer resto de campos
3. Si no tiene template o falla:
   - Usar extracción genérica
   - Marcar para revisión manual
```

#### 2.5. UI: Gestión de Templates
**Ubicación**: Nueva página `/templates`

**Funcionalidades**:
- Ver templates por emisor
- Ver success_rate y usage_count
- Editar zonas de template
- Activar/desactivar templates
- Duplicar template para crear variante
- Eliminar template

---

### FASE 3: Mejoras de UI/UX
**Prioridad**: 🟢 MEDIA

#### 3.1. Reemplazar `alert()` con UI moderna
- Usar toast notifications (ej: svelte-sonner)
- Mostrar errores en panel dedicado
- Confirmaciones con modal

#### 3.2. Drag & Drop mejorado
- Preview de archivos antes de subir
- Progress bar durante upload
- Soporte para múltiples archivos simultáneos

#### 3.3. Vista de Factura Mejorada
- Preview del PDF/imagen embebido
- Zoom y navegación
- Highlight de campos extraídos sobre la imagen

#### 3.4. Dashboard
- Estadísticas: facturas procesadas hoy/semana/mes
- Emisores más frecuentes
- Success rate de extracción
- Archivos pendientes de revisión

---

### FASE 4: Exportación Avanzada
**Prioridad**: 🟢 MEDIA

#### 4.1. Formatos Adicionales
- Excel (.xlsx) con múltiples hojas
- PDF consolidado de facturas
- JSON para integraciones

#### 4.2. Exportación Programada
- Configurar exports automáticos (diario, semanal)
- Enviar por email
- Subir a cloud storage

#### 4.3. Filtros y Agrupación
- Exportar por rango de fechas
- Agrupar por emisor
- Incluir/excluir campos específicos

---

### FASE 5: Optimizaciones y Avanzadas
**Prioridad**: 🔵 BAJA

#### 5.1. OCR Mejorado
- Integrar Tesseract.js para PDFs escaneados
- Soporte para imágenes (JPG, PNG)
- Pre-procesamiento de imágenes (deskew, denoise)

#### 5.2. Machine Learning
- Entrenar modelo custom con facturas anotadas
- Clasificación automática de tipo de factura
- Detección de anomalías

#### 5.3. Multi-página
- Procesar PDFs con múltiples páginas
- Detectar si es una factura o varias
- Split automático

#### 5.4. Integraciones
- API REST documentada (Swagger/OpenAPI)
- Webhooks para eventos
- Autenticación (JWT)

---

## 📋 Siguiente Sesión Recomendada

### Opción A: FASE 1 - Workflow Redesign (Recomendado)
**Duración estimada**: 1-2 horas
**Objetivo**: Implementar sistema de archivos pendientes completo

**Tareas**:
1. Crear migración `pending_files`
2. Implementar `PendingFileRepository`
3. Modificar endpoints upload/process
4. Crear endpoint `/api/pending-files`
5. Actualizar UI para mostrar archivos pendientes
6. Testing del flujo completo

**Por qué primero**: Es el problema más crítico que bloquea el uso normal

### Opción B: FASE 2.1-2.3 - Templates Básicos
**Duración estimada**: 1 hora
**Objetivo**: Permitir crear templates desde anotaciones

**Tareas**:
1. Crear tabla `extraction_templates`
2. Modificar endpoint de anotaciones para crear template
3. UI: Checkbox "Crear template para este emisor"
4. Testing de creación de template

**Por qué**: Complementa la herramienta de anotación que ya funciona

### Opción C: FASE 3.1 - Mejorar UI
**Duración estimada**: 30min - 1 hora
**Objetivo**: Eliminar alerts, agregar toasts

**Tareas**:
1. Instalar svelte-sonner o similar
2. Reemplazar todos los `alert()` por toasts
3. Agregar loading states
4. Mejorar feedback visual

**Por qué**: Quick win, mejora UX inmediatamente

---

## 🔧 Deuda Técnica

### Crítica
- [ ] Validación de archivos subidos (tamaño máximo, tipos permitidos)
- [ ] Manejo de errores en extracción PDF (archivos corruptos)
- [ ] Transacciones de BD en operaciones críticas

### Media
- [ ] Tests unitarios para extractors
- [ ] Tests de integración para endpoints
- [ ] Documentación de API (JSDoc completo)

### Baja
- [ ] Migrar de better-sqlite3 a PostgreSQL (si escala)
- [ ] Cache de extractores (Redis)
- [ ] Rate limiting en API

---

## 📝 Notas de Implementación

### Convenciones de Código
- TypeScript estricto
- Svelte 5 runes ($state, $effect)
- Nombres en inglés para código, español para UI
- Commits descriptivos con prefijos (feat, fix, refactor, docs)

### Estructura de Commits
```
feat: agregar sistema de archivos pendientes
fix: corregir extracción de fecha
refactor: simplificar lógica de validación
docs: actualizar README con nuevo flujo
```

### Testing
- Unit tests: `npm test` (en `server/`)
- Type check: `npm run check`
- Lint: `npm run lint`
- Pre-commit hooks validan Svelte syntax

---

## 🎓 Contexto para Nuevas Sesiones

### Arquitectura Actual
- **Monorepo**: npm workspaces con `client/` y `server/`
- **Client**: SvelteKit 2 fullstack (UI + API endpoints en `/api/*`)
- **Server**: Shared libraries (DB, Services, Extractors)
- **Base de datos**: SQLite con Drizzle ORM
- **No hay servidor HTTP separado**: todo corre dentro de SvelteKit

### Archivos Clave
- `client/src/routes/+page.svelte` - UI principal (upload, review, export)
- `client/src/routes/annotate/[id]/+page.svelte` - Herramienta de anotación
- `client/src/routes/api/invoices/` - Endpoints de API
- `server/services/invoice-processing.service.ts` - Lógica de procesamiento
- `server/extractors/pdf-extractor.ts` - Extracción de PDFs
- `server/database/migrations/` - Migraciones de BD

### Variables de Entorno
- `client/.env` - Development (VITE_PORT, VITE_HOST)
- `.env` (root) - Docker (APP_PORT, NODE_ENV)

### Comandos Útiles
```bash
npm run dev           # Dev server
npm run db:migrate    # Ejecutar migraciones
npm run db:studio     # Abrir Drizzle Studio
npm run check         # Type check
git push              # Usa retry con exponential backoff
```

---

## ✅ Checklist para Próxima Sesión

Antes de empezar:
- [ ] Decidir qué fase/tarea implementar
- [ ] Leer sección relevante de este roadmap
- [ ] Verificar que `npm run dev` funciona
- [ ] Verificar estado de BD (`npm run db:studio`)

Durante:
- [ ] Crear branch específico para la tarea
- [ ] Commits pequeños y frecuentes
- [ ] Testing manual a medida que avanzas

Al terminar:
- [ ] Actualizar este roadmap con progreso
- [ ] Crear PR (o merge directo si es feature branch)
- [ ] Documentar cualquier decisión importante

---

Última actualización: 2025-11-19
