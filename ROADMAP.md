# 🗺️ Roadmap: Procesador Inteligente de Facturas

Plan de desarrollo del proyecto, organizado en fases con objetivos claros.

---

## 📍 **FASE 0: Refactor a Web-Only**

**Estado**: ✅ Completado

### Objetivos Cumplidos

- ✅ Migrar de CLI a 100% web application
- ✅ Implementar Drizzle ORM para migraciones automáticas
- ✅ Configurar Docker y docker-compose
- ✅ Crear servicios reutilizables (procesamiento y export)
- ✅ Implementar API REST completa
- ✅ Configurar Vite con puertos personalizables

### Entregables

- ✅ Drizzle ORM configurado con schema TypeScript
- ✅ Sistema de migraciones automáticas
- ✅ Eliminación de código CLI legacy
- ✅ Servicios: `InvoiceProcessingService`, `FileExportService`
- ✅ API endpoints:
  - `POST /api/invoices/upload`
  - `POST /api/invoices/process`
  - `POST /api/invoices/export`
  - `PATCH /api/invoices/[id]`
  - `DELETE /api/invoices/[id]`
- ✅ Dockerfile multi-stage optimizado
- ✅ docker-compose.yml con volúmenes persistentes
- ✅ README.md actualizado con nueva arquitectura
- ✅ Configuración de puertos vía environment variables

---

## 📍 **FASE 1: Frontend - Drag & Drop y Flujo Completo**

**Estado**: 🔵 Pendiente
**Prioridad**: Alta
**Depende de**: Fase 0

### Objetivos

- Implementar interfaz de drag & drop para subir archivos
- Crear vista de procesamiento con estadísticas en tiempo real
- Página de revisión/edición de facturas
- Vista de resultados con opción de export

### Entregables

- [ ] Componente `FileUploader.svelte` con drag & drop
- [ ] Página `/upload` para subir archivos
- [ ] Página `/process` que muestra:
  - Progreso del procesamiento
  - Estadísticas (exitosas, fallidas, requieren revisión)
  - Lista de resultados con badges de confianza
- [ ] Mejorar página `/annotate/[id]` existente para edición manual
- [ ] Página `/results` con:
  - Tabla de facturas procesadas
  - Filtros (por fecha, CUIT, confianza)
  - Botón de export masivo
- [ ] Componente `InvoiceCard.svelte` reutilizable
- [ ] Loading states y manejo de errores
- [ ] Notificaciones toast para feedback

### Tecnologías

- SvelteKit stores para estado global
- Fetch API para llamadas a backend
- File API para drag & drop
- CSS Grid/Flexbox para layouts responsivos

---

## 📍 **FASE 2: OCR y Templates Inteligentes**

**Estado**: 🔵 Pendiente
**Prioridad**: Media
**Depende de**: Fase 1

### Objetivos

- Implementar OCR para PDFs escaneados e imágenes
- Sistema de templates reutilizables
- Aprendizaje automático de formatos por emisor

### Entregables

- [ ] Integrar Tesseract.js para OCR
- [ ] Servicio `OCRExtractor` para imágenes
- [ ] Detectar automáticamente tipo de documento (digital vs escaneado)
- [ ] Sistema de coordenadas para zonas OCR
- [ ] Crear templates desde anotaciones manuales
- [ ] Algoritmo de matching de templates
- [ ] Auto-asignar template preferido por emisor
- [ ] Tracking de tasa de éxito por template

### Schema Updates

```typescript
// Nuevas columnas en templates_extraccion
- ocrZones: JSON // Coordenadas de zonas a extraer
- preprocessingConfig: JSON // Ajustes de imagen (sharp)

// Nuevas tablas
- template_versions // Versionado de templates
- ocr_cache // Cache de resultados OCR
```

---

## 📍 **FASE 3: Analytics y Dashboard**

**Estado**: 🔵 Pendiente
**Prioridad**: Baja
**Depende de**: Fase 2

### Objetivos

- Dashboard con métricas clave
- Gráficos de procesamiento
- Reportes exportables

### Entregables

- [ ] Página `/dashboard` con:
  - Total facturas procesadas
  - Tasa de éxito por mes
  - Top 5 emisores
  - Gráfico de totales facturados
  - Timeline de procesamiento
- [ ] Integrar librería de charts (Chart.js o D3.js)
- [ ] Endpoint `GET /api/stats/summary`
- [ ] Endpoint `GET /api/stats/by-emitter`
- [ ] Export de reportes a Excel
- [ ] Filtros por rango de fechas

---

## 📍 **FASE 4: Optimizaciones y Performance**

**Estado**: 🔵 Pendiente
**Prioridad**: Baja
**Depende de**: Fase 3

### Objetivos

- Procesamiento en background (workers)
- Cache de resultados
- Optimización de queries

### Entregables

- [ ] Worker threads para procesamiento paralelo
- [ ] Cola de trabajos (Bull o BullMQ)
- [ ] Redis para cache (opcional)
- [ ] WebSocket para updates en tiempo real
- [ ] Índices optimizados en BD
- [ ] Lazy loading en frontend
- [ ] Paginación en listados
- [ ] Compression de archivos PDF

---

## 📍 **FASE 5: Features Avanzados**

**Estado**: 🔵 Pendiente
**Prioridad**: Futura

### Ideas

- [ ] Multi-tenancy (múltiples empresas)
- [ ] API pública con autenticación
- [ ] Webhooks para integraciones
- [ ] Machine Learning para clasificación
- [ ] Soporte para más tipos de comprobantes (Notas de crédito, débito)
- [ ] Integración con AFIP para validar comprobantes
- [ ] Mobile app (React Native o Progressive Web App)
- [ ] Exportación a sistemas contables (ContaPlus, Tango, etc.)

---

## 🎯 Hitos Importantes

| Hito | Fecha Objetivo | Estado |
|------|---------------|--------|
| Refactor Web-Only | ✅ Completado | ✅ |
| Frontend Drag & Drop | Q1 2025 | 🔵 |
| OCR y Templates | Q2 2025 | 🔵 |
| Dashboard | Q3 2025 | 🔵 |
| Optimizaciones | Q4 2025 | 🔵 |

---

## 🐛 Bugs Conocidos

- [ ] Ninguno reportado aún

---

## 💡 Mejoras Propuestas

- Agregar modo oscuro
- Soporte para múltiples idiomas
- Tutorial interactivo para nuevos usuarios
- Atajos de teclado para acciones comunes
- Modo offline con sincronización

---

## 📝 Notas de Versión

### v0.2.0 - Refactor Web-Only (En desarrollo)

**Breaking Changes:**
- Eliminado CLI completo
- Nuevo sistema de migraciones con Drizzle ORM
- API REST es ahora la única interfaz

**Nuevas Features:**
- Drag & drop para upload
- Endpoints REST completos
- Docker support
- Vite configurable por puerto

**Mejoras:**
- Schema TypeScript type-safe
- Migraciones automáticas
- Servicios desacoplados

### v0.1.0 - MVP Inicial (Obsoleto)

- CLI básico
- Extracción genérica de PDFs
- Validación CUIT
- Base de datos SQLite

---

Última actualización: Noviembre 2024
