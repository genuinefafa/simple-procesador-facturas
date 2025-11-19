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

### Estructura del Proyecto

```
simple-procesador-facturas/
├── client/                        # 🌐 SVELTEKIT FULLSTACK
│   ├── src/
│   │   ├── routes/
│   │   │   ├── +page.svelte      # Frontend UI
│   │   │   └── api/              # Backend API (SvelteKit endpoints)
│   │   │       ├── invoices/upload/+server.ts
│   │   │       ├── invoices/process/+server.ts
│   │   │       ├── invoices/export/+server.ts
│   │   │       └── annotations/+server.ts
│   │   └── lib/components/       # Svelte components
│   ├── package.json
│   └── vite.config.ts            # Alias @server para imports
│
├── server/                        # 📚 SHARED LIBRARIES (NO es servidor HTTP)
│   ├── database/
│   │   ├── schema.ts             # Drizzle ORM schema
│   │   ├── db.ts                 # SQLite connection
│   │   ├── repositories/         # Data access layer
│   │   └── migrations/           # SQL migrations
│   ├── services/                 # Business logic
│   │   ├── invoice-processing.service.ts
│   │   └── file-export.service.ts
│   ├── extractors/               # PDF extraction logic
│   ├── validators/               # CUIT validation
│   ├── scripts/
│   │   ├── migrate.ts            # Run migrations
│   │   └── seed.ts               # Seed test data
│   └── package.json
│
├── data/                          # Persistent data
│   ├── input/                    # Uploaded files
│   ├── processed/                # Renamed files
│   └── database.sqlite           # SQLite database
│
├── package.json                   # Monorepo orchestrator
├── Dockerfile
└── docker-compose.yml
```

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

# 3. (Opcional) Configurar puerto personalizado
cd client
cp .env.example .env
# Editar .env y cambiar VITE_PORT si querés usar otro puerto
cd ..

# 4. Ejecutar migraciones de BD
npm run db:migrate

# 5. (Opcional) Cargar datos de prueba
npm run db:seed

# 6. Iniciar servidor de desarrollo
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
