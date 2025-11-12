# 🗺️ Roadmap: Procesador Inteligente de Facturas

Plan de desarrollo incremental del proyecto, organizado en fases con objetivos claros y criterios de éxito.

---

## 📍 **FASE 0: Setup del Proyecto**

**Duración estimada**: 1-2 días
**Estado**: 🔵 Pendiente

### Objetivos

- Establecer la estructura base del proyecto
- Configurar TypeScript + Node.js
- Instalar dependencias core
- Configurar herramientas de desarrollo y testing
- Crear schema de base de datos

### Entregables

- [ ] Inicialización de proyecto Node.js
- [ ] `package.json` con todas las dependencias necesarias
- [ ] Configuración TypeScript (`tsconfig.json`)
- [ ] Estructura de directorios (`src/`, `data/`, `exports/`, `tests/`)
- [ ] Scripts NPM: `build`, `dev`, `test`, `lint`
- [ ] `.gitignore` configurado
- [ ] `.eslintrc` y `.prettierrc` para consistencia de código
- [ ] Base de datos SQLite con schema inicial
- [ ] Migrations para versionado de DB
- [ ] README.md con instrucciones de instalación
- [ ] Setup de testing framework (Jest/Vitest)

### Dependencias Principales

```json
{
  "dependencies": {
    "tesseract.js": "^5.0.0",
    "pdf-parse": "^1.1.1",
    "pdf-lib": "^1.17.1",
    "sharp": "^0.33.0",
    "better-sqlite3": "^9.0.0",
    "commander": "^11.0.0",
    "xlsx": "^0.18.5",
    "date-fns": "^2.30.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.0.0",
    "vitest": "^1.0.0",
    "eslint": "^8.0.0",
    "prettier": "^3.0.0",
    "tsx": "^4.0.0"
  }
}
```

### Criterios de Éxito

✅ `npm install` ejecuta sin errores
✅ `npm run build` compila TypeScript correctamente
✅ `npm test` ejecuta suite de tests vacía
✅ Base de datos SQLite se crea con schema correcto
✅ Estructura de carpetas creada y documentada

---

## 📍 **FASE 1: MVP - Procesamiento Básico**

**Duración estimada**: 3-5 días
**Estado**: 🔵 Pendiente
**Depende de**: Fase 0

### Objetivos

- Procesar una factura simple de principio a fin
- Implementar extracción genérica (sin templates aún)
- Validar CUIT con algoritmo módulo 11
- Almacenar datos en base de datos
- CLI básico funcional

### Entregables

#### 1. Módulo de Validación de CUIT

- [ ] Función `validateCUIT(cuit: string): boolean`
- [ ] Función `normalizeCUIT(cuit: string): string` (formato con guiones)
- [ ] Función `extractCUITFromText(text: string): string | null`
- [ ] Tests unitarios completos (casos válidos e inválidos)
- [ ] Documentación del algoritmo módulo 11

#### 2. Scanner de Archivos

- [ ] Clase `FileScanner` para leer directorio `data/input/`
- [ ] Detección de tipo de archivo por extensión: PDF, JPG, PNG, TIF, HEIF
- [ ] Filtrado de archivos ya procesados (por hash o nombre)
- [ ] Queue de procesamiento con prioridades
- [ ] Logging de archivos encontrados

#### 3. Extractores Básicos

- [ ] `PDFTextExtractor`: Extraer texto plano de PDFs digitales
- [ ] `ImageOCRExtractor`: OCR básico con Tesseract.js
- [ ] `GenericFieldExtractor`: Regex genéricos para:
  - CUIT (varios formatos: con/sin guiones, con prefijos)
  - Fecha (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD)
  - Número de factura (A-0001-00000123, A 0001 00000123, etc.)
  - Total/Importe (con/sin $, con comas/puntos)
- [ ] Manejo de errores y fallbacks
- [ ] Tests con facturas de ejemplo

#### 4. Base de Datos

