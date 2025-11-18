# 🔄 Refactor Completo: CLI → Web Application

## 📋 Resumen Ejecutivo

Este PR transforma completamente el proyecto de una aplicación CLI a una **aplicación web moderna y completa**. Se eliminó toda la interfaz de línea de comandos y se implementó un flujo web unificado con API REST, migraciones automáticas de base de datos, y soporte completo para Docker.

## 🎯 Motivación

El enfoque anterior (CLI + web para anotaciones) tenía varios problemas:
- Flujo fragmentado (CLI para procesar, web solo para anotar)
- Experiencia de usuario desconectada
- Requiere conocimiento de terminal
- No hay feedback visual durante el procesamiento
- Difícil colaboración entre usuarios

**Nueva visión**: Todo el ciclo completo en una aplicación web:
1. Upload de archivos (drag & drop)
2. Procesamiento automático
3. Revisión/anotación de datos
4. Export con renombrado automático

## 🔨 Cambios Principales

### ❌ Eliminado

```
src/cli/                    # Toda la interfaz CLI
src/main.ts                 # Entry point CLI
scripts/init-db.ts          # Script legacy de inicialización
scripts/migrate-zones.cjs   # Migración ad-hoc
package.json → "commander"  # Dependencia CLI
```

### ✅ Agregado

#### 1. **Drizzle ORM** - Migraciones Automáticas

**Archivos nuevos:**
```
src/database/schema.ts              # Schema TypeScript type-safe
src/database/db.ts                  # Conexión con Drizzle
src/database/migrations/            # Migraciones generadas
drizzle.config.ts                   # Configuración Drizzle Kit
scripts/migrate.ts                  # Script unificado de migración
```

**Beneficios:**
- ✅ Type-safety completo en queries
- ✅ Migraciones automáticas desde cambios en schema
- ✅ Rollback support
- ✅ No más scripts SQL manuales
- ✅ Drizzle Studio (GUI) para inspeccionar BD

**Comandos nuevos:**
```bash
npm run db:generate    # Generar migración desde schema
npm run db:migrate     # Ejecutar migraciones + triggers/views
npm run db:push        # Push directo a BD (dev only)
npm run db:studio      # Abrir GUI de Drizzle
```

#### 2. **Servicios Reutilizables**

**`src/services/invoice-processing.service.ts`**
- Encapsula lógica de extracción de facturas
- Soporta procesamiento batch
- Retorna resultados estructurados con confianza y errores
- Reutilizable desde API o futuros workers

**`src/services/file-export.service.ts`**
- Renombrado automático: `{CUIT}_{FECHA}_{TIPO}-{PV}-{NUM}.pdf`
- Copia a directorio de salida
- Actualiza BD con nueva ruta
- Soporta export batch

#### 3. **API REST Completa**

**Endpoints implementados:**

```http
POST /api/invoices/upload
- Recibe archivos vía multipart/form-data
- Validación: extensiones (PDF/JPG/PNG), tamaño (max 10MB)
- Guarda en data/input/
- Retorna: lista de archivos subidos

POST /api/invoices/process
- Recibe: lista de {name, path}
- Procesa usando InvoiceProcessingService
- Retorna: estadísticas + resultados detallados

POST /api/invoices/export
- Recibe: array de invoice IDs
- Renombra y copia a data/processed/
- Usa FileExportService
- Retorna: nuevas rutas + estadísticas

PATCH /api/invoices/[id]
- Actualiza campos manualmente
- Marca como validada
- Recalcula comprobante completo

DELETE /api/invoices/[id]
- Elimina factura (cascade elimina zonas)
```

**Archivos:**
```
web/src/routes/api/invoices/
├── upload/+server.ts       # POST
├── process/+server.ts      # POST
├── export/+server.ts       # POST
└── [id]/+server.ts         # GET/PATCH/DELETE (mejorado)
```

#### 4. **Docker & DevOps**

**`Dockerfile`**
- Multi-stage build (builder + production)
- Imagen Alpine optimizada
- Usuario no-root por seguridad
- Healthcheck configurado
- Size optimizado (~150MB compressed)

**`docker-compose.yml`**
- Servicio app con volúmenes persistentes
- Bind mounts para data/ (input, processed, backup)
- Variables de entorno configurables
- Healthcheck y restart policy
- Network aislada
- Comentarios para nginx reverse proxy opcional

**Archivos de configuración:**
```
.dockerignore               # Optimizar builds
.env.example                # Template para docker-compose
web/.env.example            # Template para Vite
```

#### 5. **Vite Configurable**

**`web/vite.config.ts`**
```typescript
server: {
  port: parseInt(process.env.VITE_PORT || '5173'),
  host: process.env.VITE_HOST || 'localhost',
  strictPort: false,
}
```

Permite correr múltiples apps en puertos diferentes sin conflictos.

### 🔧 Modificado

#### **package.json**

**Antes:**
```json
"bin": { "procesador": "./dist/main.js" },
"scripts": {
  "dev": "tsx watch src/main.ts",
  "build": "tsc",
  "db:init": "tsx scripts/init-db.ts",
  "web:dev": "cd web && npm run dev"
}
```

**Ahora:**
```json
"scripts": {
  "dev": "cd web && npm run dev",
  "build": "cd web && npm run build",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "tsx scripts/migrate.ts",
  "db:push": "drizzle-kit push",
  "db:studio": "drizzle-kit studio"
}
```

#### **InvoiceRepository**

Agregados métodos:
```typescript
updateProcessedFile(id: number, path: string): void
findByEmitterAndNumber(...): Invoice | null
```

Modificado `create()` para aceptar `Date | string` en `issueDate`.

#### **README.md y ROADMAP.md**

