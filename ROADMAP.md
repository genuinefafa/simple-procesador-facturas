# Roadmap - Procesador de Facturas

## Estado Actual (2025-11-22)

### ✅ Sesión 2025-11-22: UI Review Rediseñada + TypeScript Fixes

#### Rediseño completo de la sección "Revisar"
- ✅ **Eliminado overlay "Detección automática"**: El overlay tapaba el PDF, ahora los datos se muestran al lado
- ✅ **Nueva tabla comparativa**: Muestra lado a lado datos Detectados (PDF) vs Excel AFIP
- ✅ **Indicadores visuales de status**:
  - ✓ (verde): Coincide con Excel
  - ⚠ (rojo): Difiere del Excel
  - ❌ (amarillo): No detectado en PDF
  - ⚪ (gris): Sin datos de Excel para comparar
- ✅ **Tooltips informativos**: Muestran las diferencias específicas al hover
- ✅ **Leyenda de estados**: Ayuda visual para interpretar iconos

#### Unificación de tabs
- ✅ **"Archivos Pendientes" unificado con "Revisar"**: Reducido de 4 a 3 tabs
- ✅ **Filtros añadidos**: "Solo para revisar" vs "Todos los archivos"
- ✅ **Título de página agregado**: `<title>Procesador de Facturas</title>`