- [ ] Implementación de tablas: `emisores`, `facturas`
- [ ] Clase `Database` con métodos:
  - `insertEmitter(data): void`
  - `insertInvoice(data): void`
  - `findEmitterByCUIT(cuit): Emitter | null`
  - `listInvoices(filters): Invoice[]`
- [ ] Migrations iniciales
- [ ] Seeds de datos de prueba
- [ ] Tests de integración

#### 5. CLI Básico

- [ ] Comando `process --file <path>`: Procesa un archivo
- [ ] Comando `list`: Lista facturas procesadas
- [ ] Comando `stats`: Estadísticas básicas
- [ ] Output con colores y formato amigable
- [ ] Manejo de errores con mensajes claros

### Flujo de Trabajo MVP

```
Usuario: procesador process --file factura.pdf

1. FileScanner valida que el archivo existe
2. PDFTextExtractor extrae texto del PDF
3. GenericFieldExtractor busca patrones:
   - CUIT encontrado: 30-71057829-6 ✓
   - Fecha encontrada: 12/11/2025 ✓
   - Factura: A-0001-00000123 ✓
   - Total: $15,450.00 ✓
4. validateCUIT valida el CUIT
5. Database busca o crea el emisor
6. Database inserta la factura
7. Output: "✅ Factura procesada exitosamente (ID: 1)"
```

### Criterios de Éxito

✅ Procesar 1 factura PDF digital simple de punta a punta
✅ Extraer y validar CUIT correctamente
✅ Guardar emisor y factura en base de datos
✅ CLI responde con información clara
✅ Tests unitarios pasan al 100%

---

## 📍 **FASE 2: Sistema de Templates**

**Duración estimada**: 5-7 días
**Estado**: 🔵 Pendiente
**Depende de**: Fase 1

### Objetivos

- Implementar sistema de templates reutilizables
- Auto-detección de templates por emisor
- Crear templates predefinidos para formatos comunes
- Aprendizaje básico (asignación automática)

### Entregables

#### 1. Schema de Templates

- [ ] Tabla `templates_extraccion` en DB
- [ ] Tabla `emisor_templates_historial` para tracking
- [ ] Relaciones FK con `emisores` y `facturas`
- [ ] Migrations para agregar campos a tablas existentes

#### 2. Template Engine

- [ ] Clase `Template` con propiedades:
  - `id`, `name`, `category`, `strategy`, `config`
- [ ] Clase `TemplateEngine` con métodos:
  - `loadTemplate(id): Template`
  - `applyTemplate(template, file): ExtractionResult`
  - `mergeWithOverride(template, override): Template`
- [ ] Parser de JSON de configuración
- [ ] Aplicación de regex patterns desde config
- [ ] Aplicación de zonas OCR desde config
- [ ] Sistema de scoring de confianza

#### 3. Auto-detección

- [ ] Clase `TemplateDetector`:
  - `detectBestTemplate(file, emitter): Template`
  - `tryTemplate(template, file): ScoringResult`
- [ ] Lógica de prueba de múltiples templates
- [ ] Scoring basado en campos extraídos exitosamente
- [ ] Actualización automática de `emisor.template_preferido_id`
- [ ] Logging de intentos en `emisor_templates_historial`

#### 4. Templates Predefinidos

Crear templates JSON para:
- [ ] **AFIP Factura Electrónica A** (PDF digital)
- [ ] **AFIP Factura Electrónica B** (PDF digital)
- [ ] **AFIP Factura Electrónica C** (PDF digital)
- [ ] **PDF Digital Genérico** (regex amplios)
- [ ] **Imagen OCR Genérico** (zonas comunes)

Cada template incluye:
- Patrones regex específicos
- Coordenadas aproximadas (para OCR)
- Configuración de preprocesamiento
- Threshold de confianza mínima

#### 5. CLI para Templates