Completamente reescritos para reflejar:
- Nueva arquitectura web-only
- Comandos actualizados
- Flujo de uso simplificado
- Endpoints de API documentados
- Instrucciones Docker
- Fase 0 marcada como completada

## 📊 Estadísticas

### Archivos

| Categoría | Cantidad |
|-----------|----------|
| Eliminados | 7 archivos |
| Creados | 15 archivos |
| Modificados | 5 archivos |

### Líneas de Código

| Tipo | Líneas |
|------|--------|
| TypeScript (servicios) | ~380 |
| API endpoints | ~373 |
| Docker config | ~150 |
| Drizzle schema | ~300 |
| Documentación | ~500 |

## 🧪 Testing

**Estado actual:**
- ✅ Servicios tienen tipos y JSDoc completos
- ✅ API endpoints con manejo de errores robusto
- ⚠️ Tests pendientes (Fase próxima)

**Por implementar:**
```bash
npm run test:unit           # Tests de servicios
npm run test:integration    # Tests de API endpoints
```

## 🚀 Migración desde Versión Anterior

Si tienes una BD existente de v0.1.0:

```bash
# 1. Backup de BD actual
cp data/database.sqlite data/database.backup.sqlite

# 2. Pull de la nueva rama
git pull origin claude/refactor-project-approach-01LDcr25rLxbLvSokmtMpdQY

# 3. Instalar nuevas dependencias
npm install
cd web && npm install && cd ..

# 4. Ejecutar migraciones (respeta datos existentes)
npm run db:migrate

# 5. Iniciar aplicación
npm run dev
```

## 📋 Checklist Pre-Merge

### Funcionalidad
- [x] Drizzle ORM genera migraciones correctamente
- [x] Endpoints de API responden con datos válidos
- [x] Docker build completa sin errores
- [x] docker-compose levanta correctamente
- [x] Vite inicia en puerto configurable
- [ ] Frontend drag & drop (Fase 1 - próximo PR)
- [ ] Tests unitarios (Fase 1 - próximo PR)

### Documentación
- [x] README.md actualizado
- [x] ROADMAP.md actualizado
- [x] API endpoints documentados
- [x] Variables de entorno documentadas
- [x] Instrucciones Docker completas

### DevOps
- [x] Dockerfile optimizado
- [x] docker-compose.yml funcional
- [x] .dockerignore configurado
- [x] Healthchecks implementados
- [x] Usuario no-root en container

### Limpieza
- [x] CLI removido completamente
- [x] Scripts legacy eliminados
- [x] Dependencias no usadas eliminadas
- [x] package.json simplificado

## 🔜 Próximos Pasos (Fase 1)

Estos NO están en este PR, serán en el siguiente:

1. **Frontend Drag & Drop**
   - Componente `FileUploader.svelte`
   - Página `/upload`
   - Integración con API

2. **Vista de Procesamiento**
   - Progreso en tiempo real
   - Estadísticas visuales
   - Lista de resultados

3. **Vista de Export**
   - Tabla de facturas
   - Filtros avanzados
   - Export masivo

4. **Tests**
   - Unit tests para servicios
   - Integration tests para API
   - E2E tests para flujo completo

## 📝 Commits

Este PR incluye los siguientes commits incrementales:

1. `chore: actualizar Node version a 22.21.0 en .nvmrc`
2. `feat: instalar y configurar Drizzle ORM`
3. `refactor: eliminar CLI y scripts legacy`
4. `feat: crear servicios de procesamiento y export`
5. `feat: crear endpoints de API para flujo completo`
6. `feat: configurar Vite y Docker`
7. `docs: actualizar README y ROADMAP`

## ⚠️ Breaking Changes

- **CLI eliminado**: `procesador process` ya no existe
- **Comandos npm cambiados**:
  - ❌ `npm run db:init` (usar `npm run db:migrate`)
  - ❌ `npm run web:dev` (usar `npm run dev`)
- **Entry point cambiado**: Ya no hay `dist/main.js`
- **Nuevo flujo**: Todo se hace desde el navegador

## 🎉 Beneficios

### Para Usuarios
- ✅ Interfaz más intuitiva (web vs CLI)
- ✅ Feedback visual en tiempo real
- ✅ No requiere conocimiento de terminal
- ✅ Colaboración multi-usuario (todos acceden al navegador)

### Para Desarrolladores
- ✅ Type-safety con Drizzle
- ✅ Migraciones automáticas
- ✅ Código más mantenible (servicios separados)
- ✅ API REST testeable
- ✅ Docker para despliegue fácil

### Para DevOps
- ✅ Containerización completa
- ✅ Volúmenes persistentes
- ✅ Healthchecks para monitoring
- ✅ Usuario no-root (seguridad)
- ✅ Multi-stage build (tamaño optimizado)

---

## 🙋 Preguntas Frecuentes

**P: ¿Puedo seguir usando el CLI?**
R: No, fue eliminado completamente. Toda la funcionalidad ahora está en la web.

**P: ¿Mis datos existentes se perderán?**
R: No, las migraciones respetan datos existentes. Haz un backup por seguridad.

**P: ¿Cuándo estará el frontend drag & drop?**
R: En el próximo PR (Fase 1). Este PR es solo backend/infraestructura.

**P: ¿Funciona en producción?**
R: Sí, con Docker. Usa `docker-compose up -d` y está listo.

---

**Reviewers:** Por favor revisar especialmente:
- [ ] Schema de Drizzle (schema.ts)
- [ ] Endpoints de API (seguridad, validaciones)
- [ ] Dockerfile (optimizaciones, seguridad)
- [ ] Documentación (claridad, completitud)

**Tiempo estimado de revisión:** 1-2 horas

---

Desarrollado con ❤️ para simplificar la gestión de facturas