#### Bugfixes críticos
- ✅ **Error {@const} placement**: Movido como hijo directo del {#each} (Svelte 5)
- ✅ **Import error resuelto**: `@server/utils/validation.js` → `@server/validators/cuit.js`
- ✅ **Alias @server en TypeScript**: Configurado en svelte.config.js
- ✅ **Tipos corregidos**: personType null→undefined, InvoiceType casts
- ✅ **findExactMatch/findCandidates**: Arregladas firmas de funciones
- ✅ **fullInvoiceNumber**: Removido de create() (se calcula internamente)
- ✅ **OCR Confidence fix**: Ahora considera 5 campos requeridos (era 4)

#### Mejoras de código
- ✅ **Warnings de a11y resueltos**: Dropzone convertido de div a button
- ✅ **CSS no usado eliminado**: .form-field, .data-item .label/.value
- ✅ **svelte-check pasa sin errores ni warnings**

---

## Estado Actual (2025-11-21)

### ✅ Sesión 2025-11-21: Continuación FASE 1 + Bugfixes + UX Improvements

#### Merge de main y restauración de funcionalidades
- ✅ **Merge conflictivo de main resuelto**: Combinado lo mejor de ambas ramas
- ✅ **Sistema de toast mejorado**: Migrado de implementación custom a svelte-sonner (más robusto)
- ✅ **Tab "Archivos Pendientes" restaurado**: Funcionalidad que se perdió en merge recuperada
  - Estadísticas completas (total, pending, reviewing, processed, failed)
  - Selección múltiple con checkboxes
  - Procesamiento en lote
  - Vista de TODOS los archivos (no solo pending/failed)
- ✅ **4 tabs funcionales**: Upload → Archivos Pendientes → Revisar → Facturas

#### Bugfixes importantes
- ✅ **Migración duplicada eliminada**: `0001_lame_doctor_doom.sql` removida (obsoleta)
- ✅ **Warning Chrome DevTools silenciado**: Creado `.well-known/appspecific/com.chrome.devtools.json`
- ✅ **Error "Cannot read properties of undefined"**: Endpoint retorna `stats` con campo `total`
- ✅ **Checkbox superpuesto**: Ajustado padding en `.pending-file-card`
- ✅ **Manejo defensivo**: Optional chaining y valores por defecto en frontend

#### Mejoras de UX
- ✅ **Favicon personalizado**: Diseño custom (factura + checkmark verde)
- ✅ **Meta tags actualizados**: Idioma español + descripción del proyecto
- ✅ **Documentación UI/UX**: Prohibición absoluta de alert() documentada

#### Documentación y lineamientos
- ✅ **docs/UI_UX_GUIDELINES.md**: Creado con reglas estrictas anti-alert()
- ✅ **Commits semánticos**: Todos los commits con prefijos (feat, fix, docs, design)
- ✅ **Build exitoso**: Proyecto compila sin errores

---

## Estado Actual (2025-11-19)

### ✅ Completado Recientemente

#### Refactor a Monorepo SvelteKit (Sesión anterior)
- ✅ Eliminado CLI, migrado a app web única
- ✅ Estructura reorganizada: `web/` → `client/`, `src/` → `server/`
- ✅ Instalado Drizzle ORM + better-sqlite3
- ✅ REST API completa (upload, process, export, annotations)
- ✅ Vulnerabilidades resueltas, GitHub Actions funcionando
- ✅ Scripts de package.json simplificados (21 → 13)

#### Bugfixes de Hoy (2025-11-19 - Sesión Temprana)
- ✅ **Canvas Fix**: Reemplazado `tick()` por `$effect()` en herramienta de anotación
- ✅ **Property Names**: Corregido mismatch entre service/repository al crear emisor
- ✅ **Logging**: Agregado logging exhaustivo a upload, process y service
- ✅ **Valores Extraídos**: UI de anotación muestra qué se reconoció en cada campo

#### ✅ FASE 1 COMPLETADA - Sistema de Archivos Pendientes (2025-11-19)
- ✅ **Tabla pending_files**: Migración y schema de Drizzle creados
- ✅ **PendingFileRepository**: CRUD completo con métodos de gestión
- ✅ **Endpoints API**:
  - GET /api/pending-files (con filtros por status)
  - GET /api/pending-files/[id]
  - PATCH /api/pending-files/[id]
  - DELETE /api/pending-files/[id]
  - POST /api/pending-files/[id]/finalize
  - GET /api/pending-files/[id]/file (servir archivo para preview)
- ✅ **Upload modificado**: Crea registros en pending_files automáticamente
- ✅ **Process modificado**: Guarda datos extraídos aunque fallen validaciones
  - Siempre retorna extractedData incluso con confianza baja
  - Logging mejorado con "❌ NO DETECTADO" para campos vacíos
- ✅ **UI COMPLETAMENTE REDISEÑADA**: Nuevo flujo de 3 pestañas:
  - 📤 **Subir**: Drag & drop con lista de archivos seleccionados
  - ✏️ **Revisar**: (NUEVO) Vista principal con:
    - Layout de dos columnas: PDF preview + formulario edición
    - Overlay flotante mostrando datos detectados sobre el PDF
    - Edición inline con todos los campos
    - Auto-navegación a esta pestaña después de upload
    - Contador de archivos pendientes en tab
  - 📋 **Facturas**: Listado de facturas finales procesadas
- ✅ **Sistema de Notificaciones Moderno**:
  - Eliminados TODOS los alert() del sistema
  - Implementado svelte-sonner con toasts ricos
  - Toasts diferenciados: success, error, warning, info, loading
  - Duración y mensajes específicos por tipo de operación
- ✅ **Manejo de Errores Mejorado**:
  - Logging detallado en todos los endpoints de archivos
  - Mensajes de error con nombre de archivo y razón específica
  - Cliente hace fetch para obtener detalles cuando falla preview
  - Logs del servidor con prefijo [FILE-SERVER] y emojis

**Resultado**:
- ✅ Archivos nunca se pierden, siempre van a pending_files
- ✅ Usuario puede ver y editar datos extraídos parcialmente
- ✅ Preview del PDF mientras edita para leer manualmente
- ✅ Overlay muestra qué datos se detectaron
- ✅ UX moderna sin popups molestos
- ✅ Errores claros y accionables

### 🔴 Problema Principal Identificado (RESUELTO ✅)

**El flujo actual es demasiado rígido:**
- Si falla cualquier validación (CUIT inválido, falta fecha, etc.), el archivo no se guarda
- El usuario sube el archivo pero desaparece de la UI si no se procesa completamente
- No hay forma de ver archivos "pendientes" que requieren corrección manual
- El renombrado depende del contenido, pero si no se reconoce no se puede guardar

---

## 🎯 Roadmap por Fases

### ✅ FASE 1: Workflow Redesign - Sistema de Archivos Pendientes (COMPLETADA)
**Objetivo**: Permitir que archivos se guarden aunque la extracción falle

Ver sección "Estado Actual" arriba para detalles de implementación.

---

## 🎯 Próximos Pasos (Priorizados)

### 🔴 PRIORIDAD 1: Visualización de Detecciones (2-3 horas)
**Objetivo**: Mostrar rectángulos indicando DE DÓNDE se leyó cada dato

**Motivación del usuario**:
> "Una vez que indico los valores 'correctos' de la factura, no se muestra en ningún lado que se detectaron en la imagen (no me queda claro qué aprendimos)"

**Implementación**:
1. **Backend**: Modificar `InvoiceProcessingService` para retornar coordenadas
   - pdf-parse ya tiene posiciones de texto
   - Guardar coordenadas (x, y, width, height) de cada campo detectado
   - Retornar como parte de extractedData

2. **Tabla pending_files**: Agregar campo `detection_zones` (JSON)
   ```typescript
   {
     cuit: { x: 100, y: 200, width: 150, height: 20, page: 1 },
     fecha: { x: 100, y: 230, width: 100, height: 18, page: 1 },
     total: { x: 400, y: 500, width: 80, height: 20, page: 1 }
   }
   ```

3. **Frontend - Tab "Revisar"**:
   - Renderizar PDF en canvas
   - Dibujar rectángulos semitransparentes sobre campos detectados
   - Color verde: detectado con alta confianza
   - Color amarillo: detectado con baja confianza
   - Color rojo: no detectado (usuario editó manualmente)
   - Tooltip mostrando valor + confianza al hover

4. **Beneficios**:
   - Usuario ve EXACTAMENTE qué leyó el sistema
   - Feedback visual para mejorar templates
   - Preparación para FASE 2 (aprendizaje de zonas)

---

### 🔴 PRIORIDAD 2: Import de Excel/CSV AFIP (4-6 horas)
**Objetivo**: Permitir upload de Excel AFIP como "fuente de verdad"

**Workflow ideal del usuario**:
1. Entrar a la app
2. **Subir Excel AFIP** (o CSV)
3. Subir PDFs (pueden ser más o menos que el Excel)
4. Sistema matchea automáticamente Excel ↔ PDFs
5. Revisar detecciones con rectángulos visuales

**Implementación MVP (CSV primero)**:

1. **Tabla `expected_invoices`**:
   ```sql
   CREATE TABLE expected_invoices (
     id INTEGER PRIMARY KEY,
     batch_id INTEGER REFERENCES import_batches(id),
     emisor_cuit TEXT NOT NULL,
     fecha_emision TEXT NOT NULL,
     tipo_comprobante TEXT NOT NULL,
     punto_venta INTEGER NOT NULL,
     numero_comprobante INTEGER NOT NULL,
     total REAL NOT NULL,
     -- Metadata
     matched_pending_file_id INTEGER REFERENCES pending_files(id),
     match_confidence REAL,
     match_status TEXT DEFAULT 'unmatched', -- unmatched, matched, confirmed, rejected
     created_at TEXT DEFAULT CURRENT_TIMESTAMP
   );
   ```

2. **Tabla `import_batches`**:
   ```sql
   CREATE TABLE import_batches (
     id INTEGER PRIMARY KEY,
     filename TEXT NOT NULL,
     total_records INTEGER,
     matched_count INTEGER DEFAULT 0,
     imported_at TEXT DEFAULT CURRENT_TIMESTAMP
   );
   ```

3. **Service: `ExcelImportService`** (o `CSVImportService`):
   - Parser CSV con mapeo de columnas flexible
   - Usuario mapea columnas → campos (primera vez)
   - Validación de datos AFIP
   - Inserción en `expected_invoices`

4. **Service: `MatchingService`**:
   - Función: `findBestMatch(pendingFile, expectedInvoices[])`
   - Estrategia de matching progresiva:
     a. Match exacto: CUIT + Tipo + PuntoVenta + Número
     b. Match por CUIT + Total ± 5%
     c. Match por CUIT + Fecha ± 7 días + Total similar
   - Retorna score de confianza (0-100)

5. **Endpoint: POST /api/excel/import**:
   - Upload de archivo CSV/Excel
   - Parseo e inserción en expected_invoices
   - Auto-matching con pending_files existentes
   - Retorna: { batch_id, total, matched, unmatched }

6. **Endpoint: POST /api/matching/suggest**:
   - Input: { pendingFileId }
   - Output: [ { expectedInvoice, confidence, matchReason } ]
   - Top 3 candidatos ordenados por confianza

7. **UI - Nueva tab "Importar Excel"**:
   - Dropzone para CSV/Excel
   - Mapeo de columnas (primera vez)
   - Vista de resultados: matched vs unmatched
   - Botón: "Aplicar matches sugeridos"

8. **UI - Modificar tab "Revisar"**:
   - Si hay match sugerido, mostrar:
     ```
     ✨ Datos del Excel AFIP (confianza: 95%)
     CUIT: 30-12345678-9
     Fecha: 2024-01-15
     Total: $12,500.00

     [Usar estos datos] [Ignorar sugerencia]
     ```

**Ventajas de CSV primero**:
- ✅ Más simple de parsear (sin dependencias de librerías Excel)
- ✅ Usuario puede exportar Excel → CSV fácilmente
- ✅ Formato más predecible
- ✅ Implementación más rápida (2-3 horas vs 4-6)

**Próximo paso (Excel nativo)**:
- Usar librería `xlsx` o `exceljs`
- Auto-detectar hojas y headers
- Mismo workflow pero con .xlsx

---

### FASE 1.5: Sistema de Matching con Excel AFIP 🔥 (NUEVA - ALTA PRIORIDAD)
**Objetivo**: Matching inteligente entre PDFs escaneados y datos estructurados de AFIP

**Prioridad**: 🔴 CRÍTICA (resuelve el 80% del trabajo manual)

#### Concepto

En Argentina, AFIP provee un Excel/CSV con **todas las facturas de compra recibidas** (registradas electrónicamente por los emisores). El usuario tiene:
1. **Excel AFIP**: Datos estructurados y validados (fuente de verdad)
2. **PDFs escaneados**: Mismas facturas pero en formato físico/digital

**Problema actual**: Sistema intenta extraer TODO del PDF (borroso, mal escaneado)

**Solución propuesta**:
1. Detectar mínimo del PDF (ej: solo CUIT)
2. Buscar en Excel AFIP facturas candidatas
3. Auto-completar desde Excel (fuente confiable)
4. Usuario valida match visual

#### Ventajas

✅ **Validación cruzada**: PDF vs Excel AFIP (detecta discrepancias)
✅ **Auto-completado inteligente**: PDF borroso pero CUIT legible → completa todo desde Excel
✅ **Matching ambiguo manejable**: Múltiples candidatos → usuario elige visualmente
✅ **Aprendizaje automático**: Match exitoso → genera template para ese CUIT
✅ **Menos errores**: Excel AFIP es dato oficial, no OCR
✅ **Workflow más rápido**: Usuario valida en vez de transcribir

#### Flujo propuesto

```
1. Usuario importa Excel AFIP → 150 facturas esperadas en BD

2. Usuario sube PDFs escaneados

3. Sistema procesa cada PDF:
   a. Extrae lo que pueda (mínimo CUIT, ideal fecha/total)
   b. Busca candidatos en expected_invoices

   Si match único (1 candidato):
     → Auto-completa TODOS los campos desde Excel
     → Confidence: 95% (MATCHED_FROM_EXCEL)
     → Usuario solo confirma visualmente

   Si múltiples candidatos (2-5):
     → Muestra lista para elegir
     → Preview lado a lado: PDF vs datos Excel
     → Usuario clickea el correcto

   Si sin match (0 candidatos):
     → Procesamiento normal (OCR/extracción)
     → Puede ser factura no electrónica

4. Match confirmado:
   → Crea factura con datos del Excel
   → Marca expected_invoice como "matched"
   → Opcionalmente: genera template para ese CUIT
```

#### 1.5.1. Tabla `expected_invoices`

```sql
CREATE TABLE expected_invoices (
  id INTEGER PRIMARY KEY,
  import_batch_id INTEGER,  -- agrupa por importación

  -- Datos desde Excel AFIP (columnas típicas)
  cuit TEXT NOT NULL,
  emitter_name TEXT,
  issue_date TEXT NOT NULL,       -- Fecha de emisión
  invoice_type TEXT NOT NULL,      -- A, B, C, E, M
  point_of_sale INTEGER NOT NULL,  -- Punto de venta
  invoice_number INTEGER NOT NULL, -- Número
  total REAL,                      -- Importe total

  -- Datos adicionales opcionales
  cae TEXT,                        -- Código Autorización Electrónica
  cae_expiration TEXT,             -- Vencimiento CAE
  currency TEXT DEFAULT 'ARS',

  -- Estado del matching
  status TEXT DEFAULT 'pending',   -- pending, matched, discrepancy, manual, ignored
  matched_pending_file_id INTEGER REFERENCES pending_files(id),
  matched_invoice_id INTEGER REFERENCES facturas(id),

  -- Metadata
  import_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  import_filename TEXT,            -- Nombre del Excel importado
  notes TEXT,

  UNIQUE(cuit, invoice_type, point_of_sale, invoice_number)
);

CREATE INDEX idx_expected_invoices_cuit ON expected_invoices(cuit);
CREATE INDEX idx_expected_invoices_status ON expected_invoices(status);
CREATE INDEX idx_expected_invoices_batch ON expected_invoices(import_batch_id);
```

#### 1.5.2. Tabla `import_batches`

```sql
CREATE TABLE import_batches (
  id INTEGER PRIMARY KEY,
  filename TEXT NOT NULL,
  total_rows INTEGER NOT NULL,
  imported_rows INTEGER NOT NULL,
  skipped_rows INTEGER DEFAULT 0,
  error_rows INTEGER DEFAULT 0,
  import_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);
```

#### 1.5.3. Repository `ExpectedInvoiceRepository`

**Archivo**: `server/database/repositories/expected-invoice.ts`

Métodos clave:
```typescript
class ExpectedInvoiceRepository {
  // Crear desde importación
  createBatch(invoices: ExpectedInvoiceData[], batchId: number): ExpectedInvoice[]

  // Búsqueda para matching
  findCandidates(criteria: {
    cuit: string,
    dateRange?: [Date, Date],    // ±7 días
    totalRange?: [number, number] // ±10%
  }): ExpectedInvoice[]

  findExactMatch(cuit: string, type: string, pos: number, num: number): ExpectedInvoice | null

  // Gestión de estado
  markAsMatched(id: number, pendingFileId: number, invoiceId: number): void
  markAsManual(id: number): void
  markAsIgnored(id: number): void

  // Stats
  countByStatus(batchId?: number): Record<Status, number>
  listPending(limit?: number): ExpectedInvoice[]
  listMatched(batchId?: number): ExpectedInvoice[]
  listUnmatched(batchId?: number): ExpectedInvoice[]
}
```

#### 1.5.4. Service `ExcelImportService`

**Archivo**: `server/services/excel-import.service.ts`

```typescript
import XLSX from 'xlsx';

class ExcelImportService {
  async importFromExcel(filePath: string): Promise<ImportResult> {
    // 1. Leer Excel/CSV
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    // 2. Validar columnas requeridas
    const requiredColumns = ['CUIT', 'Fecha', 'Tipo', 'PuntoVenta', 'Numero', 'Total'];
    // Validar...

    // 3. Crear batch
    const batch = importBatchRepo.create({
      filename: path.basename(filePath),
      total_rows: rows.length
    });

    // 4. Parsear y validar cada fila
    const validInvoices = [];
    const errors = [];

    for (const [index, row] of rows.entries()) {
      try {
        const invoice = this.parseRow(row);
        validInvoices.push(invoice);
      } catch (err) {
        errors.push({ row: index + 1, error: err.message });
      }
    }

    // 5. Insertar en BD
    const imported = expectedInvoiceRepo.createBatch(validInvoices, batch.id);

    // 6. Actualizar batch stats
    importBatchRepo.update(batch.id, {
      imported_rows: imported.length,
      error_rows: errors.length
    });

    return {
      success: true,
      batchId: batch.id,
      imported: imported.length,
      errors
    };
  }

  private parseRow(row: any): ExpectedInvoiceData {
    // Mapeo de columnas Excel → campos BD
    // Normalización de CUIT
    // Parsing de fechas
    // Validación de tipos
  }
}
```

#### 1.5.5. Modificar `InvoiceProcessingService`

**Integrar matching automático**:

```typescript
async processInvoice(filePath: string, fileName: string): Promise<ProcessingResult> {
  // 1. Extraer lo que se pueda del PDF
  const extraction = await this.pdfExtractor.extract(filePath);
  const data = extraction.data;

  // 2. Si detectamos CUIT, intentar matching con expected_invoices
  if (data.cuit && validateCUIT(data.cuit)) {
    console.info(`   🔍 Buscando matches en Excel AFIP para CUIT: ${data.cuit}`);

    const candidates = this.expectedInvoiceRepo.findCandidates({
      cuit: normalizeCUIT(data.cuit),
      dateRange: data.date ? calculateDateRange(data.date, 7) : undefined,
      totalRange: data.total ? calculateTotalRange(data.total, 0.1) : undefined
    });

    if (candidates.length === 1) {
      // ✅ MATCH ÚNICO - Auto-completar desde Excel
      console.info(`   ✅ Match único encontrado: ${candidates[0].invoice_type}-${candidates[0].point_of_sale}-${candidates[0].invoice_number}`);
      const expected = candidates[0];

      return {
        success: true,
        confidence: 95,
        source: 'MATCHED_FROM_EXCEL',
        requiresReview: false,
        extractedData: {
          cuit: expected.cuit,
          date: expected.issue_date,
          invoiceType: expected.invoice_type,
          pointOfSale: expected.point_of_sale,
          invoiceNumber: expected.invoice_number,
          total: expected.total
        },
        matchedExpectedInvoiceId: expected.id
      };
    }
    else if (candidates.length > 1 && candidates.length <= 5) {
      // ⚠️ MÚLTIPLES MATCHES - Pedir confirmación al usuario
      console.info(`   ⚠️  ${candidates.length} posibles matches encontrados`);
      return {
        success: false,
        confidence: 60,
        source: 'AMBIGUOUS_MATCH',
        requiresReview: true,
        extractedData: data,
        matchCandidates: candidates,  // Mostrar al usuario para elegir
        matchedExpectedInvoiceId: null
      };
    }
    else if (candidates.length > 5) {
      // ⚠️ DEMASIADOS MATCHES - Criterios muy amplios
      console.info(`   ⚠️  Demasiados matches (${candidates.length}), refinando búsqueda...`);
      // Buscar match exacto si tenemos más datos
      if (data.invoiceType && data.pointOfSale && data.invoiceNumber) {
        const exactMatch = this.expectedInvoiceRepo.findExactMatch(
          normalizeCUIT(data.cuit),
          data.invoiceType,
          data.pointOfSale,
          data.invoiceNumber
        );

        if (exactMatch) {
          console.info(`   ✅ Match exacto encontrado con todos los campos`);
          return { /* similar a match único */ };
        }
      }
    }

    console.info(`   ℹ️  Sin match en Excel AFIP, procesamiento normal`);
  }

  // 3. No hay match o no hay CUIT → procesamiento normal con OCR
  return this.normalProcessing(extraction);
}
```

#### 1.5.6. Endpoint `/api/expected-invoices/import`

```typescript
POST /api/expected-invoices/import
Content-Type: multipart/form-data
Body: { file: Excel/CSV }

Response:
{
  success: true,
  batchId: 42,
  imported: 150,
  skipped: 3,
  errors: [
    { row: 45, error: "CUIT inválido" },
    { row: 78, error: "Fecha mal formateada" }
  ]
}
```

#### 1.5.7. Endpoint `/api/expected-invoices`

```typescript
GET /api/expected-invoices
Query params:
  - status: pending | matched | manual | ignored
  - batchId: number
  - cuit: string
  - limit: number
  - offset: number

Response:
{
  success: true,
  invoices: [
    {
      id: 1,
      cuit: "20-12345678-9",
      emitterName: "Proveedor SA",
      issueDate: "2025-11-15",
      invoiceType: "B",
      pointOfSale: 1,
      invoiceNumber: 12345,
      total: 15234.50,
      status: "pending"
    }
  ],
  total: 150,
  stats: {
    pending: 30,
    matched: 120,
    manual: 0,
    ignored: 0
  }
}
```

#### 1.5.8. Endpoint `/api/expected-invoices/:id/match`

```typescript
POST /api/expected-invoices/:id/match
Body: {
  pendingFileId: number,  // El PDF que matchea con esta factura esperada
  confirmed: boolean       // Usuario confirmó el match visualmente
}

Lógica:
1. Obtener expected_invoice
2. Crear factura con datos del Excel
3. Marcar expected_invoice como "matched"
4. Actualizar pending_file con invoice_id
5. (Opcional) Generar template para este CUIT

Response:
{
  success: true,
  invoice: { ... },
  message: "Factura creada exitosamente desde Excel AFIP"
}
```

#### 1.5.9. UI: Nueva pestaña "📥 Importar Excel"

**Ubicación**: 4ta tab en `client/src/routes/+page.svelte`

**Layout**:
```
┌─────────────────────────────────────────────────────┐
│ 📥 Importar Excel AFIP                              │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [Drag & drop o click para seleccionar archivo]    │
│  Formatos: .xlsx, .csv, .txt                       │
│                                                     │
│  📄 Últimas importaciones:                          │
│  ┌─────────────────────────────────────────────┐   │
│  │ facturas-nov-2025.xlsx                      │   │
│  │ 150 facturas | 120 matched | 30 pending    │   │
│  │ Importado: 2025-11-19 14:30               │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Mapeo de columnas (si no son estándar):          │
│  CUIT → [Columna del Excel ▼]                     │
│  Fecha → [Columna del Excel ▼]                    │
│  Tipo → [Columna del Excel ▼]                     │
│  ...                                               │
│                                                     │
│  [Importar]                                        │
└─────────────────────────────────────────────────────┘
```

#### 1.5.10. UI: Modificar pestaña "Revisar"

**Cuando hay múltiples candidatos**:

```
┌─────────────────────────────────────────────────────┐
│ PDF: factura-proveedor.pdf                         │
│ Detectado: CUIT 20-12345678-9, Fecha: ?, Total: ? │
├─────────────────────────────────────────────────────┤
│ [PDF Preview]          │  🔍 Posibles matches:     │
│                        │                            │
│                        │  ○ B-0001-00012345        │
│                        │    15/11/2025             │
│                        │    $15,234.50             │
│                        │    Proveedor SA           │
│                        │                            │
│                        │  ○ B-0001-00012399        │
│                        │    18/11/2025             │
│                        │    $16,100.00             │
│                        │    Proveedor SA           │
│                        │                            │
│                        │  ○ B-0002-00000123        │
│                        │    20/11/2025             │
│                        │    $15,000.00             │
│                        │    Proveedor SA           │
│                        │                            │
│                        │  [Seleccionar]            │
│                        │  [No está en la lista]    │
└─────────────────────────────────────────────────────┘
```

#### 1.5.11. Dashboard de Expected Invoices

**Nueva página**: `/expected-invoices`

```
📊 Estado de Facturas Esperadas

┌─────────────┬─────────────┬─────────────┬─────────────┐
│ Esperadas   │ Matcheadas  │ Pendientes  │ Ignoradas   │
│    150      │     120     │     30      │      0      │
└─────────────┴─────────────┴─────────────┴─────────────┘

Lote actual: facturas-nov-2025.xlsx
Importado: 2025-11-19 14:30

[Ver facturas pendientes] [Ver matcheadas] [Importar nuevo lote]

Filtros:
  CUIT: [_________]
  Estado: [Todos ▼]
  Fecha desde: [__/__/____] hasta: [__/__/____]
  [Buscar]

Lista de facturas esperadas...
```

#### Preguntas para el usuario (DOCUMENTADAS)

1. **¿Qué columnas tiene exactamente el Excel de AFIP?**
   - ¿Nombres exactos de columnas?
   - ¿Formato del archivo: .xlsx, .csv, .txt?
   - ¿Viene con headers o sin headers?
   - ¿Encoding: UTF-8, Latin1?

2. **¿Cuándo implementar esto?**
   - Opción A: AHORA (antes de cualquier otra fase)
   - Opción B: Después de FASE 2 (templates)
   - Opción C: Otro momento

3. **¿El Excel es de compras o ventas?**
   - Compras: Facturas recibidas (sos el cliente)
   - Ventas: Facturas emitidas (sos el emisor)

4. **¿Hay campos clave adicionales para matching?**
   - CAE (Código Autorización Electrónica)?
   - Razón social del emisor?
   - Moneda?
   - Otros campos AFIP-específicos?

5. **¿Con qué frecuencia se importa el Excel?**
   - Diario, semanal, mensual?
   - ¿Necesitás importaciones incrementales o siempre archivo completo?

6. **¿Qué hacer con facturas del Excel sin PDF?**
   - ¿Crear factura solo con datos del Excel?
   - ¿Marcar como "pendiente de PDF"?
   - ¿Ignorar hasta que llegue el PDF?

---

### FASE 2: Templates y Aprendizaje
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

#### ✅ 3.1. Reemplazar `alert()` con UI moderna (COMPLETADO)
- ✅ Toast notifications con svelte-sonner
- ✅ Todos los alert() eliminados
- ⏳ Confirmaciones con modal (pending - actualmente usa toast.warning)

#### ✅ 3.2. Drag & Drop mejorado (PARCIALMENTE COMPLETADO)
- ✅ Preview de archivos antes de subir (lista con nombre, tamaño, tipo)
- ⏳ Progress bar durante upload
- ✅ Soporte para múltiples archivos simultáneos

#### ✅ 3.3. Vista de Factura Mejorada (COMPLETADO)
- ✅ Preview del PDF/imagen embebido (iframe para PDF, img para imágenes)
- ✅ Overlay con campos extraídos destacados sobre el preview
- ⏳ Zoom y navegación (pendiente)
- ⏳ Highlight de campos extraídos directamente sobre la imagen (requiere FASE 2)

#### 3.4. Dashboard (PENDIENTE)
- ⏳ Estadísticas: facturas procesadas hoy/semana/mes
- ⏳ Emisores más frecuentes
- ⏳ Success rate de extracción
- ⏳ Archivos pendientes de revisión

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

### 🔄 FASE 1.5 - Sistema de Matching con Excel AFIP (EN PROGRESO)
**Estado**: MVP Backend completo, UI de comparación implementada
**Pendiente**: Testing con datos reales, refinamiento de UI

**Ya implementado**:
- ✅ Tablas `expected_invoices` e `import_batches`
- ✅ `ExpectedInvoiceRepository` completo
- ✅ `ExcelImportService` con parsing de columnas estándar
- ✅ Endpoints: import, list, match, template
- ✅ UI: Tab "Importar Excel" con drag & drop
- ✅ UI: Tabla comparativa en "Revisar" (PDF vs Excel)
- ✅ Indicadores visuales de match/mismatch

**Próximos pasos sugeridos**:
1. **Testing con Excel AFIP real** - Verificar que el parsing funcione
2. **Mejorar búsqueda de Total en OCR** - Buscar de abajo hacia arriba, keywords específicos
3. **Refinamiento UX** - Ajustar layout según feedback
4. **Matching automático** - Cuando hay match exacto, auto-completar campos

### Opción B: FASE 2.1-2.3 - Templates Básicos (DESPUÉS DE FASE 1.5)
**Duración estimada**: 2-3 horas
**Objetivo**: Sistema de templates para mejorar reconocimiento automático

**Por qué después de FASE 1.5**:
- Templates se pueden generar automáticamente desde matches exitosos
- Requiere datos limpios que FASE 1.5 provee

### Opción C: FASE 2.4 - Mostrar Zonas de Detección
**Duración estimada**: 1-2 horas
**Objetivo**: Marcar en el PDF DÓNDE se detectó cada campo

**Por qué**: Usuario lo pidió explícitamente ("marcame dónde del archivo es que detectaste")

**Tareas**:
1. Modificar PDFExtractor para capturar posiciones (x, y, width, height)
2. Agregar columna JSON en pending_files para guardar coordenadas
3. Renderizar rectangles/highlights sobre el PDF preview
4. Mostrar tooltips al hover sobre cada zona

### Opción D: FASE 3.4 - Dashboard con Estadísticas
**Duración estimada**: 1 hora
**Objetivo**: Vista de métricas del sistema

**Tareas**:
1. Nueva ruta `/dashboard`
2. Queries agregadas en repositories
3. Componentes de gráficos (Chart.js o similar)
4. Mostrar: success rate, archivos pendientes, emisores frecuentes

**Por qué**: Quick win, agrega valor inmediato para entender el estado del sistema

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

Última actualización: 2025-11-22