- [ ] `templates list`: Lista todos los templates
- [ ] `templates show --id <id>`: Muestra config de un template
- [ ] `templates create --file <json>`: Crea template desde archivo
- [ ] `templates test --id <id> --file <pdf>`: Prueba template
- [ ] `templates stats --id <id>`: Estadísticas de uso
- [ ] `templates assign --cuit <cuit> --template-id <id>`: Asignación manual
- [ ] `emisores templates --cuit <cuit>`: Historial de templates del emisor

#### 6. Integración con Fase 1

- [ ] Modificar flujo de procesamiento para usar templates
- [ ] Fallback a extracción genérica si ningún template funciona
- [ ] Actualizar `facturas.template_usado_id` al procesar
- [ ] Incrementar contadores en templates

### Flujo de Trabajo con Templates

```
Usuario: procesador process --file factura_nueva.pdf

1. Extraer texto/imagen del archivo
2. Detectar CUIT con métodos genéricos
3. Buscar emisor en DB
4. ¿Emisor tiene template_preferido_id?
   SÍ → Aplicar ese template directamente
   NO → TemplateDetector.detectBestTemplate():
        - Probar "AFIP Electrónica A" → ❌ score: 40%
        - Probar "AFIP Electrónica B" → ✅ score: 95%
        - Seleccionar "AFIP Electrónica B"
5. Guardar factura con template_usado_id = 2
6. Actualizar emisor.template_preferido_id = 2
7. Incrementar template.facturas_procesadas
8. Output: "✅ Factura procesada con template 'AFIP Electrónica B' (95% confianza)"
```

### Criterios de Éxito

✅ Procesar facturas de 3 emisores distintos
✅ Reutilizar 1 template en 2 emisores diferentes
✅ Template auto-detectado y asignado correctamente
✅ Estadísticas de uso de templates funcionando
✅ CLI de gestión de templates operativo

---

## 📍 **FASE 3: Gestión de Archivos**

**Duración estimada**: 2-3 días
**Estado**: 🔵 Pendiente
**Depende de**: Fase 1

### Objetivos

- Renombrado automático con nomenclatura estándar
- Organización de archivos procesados
- Prevención de duplicados
- Integridad de referencias en base de datos

### Entregables

#### 1. Renombrador de Archivos

- [ ] Clase `FileNamer`:
  - `generateName(invoice): string`
  - Formato: `{CUIT}_{FECHA}_{TIPO}-{PV}-{NUM}.{ext}`
  - Ejemplo: `30710578296_20251112_A-0001-00000123.pdf`
- [ ] Validación de nombres únicos
- [ ] Manejo de colisiones (agregar sufijo _1, _2, etc.)
- [ ] Tests con casos edge

#### 2. Organizador de Archivos

- [ ] Clase `FileOrganizer`:
  - `moveToProcessed(file, newName): string`
  - `createBackup(file): void`
- [ ] Mover de `data/input/` a `data/processed/`
- [ ] Estructura opcional: `data/processed/YYYY/MM/`
- [ ] Preservar archivos originales en `data/backup/` (configurable)
- [ ] Actualizar rutas en DB (`facturas.archivo_procesado`)
- [ ] Logging de operaciones

#### 3. Detector de Duplicados

- [ ] Cálculo de hash SHA256 de archivos
- [ ] Tabla `facturas` con columna `file_hash`
- [ ] Verificación antes de procesar:
  - Hash existe en DB → Skip con warning
  - CUIT+Tipo+PV+Número existe → Skip con warning
- [ ] Comando CLI: `duplicates check --directory <path>`
- [ ] Reporte de duplicados encontrados

#### 4. Limpieza y Mantenimiento

- [ ] Comando `cleanup --older-than <days>`: Archiva facturas viejas
- [ ] Comando `verify`: Verifica integridad de referencias DB ↔ archivos
- [ ] Comando `fix-paths`: Corrige rutas rotas en DB
- [ ] Logs de operaciones de mantenimiento

### Criterios de Éxito

✅ Archivos renombrados consistentemente
✅ No se procesan duplicados
✅ Referencias DB ↔ archivos siempre válidas
✅ Búsqueda por nombre de archivo funciona
✅ Sistema de backup operativo

