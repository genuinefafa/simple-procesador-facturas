# 📄 Procesador Inteligente de Facturas

[![CI](https://github.com/genuinefafa/simple-procesador-facturas/actions/workflows/ci.yml/badge.svg)](https://github.com/genuinefafa/simple-procesador-facturas/actions/workflows/ci.yml)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.21.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Code Style: Prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://prettier.io/)

Sistema web para procesamiento, extracción y gestión de facturas argentinas con reconocimiento automático y aprendizaje de patrones.

## 🎯 Descripción

Aplicación web que permite procesar facturas en diversos formatos (PDF, JPG, PNG) extrayendo automáticamente información clave como CUIT, razón social, fecha, número de comprobante y totales. El flujo completo se gestiona desde el navegador: upload, procesamiento, revisión y export.

## ✨ Características Principales

- 🌐 **100% Web**: Interfaz completa en el navegador, sin CLI
- 📤 **Drag & Drop**: Sube archivos arrastrándolos
- 🔍 **Extracción Automática**: PDFs digitales procesados con regex avanzado
- ✏️ **Anotación Manual**: Editor visual para corregir datos no reconocidos
- ✔️ **Validación CUIT**: Algoritmo módulo 11 para CUITs argentinos
- 📊 **Base de Datos**: SQLite con migraciones automáticas (Drizzle ORM)
- 📁 **Export Automático**: Renombrado con formato `{CUIT}_{FECHA}_{TIPO}-{PV}-{NUM}.pdf`
- 🐳 **Docker Ready**: Dockerfile y docker-compose incluidos

## 🏗️ Arquitectura

**Monorepo con npm workspaces:**
- `client/` = SvelteKit fullstack (Frontend UI + Backend API)
- `server/` = Shared libraries (Database, Services, Extractors)
- `package.json` root = Orquestador

**Importante:** No hay servidor HTTP separado. Todo corre dentro de SvelteKit. Los servicios en `server/` son importados por los API endpoints en `client/src/routes/api/`.

### Stack Tecnológico

- **Runtime:** Node.js 22.21.0+, TypeScript 5.7
- **Framework:** SvelteKit 2 (fullstack)
- **Database:** SQLite (better-sqlite3) + Drizzle ORM
- **PDF Processing:** pdf-parse, pdf-lib
- **Build:** Vite
- **DevOps:** Docker, Docker Compose

### Estructura del Proyecto (M1 - Enero 2026)

```
simple-procesador-facturas/
├── client/                              # 🌐 SVELTEKIT FULLSTACK
│   ├── src/
│   │   ├── routes/
│   │   │   ├── +layout.svelte          # 📌 Layout global con sidebar
│   │   │   ├── importar/
│   │   │   │   └── +page.svelte        # 📥 Importar PDFs + Excel AFIP
│   │   │   ├── revisar/
│   │   │   │   └── +page.svelte        # ✏️ Revisar archivos pendientes
│   │   │   ├── facturas/
│   │   │   │   └── +page.svelte        # 📋 Listar facturas procesadas
│   │   │   ├── google-sync/
│   │   │   │   └── +page.svelte        # ☁️ Sync con Google Sheets
│   │   │   ├── annotate/
│   │   │   │   └── +page.svelte        # (Existente) Anotar facturas
│   │   │   └── api/                    # 🔌 Backend API (SvelteKit endpoints)
│   │   │       ├── invoices/
│   │   │       ├── pending-files/
│   │   │       ├── expected-invoices/
│   │   │       └── google-sync/
│   │   └── lib/
│   │       ├── components/             # 🧩 Componentes reutilizables (M1)
│   │       │   ├── Button.svelte
│   │       │   ├── Card.svelte
│   │       │   ├── PageHeader.svelte
│   │       │   ├── StatsBar.svelte
│   │       │   ├── UploadSection.svelte
│   │       │   └── index.ts            # Exports centralizados
│   │       └── formatters.ts
│   ├── package.json
│   └── vite.config.ts                  # Alias $server para imports
│
├── server/                              # 📚 SHARED LIBRARIES
│   ├── database/
│   │   ├── schema.ts                   # Drizzle ORM schema
│   │   ├── db.ts                       # SQLite connection
│   │   ├── repositories/               # Data access layer
│   │   └── migrations/
│   ├── services/
│   │   ├── invoice-processing.service.ts
│   │   ├── file-export.service.ts
│   │   └── excel-import.service.ts
│   ├── extractors/
│   │   ├── pdf-extractor.ts
│   │   └── ocr-extractor.ts
│   ├── validators/
│   │   └── cuit.ts
│   ├── utils/
│   └── package.json
│
├── data/                                # 💾 Persistent data
│   ├── input/                          # Uploaded files
│   ├── processed/                      # Renamed & processed files
│   └── database.sqlite
│
├── docs/
│   ├── UI_UX_GUIDELINES.md             # (Actualizado con M1)
│   └── README.md
│
└── package.json                         # Monorepo orchestrator
```

---

## 🎯 Flujo de Usuario (M1)

### 1️⃣ **Importar** (`/importar`)
```
Dos opciones:
├─ PDFs/Imágenes → Drag & drop → Upload automático → Procesamiento
└─ Excel AFIP   → Importar → Crear batch de facturas esperadas
```

### 2️⃣ **Revisar** (`/revisar`)
```
Archivos pendientes
├─ Vista previa (PDF/imagen)
├─ Datos detectados vs Excel (si existe match)
├─ Edición inline
└─ Confirmar o reprocesar
```

### 3️⃣ **Facturas** (`/facturas`)
```
Listado de facturas procesadas
├─ Búsqueda y filtros
├─ Selección múltiple
└─ Exportación masiva
```

### 4️⃣ **Google Sync** (`/google-sync`)
```
Sincronización manual
├─ Emisores (👥)
├─ Facturas (📋)
├─ Facturas esperadas (📊)
└─ Logs (📝)

Modos: Sincronizar (🔄) | Subir (⬆️) | Descargar (⬇️)
```

---

## 🚀 Inicio Rápido

### Prerequisitos

- Node.js >= 22.21.0
- npm >= 10.0.0

### Instalación Local

```bash
# 1. Clonar repositorio
git clone https://github.com/genuinefafa/simple-procesador-facturas.git
cd simple-procesador-facturas

# 2. Instalar dependencias (workspaces: root, client, server)
npm install

# 3. Configurar archivo de configuración
cp server/config.json.example server/config.json
# Editar server/config.json si necesitas cambiar rutas o configuración

# 4. (Opcional) Configurar puerto personalizado
cd client
cp .env.example .env
# Editar .env y cambiar VITE_PORT si querés usar otro puerto
cd ..

# 5. Ejecutar migraciones de BD
npm run db:migrate

# 6. (Opcional) Cargar datos de prueba
npm run db:seed

# 7. Iniciar servidor de desarrollo
npm run dev
```

La aplicación estará disponible en `http://localhost:5173` (o el puerto configurado en `client/.env`)

### Con Docker

```bash
# 1. Copiar archivo de configuración
cp .env.example .env

# 2. Construir y levantar contenedores
docker-compose up -d

# 3. Ver logs
docker-compose logs -f app
```

La aplicación estará disponible en `http://localhost:3000`

### Integración con Google Sheets + Drive (Opcional)

El sistema puede usar **Google Sheets** como base de datos y **Google Drive** para almacenar archivos, eliminando la necesidad de una base de datos local y facilitando la colaboración.

**Ventajas:**
- ✅ Sin infraestructura: No necesitas servidor ni base de datos
- ✅ Colaboración: Múltiples usuarios pueden ver/editar
- ✅ Auditoría: Google mantiene historial de cambios automáticamente
- ✅ Búsqueda: Motor nativo de Google en sheets y archivos
- ✅ Backup: Versionado automático de Google Drive

**Setup rápido:**

```bash
# 1. Configurar credenciales de Google Cloud
# Ver GOOGLE_SETUP.md para instrucciones detalladas

# 2. Activar en config.json
nano server/config.json
# Cambiar "enabled": true y agregar spreadsheetId y rootFolderId

# 3. Verificar configuración
npm run test:google

# 4. ¡Listo! Ahora las facturas se guardan en Google Sheets + Drive
npm run dev
```

📚 **Documentación completa:** Ver [GOOGLE_SETUP.md](./GOOGLE_SETUP.md) para instrucciones paso a paso.

## 📖 Uso

### Flujo Completo

1. **Upload**: Arrastra archivos PDF/JPG/PNG a la zona de drop
2. **Procesamiento Automático**: El sistema extrae datos usando regex
3. **Revisión**:
   - ✅ Verde: Alta confianza (≥90%)
   - ⚠️ Amarillo: Requiere revisión (70-89%)
   - ❌ Rojo: Baja confianza (<70%)
4. **Anotación**: Corrige datos manualmente si es necesario
5. **Export**: Descarga archivos renombrados o genera Excel

### Matching con Excel AFIP (Nuevo)

El sistema permite importar el Excel de AFIP con facturas recibidas para validación cruzada:

1. **Importar Excel**: Tab "Importar Excel" → Drag & drop del archivo AFIP
2. **Matching automático**: Al procesar PDFs, el sistema busca coincidencias por CUIT
3. **Comparación visual**: Tab "Revisar" muestra tabla comparativa PDF vs Excel
4. **Indicadores**:
   - ✓ (verde): Dato coincide con Excel
   - ⚠ (rojo): Dato difiere del Excel
   - ❌ (amarillo): No detectado en PDF
   - ⚪ (gris): Sin datos de Excel

**Beneficios:**
- Auto-completado de campos desde Excel (datos validados por AFIP)
- Detecta discrepancias entre PDF y registros oficiales
- Reduce trabajo manual de transcripción

### Comandos NPM

**Desde la raíz del proyecto** (usa npm workspaces):

```bash
# Desarrollo
npm run dev                    # Inicia SvelteKit (http://localhost:5173)
npm run build                  # Build de producción
npm run preview                # Preview del build

# CI/CD
npm run test                   # Tests (server workspace)
npm run lint                   # ESLint en todos los workspaces
npm run format:check           # Prettier check en todos los workspaces

# Base de datos
npm run db:migrate             # Aplicar migraciones
npm run db:seed                # Cargar datos de prueba
npm run db:studio              # Drizzle Studio GUI

# Docker
npm run docker:build           # Construir imagen
npm run docker:up              # Levantar contenedores
npm run docker:down            # Detener contenedores
npm run docker:logs            # Ver logs
```

**Dentro de cada workspace:**

```bash
# En server/ - solo si necesitás operaciones específicas
cd server
npm run db:generate            # Generar nueva migración
npm run db:push                # Push directo (dev only)
npm run test:unit              # Tests unitarios
npm run test:coverage          # Reporte de cobertura
npm run lint:fix               # Fix linting issues
npm run format                 # Format code

# En client/ - rara vez necesario
cd client
npm run check                  # SvelteKit type check
npm run lint                   # Lint frontend
```

### Variables de Entorno

El proyecto usa dos archivos `.env` separados:

**1. `client/.env` - Configuración de Vite (desarrollo)**

```bash
cd client
cp .env.example .env
```

Variables disponibles:
- `VITE_PORT=5173` - Puerto del dev server
- `VITE_PREVIEW_PORT=4173` - Puerto del preview
- `VITE_HOST=localhost` - Host (usar `0.0.0.0` para LAN)

**2. `.env` (root) - Configuración de Docker (producción)**

```bash
cp .env.example .env
```

Variables disponibles:
- `APP_PORT=3000` - Puerto mapeado en Docker
- `NODE_ENV=production` - Modo de ejecución

**Nota:** Las variables con prefijo `VITE_` solo se usan en `vite.config.ts` para configurar el servidor de desarrollo, NO se exponen al código del cliente por razones de seguridad.

## 🗄️ Base de Datos

### Migraciones con Drizzle ORM

```bash
# 1. Modificar server/database/schema.ts
# 2. Generar migración SQL
cd server && npm run db:generate

# 3. Aplicar migraciones
npm run db:migrate  # (desde root)

# 4. (Opcional) Cargar datos de prueba
npm run db:seed
```

### Schema Principal

**Tablas:**
- `templates_extraccion`: Templates reutilizables de extracción
- `emisores`: Entidades que emiten facturas
- `facturas`: Comprobantes procesados
- `facturas_zonas_anotadas`: Zonas dibujadas por usuarios (para entrenar OCR)
- `facturas_correcciones`: Log de correcciones manuales
- `emisor_templates_historial`: Tracking de qué template funciona mejor

**Features:**
- Foreign keys con CASCADE
- Triggers para actualizar estadísticas
- Vistas para queries comunes
- Índices optimizados

## 🔧 Configuración

### Variables de Entorno

**Frontend (client/.env):**
```bash
VITE_PORT=5173              # Puerto dev server
VITE_PREVIEW_PORT=4173      # Puerto preview
VITE_HOST=localhost         # Host (usar 0.0.0.0 para red local)
```

**Docker (.env):**
```bash
APP_PORT=3000               # Puerto expuesto
NODE_ENV=production
```

## 🧪 Testing

```bash
# Ejecutar todos los tests
npm run test

# Modo watch
npm run test:watch

# Con cobertura
npm run test:coverage
```

Los tests cubren:
- ✅ Validación de CUIT
- ✅ Extracción de datos de PDFs
- ✅ Servicios de procesamiento
- ✅ Endpoints de API
- ✅ Repositorios de BD

## 📊 API Endpoints

### Upload
```http
POST /api/invoices/upload
Content-Type: multipart/form-data

{
  "files": [File, File, ...]
}
```

### Process
```http
POST /api/invoices/process
Content-Type: application/json

{
  "files": [
    { "name": "factura.pdf", "path": "/app/data/input/factura.pdf" }
  ]
}
```

### Export
```http
POST /api/invoices/export
Content-Type: application/json

{
  "invoiceIds": [1, 2, 3]
}
```

### Update
```http
PATCH /api/invoices/:id
Content-Type: application/json

{
  "invoiceType": "A",
  "pointOfSale": 1,
  "invoiceNumber": 123,
  "total": 1000.50,
  "issueDate": "2024-01-15"
}
```

### Delete
```http
DELETE /api/invoices/:id
```

## 🐳 Docker

### Build Manual

```bash
docker build -t procesador-facturas .
docker run -p 3000:3000 -v $(pwd)/data:/app/data procesador-facturas
```

### Docker Compose

```bash
# Iniciar
docker-compose up -d

# Ver logs
docker-compose logs -f

# Detener
docker-compose down

# Reconstruir
docker-compose up -d --build
```

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📜 Licencia

Este proyecto está bajo la Licencia MIT. Ver archivo `LICENSE` para más detalles.

## 🔗 Enlaces

- [Documentación Drizzle ORM](https://orm.drizzle.team/)
- [SvelteKit Docs](https://kit.svelte.dev/)
- [Guía de AFIP](https://www.afip.gob.ar/)

## 📝 Roadmap

Ver [ROADMAP.md](./ROADMAP.md) para planes futuros.

---

Desarrollado con ❤️ para simplificar la gestión de facturas argentinas
