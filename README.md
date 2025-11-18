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

### Stack Tecnológico

**Backend:**
- Node.js 22.21.0+
- TypeScript 5.7
- Drizzle ORM (migraciones automáticas)
- SQLite (better-sqlite3)
- pdf-parse (extracción de texto)

**Frontend:**
- SvelteKit 2
- Vite
- PDF.js (visualización)

**DevOps:**
- Docker & Docker Compose
- Nginx (reverse proxy, opcional)

### Estructura del Proyecto

```
simple-procesador-facturas/
├── client/                        # 🎨 FRONTEND (SvelteKit)
│   └── src/
│       ├── routes/
│       │   ├── +page.svelte      # UI principal
│       │   └── api/              # API endpoints
│       │       └── invoices/
│       │           ├── upload/+server.ts      # POST subir archivos
│       │           ├── process/+server.ts     # POST procesar
│       │           ├── export/+server.ts      # POST exportar
│       │           ├── pending/+server.ts     # GET listar
│       │           └── [id]/+server.ts        # GET/PATCH/DELETE
│       └── lib/
│           └── components/       # Componentes Svelte
├── server/                        # ⚙️ BACKEND (Services + DB)
│   ├── database/
│   │   ├── schema.ts             # Schema Drizzle (TypeScript)
│   │   ├── db.ts                 # Conexión a BD
│   │   ├── repositories/         # Repositorios de acceso a datos
│   │   └── migrations/           # Migraciones SQL generadas
│   ├── extractors/               # Extractores de información (PDF)
│   ├── validators/               # Validación de CUIT
│   └── services/                 # Lógica de negocio
│       ├── invoice-processing.service.ts
│       └── file-export.service.ts
├── data/
│   ├── input/                    # Archivos subidos
│   ├── processed/                # Archivos renombrados
│   └── database.sqlite           # Base de datos
├── scripts/
│   ├── migrate.ts                # Ejecutar migraciones
│   └── seed.ts                   # Datos de prueba
├── Dockerfile
├── docker-compose.yml
└── drizzle.config.ts             # Configuración Drizzle Kit
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

# 2. Instalar dependencias
npm install
cd client && npm install && cd ..

# 3. Ejecutar migraciones de BD
npm run db:migrate

# 4. (Opcional) Cargar datos de prueba
npm run db:seed

# 5. Iniciar servidor de desarrollo
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`

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

```bash
# Desarrollo
npm run dev                    # Iniciar servidor de desarrollo

# Base de datos
npm run db:generate            # Generar nueva migración desde schema
npm run db:migrate             # Ejecutar migraciones pendientes
npm run db:push                # Push directo a BD (dev only)
npm run db:studio              # Abrir Drizzle Studio (GUI)
npm run db:seed                # Cargar datos de prueba

# Testing
npm run test                   # Ejecutar todos los tests
npm run test:unit              # Solo tests unitarios
npm run test:integration       # Solo tests de integración
npm run test:coverage          # Generar reporte de cobertura

# Linting & Formatting
npm run lint                   # Ejecutar ESLint
npm run lint:fix               # Arreglar problemas automáticamente
npm run format                 # Formatear código con Prettier
npm run format:check           # Verificar formato

# Build & Preview
npm run build                  # Build para producción
npm run preview                # Preview del build
```

## 🗄️ Base de Datos

### Migraciones

Este proyecto usa **Drizzle ORM** para gestionar migraciones automáticamente:

```bash
# 1. Modificar src/database/schema.ts
# 2. Generar migración
npm run db:generate

# 3. Aplicar migración
npm run db:migrate
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