---

## 📍 **FASE 4: Exportación y Búsqueda**

**Duración estimada**: 3-4 días
**Estado**: 🔵 Pendiente
**Depende de**: Fase 3

### Objetivos

- Exportar datos a CSV y Excel
- Implementar búsqueda avanzada con filtros múltiples
- Generar reportes estadísticos
- Optimizar queries para performance

### Entregables

#### 1. Exportador

- [ ] Clase `Exporter`:
  - `toCSV(invoices, path): void`
  - `toExcel(invoices, path): void`
- [ ] Formato de columnas:
  - CUIT, Razón Social, Fecha, Tipo, Punto Venta, Número
  - Comprobante Completo, Total, Moneda, Archivo, Confianza
- [ ] CSV con UTF-8 BOM para compatibilidad Excel
- [ ] Excel con formato de tabla, headers en negrita
- [ ] Filtros aplicables antes de exportar
- [ ] Comando CLI:
  - `export --format csv --output reporte.csv`
  - `export --format xlsx --emisor 30-71057829-6`

#### 2. Buscador Avanzado

- [ ] Clase `InvoiceSearcher` con filtros:
  - Por CUIT (exacto o like)
  - Por rango de fechas
  - Por tipo de comprobante
  - Por rango de montos
  - Por número de comprobante
  - Por confianza mínima
- [ ] Queries SQL optimizadas con índices
- [ ] Comando CLI:
  ```bash
  search --cuit 30-71057829-6
  search --fecha-desde 2025-01-01 --fecha-hasta 2025-12-31
  search --comprobante "A-0001-00000123"
  search --total-min 1000 --total-max 5000
  search --emisor "Empresa%"
  search --sin-validar
  ```
- [ ] Output formateado como tabla en CLI
- [ ] Paginación para resultados grandes

#### 3. Reportes Estadísticos

- [ ] Comando `stats`:
  - Total de facturas procesadas
  - Total facturado (suma de importes)
  - Cantidad de emisores únicos
  - Promedio de confianza de extracción
- [ ] Comando `stats --emisor <cuit>`:
  - Facturas por ese emisor
  - Total facturado por ese emisor
  - Template usado
  - Tasa de éxito
- [ ] Comando `stats --template <id>`:
  - Emisores usando ese template
  - Facturas procesadas
  - Tasa de éxito promedio
- [ ] Comando `stats --periodo <mes/año>`:
  - Total facturado en ese período
  - Desglose por emisor

#### 4. Índices y Optimización

- [ ] Crear índices en SQLite:
  - `emisores.cuit_numerico`
  - `facturas.emisor_cuit`
  - `facturas.fecha_emision`
  - `facturas.total`
  - `facturas.comprobante_completo`
- [ ] Tests de performance con 1000+ registros
- [ ] Optimización de queries N+1

### Criterios de Éxito

✅ Exportar 100 facturas a Excel en <5 segundos
✅ Búsquedas responden en <100ms (con 1000+ registros)
✅ Reportes generan datos correctos
✅ CSV importable en Excel sin errores de encoding
✅ Filtros combinables correctamente

---

## 📍 **FASE 5: Modo Interactivo y Validación**

**Duración estimada**: 4-5 días
**Estado**: 🔵 Pendiente
**Depende de**: Fase 4

### Objetivos

- Permitir validación manual de extracciones
- Implementar modo aprendizaje interactivo
- Corrección de datos extraídos
- Feedback loop para mejorar templates

### Entregables

#### 1. Modo Interactivo de Procesamiento

- [ ] Flag `--interactive` en comando `process`
- [ ] Mostrar datos extraídos y pedir confirmación:
  ```
  📄 Procesando: factura.pdf

  Datos extraídos:
  ✓ CUIT: 30-71057829-6 (confianza: 95%)
  ✓ Fecha: 12/11/2025 (confianza: 90%)
  ⚠ Total: $15,450.00 (confianza: 65%)
  ✓ Comprobante: A-0001-00000123 (confianza: 98%)

  ¿Es correcto? [Y/n/e para editar]
  ```
- [ ] Editor de campos:
  - Corregir valor
  - Marcar como validado manualmente
- [ ] Preguntar si guardar como mejora de template

#### 2. Queue de Revisión

- [ ] Tabla `facturas.requiere_revision` (boolean)
- [ ] Marcar automáticamente facturas con:
  - Confianza global <70%
  - Cualquier campo con confianza <60%
  - Emisor nuevo sin template
- [ ] Comando `review list`: Lista facturas pendientes de revisión
- [ ] Comando `review --id <id>`: Abre modo interactivo para esa factura
- [ ] Comando `review --batch`: Procesa todas las pendientes

#### 3. Feedback Loop y Aprendizaje

- [ ] Al corregir datos manualmente:
  - Preguntar: "¿Actualizar template con esta información?"
  - Si sí: ajustar patrones regex o coordenadas OCR
  - Crear nueva versión del template
- [ ] Tracking de correcciones:
  - Tabla `facturas_correcciones` con historial
  - Campos: `factura_id`, `campo`, `valor_original`, `valor_corregido`, `fecha`
- [ ] Estadísticas de mejora:
  - Confianza promedio antes vs. después de correcciones
  - Templates con más correcciones (necesitan revisión)

#### 4. Validación Masiva

- [ ] Comando `validate --all`: Marca todas como validadas si confianza >90%
- [ ] Comando `validate --emisor <cuit>`: Valida todas de ese emisor
- [ ] Comando `invalidate --id <id>`: Marca para re-procesamiento
- [ ] Dashboard de calidad de datos

### Criterios de Éxito

✅ Usuario puede corregir datos de facturas
✅ Sistema aprende de correcciones manuales
✅ Queue de revisión prioriza correctamente
✅ Confianza de templates mejora con feedback
✅ Historial de correcciones auditable

---

## 📍 **FASE 6: Features Avanzadas**

**Duración estimada**: 5-7 días
**Estado**: 🔵 Pendiente
**Depende de**: Fase 5

### Objetivos

- OCR avanzado con zonas configurables
- Procesamiento por lotes optimizado
- API REST (opcional)
- Watchers de directorio

### Entregables

#### 1. OCR Avanzado

- [ ] Editor visual de zonas (CLI interactivo o web simple)
- [ ] Preprocesamiento de imágenes:
  - Binarización (blanco y negro)
  - Denoise (reducción de ruido)
  - Deskew (corrección de inclinación)
  - Contrast enhancement
- [ ] Múltiples engines:
  - Tesseract.js (local)
  - Google Cloud Vision API (opcional, con API key)
  - Fallback automático si uno falla
- [ ] Confidence threshold configurable por zona
- [ ] Tests con imágenes de baja calidad

#### 2. Procesamiento Batch Optimizado

- [ ] Comando `batch --directory <path>`:
  - Procesa todos los archivos del directorio
  - Progress bar con ETA
  - Procesamiento paralelo (worker threads)
  - Logging detallado en archivo
- [ ] Resumen al finalizar:
  ```
  ✅ Procesadas: 45/50
  ⚠ Con advertencias: 3
  ❌ Fallidas: 2
  ⏱ Tiempo total: 2m 34s
  ```
- [ ] Reporte de errores en archivo separado
- [ ] Retry automático de fallidas con estrategia diferente

#### 3. API REST (Opcional)

- [ ] Framework: Express.js
- [ ] Endpoints:
  ```
  POST   /api/invoices/upload        # Upload y procesa archivo
  GET    /api/invoices                # Lista con filtros
  GET    /api/invoices/:id            # Detalle de factura
  PUT    /api/invoices/:id            # Editar datos
  DELETE /api/invoices/:id            # Eliminar

  GET    /api/emitters                # Lista emisores
  GET    /api/emitters/:cuit          # Detalle de emisor

  GET    /api/templates               # Lista templates
  POST   /api/templates               # Crear template
  PUT    /api/templates/:id           # Editar template

  GET    /api/stats                   # Estadísticas generales
  ```
- [ ] Autenticación con API key
- [ ] Rate limiting
- [ ] Documentación OpenAPI/Swagger
- [ ] CORS configurado

#### 4. File Watchers

- [ ] Monitoreo automático de `data/input/` con `chokidar`
- [ ] Procesar archivos nuevos automáticamente
- [ ] Configuración: `config.json`:
  ```json
  {
    "watch": {
      "enabled": true,
      "directory": "./data/input",
      "debounce": 1000,
      "auto_process": true
    }
  }
  ```
- [ ] Comando `watch start`: Inicia watcher en background
- [ ] Comando `watch stop`: Detiene watcher
- [ ] Logs de actividad

#### 5. Integración con Cloud (Opcional)

- [ ] Google Cloud Vision API para OCR de alta calidad
- [ ] AWS Textract como alternativa
- [ ] Configuración de credenciales
- [ ] Fallback a Tesseract si no hay conectividad

### Criterios de Éxito

✅ OCR procesa imágenes de baja calidad correctamente
✅ Batch procesa 50 facturas en <5 minutos
✅ API REST responde <200ms por request
✅ Watcher detecta y procesa archivos nuevos automáticamente

---

## 📍 **FASE 7: Productivización**

**Duración estimada**: 3-4 días
**Estado**: 🔵 Pendiente
**Depende de**: Fase 6

### Objetivos

- Documentación completa y profesional
- Tests comprehensivos (>80% cobertura)
- Optimizaciones de performance
- Empaquetado para distribución

### Entregables

#### 1. Documentación

- [ ] README.md completo con ejemplos
- [ ] CONTRIBUTING.md con guía para colaboradores
- [ ] CHANGELOG.md con versiones
- [ ] Docs adicionales:
  - Guía de configuración de templates
  - Troubleshooting común
  - FAQ
  - Arquitectura del sistema (diagramas)
- [ ] JSDoc en todo el código
- [ ] Ejemplos de uso en `/examples`

#### 2. Testing Comprehensivo

- [ ] Tests unitarios:
  - Validación CUIT
  - Extractores
  - Template engine
  - File operations
- [ ] Tests de integración:
  - Flujo completo de procesamiento
  - Base de datos
  - CLI commands
- [ ] Tests E2E:
  - Procesar facturas de ejemplo reales
  - Exportación
  - Búsqueda
- [ ] Cobertura >80%
- [ ] CI/CD con GitHub Actions

#### 3. Performance y Optimización

- [ ] Benchmarks:
  - Tiempo de procesamiento por tipo de archivo
  - Queries de base de datos
  - Exportaciones grandes
- [ ] Caché de templates en memoria
- [ ] Lazy loading de datos
- [ ] Optimización de regex
- [ ] Pool de workers para procesamiento paralelo
- [ ] Profiling y eliminación de bottlenecks

#### 4. Empaquetado

- [ ] Build de binario ejecutable con `pkg` o `nexe`:
  - `procesador-linux-x64`
  - `procesador-macos-x64`
  - `procesador-win-x64.exe`
- [ ] Dockerfile para containerización
- [ ] Docker Compose con volúmenes para datos
- [ ] Scripts de instalación:
  - `install.sh` (Linux/Mac)
  - `install.bat` (Windows)
- [ ] GitHub Releases con assets

#### 5. Monitoreo y Logging

- [ ] Winston o Pino para logging estructurado
- [ ] Niveles: `error`, `warn`, `info`, `debug`
- [ ] Rotación de logs
- [ ] Métricas de uso:
  - Facturas procesadas por día
  - Tasa de errores
  - Templates más usados

### Criterios de Éxito

✅ Documentación clara y completa
✅ Tests con cobertura >80%
✅ Performance <2s por factura promedio
✅ Binarios ejecutables funcionando
✅ CI/CD automatizado
✅ Docker image publicada

---

## 🎯 Resumen por Prioridad

### 🔴 Crítico (MVP Funcional)

| Fase | Duración | Descripción |
|------|----------|-------------|
| Fase 0 | 1-2 días | Setup del proyecto |
| Fase 1 | 3-5 días | Procesamiento básico |
| Fase 3 | 2-3 días | Gestión de archivos |
| Fase 4 | 2 días | Exportación básica (CSV) |

**Total MVP**: ~10-12 días (2 semanas)

### 🟡 Importante

| Fase | Duración | Descripción |
|------|----------|-------------|
| Fase 2 | 5-7 días | Sistema de templates |
| Fase 4 | 2 días | Búsqueda avanzada + reportes |
| Fase 5 | 4-5 días | Validación manual |

**Total con features importantes**: ~21-26 días (4 semanas)

### 🟢 Nice to Have

| Fase | Duración | Descripción |
|------|----------|-------------|
| Fase 5 | Restante | Feedback loop avanzado |
| Fase 6 | 5-7 días | API REST, watchers, OCR avanzado |
| Fase 7 | 3-4 días | Productivización |

**Total completo**: ~33-37 días (6 semanas)

---

## 📊 Timeline Visual

```
Semana 1: [████████] Fase 0 + Fase 1
Semana 2: [████████] Fase 1 + Fase 3
Semana 3: [████████] Fase 2
Semana 4: [████████] Fase 2 + Fase 4
Semana 5: [████████] Fase 5
Semana 6: [████████] Fase 6
Semana 7: [████████] Fase 7

MVP listo ─────────┘
Producto completo ─────────────────────────┘
```

---

## 🔄 Metodología de Desarrollo

### Desarrollo Iterativo

Cada fase sigue el ciclo:

1. **Plan**: Definir tareas específicas
2. **Develop**: Implementar con TDD cuando sea posible
3. **Test**: Tests unitarios + integración
4. **Review**: Code review y refactoring
5. **Document**: Actualizar docs y comentarios
6. **Deploy**: Merge a rama principal

### Principios

- ✅ **Working software over comprehensive documentation**: Priorizar código funcional
- ✅ **Incremental delivery**: Cada fase entrega valor
- ✅ **Test-driven cuando sea práctico**: Tests antes de código para lógica crítica
- ✅ **Refactoring continuo**: Mantener código limpio
- ✅ **Feedback temprano**: Probar con usuarios reales desde MVP

---

## 📝 Notas Adicionales

### Ajustes Posibles

Este roadmap es flexible. Según feedback y necesidades reales:

- Fases pueden reordenarse (ej: API antes que validación manual)
- Features pueden moverse entre fases
- Nuevas funcionalidades pueden agregarse
- Scope puede reducirse para acelerar MVP

### Dependencias Externas

- Tesseract.js puede tener limitaciones en español rioplatense
- PDFs protegidos pueden requerir herramientas adicionales
- Cloud APIs (Vision, Textract) implican costos operativos

### Riesgos Identificados

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| OCR con baja precisión en imágenes de mala calidad | Alta | Alto | Preprocesamiento + múltiples engines + validación manual |
| Diversidad de formatos de factura demasiado amplia | Media | Alto | Sistema de templates flexible + modo aprendizaje |
| Performance con volúmenes grandes (1000+ facturas) | Media | Medio | Procesamiento paralelo + optimización de queries |
| Complejidad en detección automática de campos | Alta | Medio | Fallback a modo manual + mejora iterativa |

---

## 🎬 Próximos Pasos Inmediatos

1. ✅ Crear este documento (ROADMAP.md)
2. ✅ Crear README.md
3. ⏭️ Iniciar **Fase 0**: Setup del proyecto
4. ⏭️ Crear estructura de carpetas
5. ⏭️ Configurar TypeScript + dependencias
6. ⏭️ Implementar schema de base de datos

---

**Última actualización**: 2025-11-12
**Versión**: 1.0.0
**Estado general**: 🚀 Planificación completa
