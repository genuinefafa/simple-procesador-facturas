# 📄 Simple Procesador de Facturas

[![CI](https://github.com/genuinefafa/simple-procesador-facturas/actions/workflows/ci.yml/badge.svg)](https://github.com/genuinefafa/simple-procesador-facturas/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-61%20passing-brightgreen)](https://github.com/genuinefafa/simple-procesador-facturas/actions/workflows/ci.yml)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.21.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

**Sistema web para procesamiento, extracción y gestión de facturas argentinas con reconocimiento automático OCR y matching con datos AFIP.**

---

## 🎯 ¿Qué es esto?

Aplicación fullstack que permite gestionar comprobantes fiscales de manera eficiente:

- ✅ Sube archivos (PDF, JPG, PNG, HEIC)
- ✅ Extrae datos automáticamente (PDF_TEXT + Tesseract OCR)
- ✅ Valida con datos AFIP desde Excel
- ✅ Revisión manual en interfaz visual
- ✅ Gestiona emisores y categorías
- ✅ Dashboard con métricas

> **Filosofía**: La intervención humana es el núcleo, no un fallback. El sistema ayuda pero no decide.

---

## 🚀 Quick Start

### Desarrollo Local

```bash
# 1. Clonar el repositorio
git clone https://github.com/genuinefafa/simple-procesador-facturas.git
cd simple-procesador-facturas

# 2. Instalar dependencias
npm install

# 3. Inicializar base de datos
npm run db:migrate

# 4. Levantar servidor de desarrollo
npm run dev

# 5. Abrir navegador
# http://localhost:5173
```

### Con Docker

```bash
# Build y run
docker compose up -d

# Acceder en http://localhost:5173
```

---

## 📁 Estructura del Proyecto

```
simple-procesador-facturas/
├── client/                    # 🎨 Frontend (SvelteKit)
│   ├── src/
│   │   ├── lib/
│   │   │   ├── components/ui/ # Componentes Melt UI
│   │   │   └── stores/
│   │   └── routes/
│   │       ├── +layout.svelte # Layout con rail navigation
│   │       ├── dashboard/     # Dashboard principal
│   │       ├── comprobantes/  # Hub unificado
│   │       ├── emisores/      # Gestión de emisores
│   │       ├── entrenamiento/ # Templates (futuro)
│   │       ├── google-sync/   # Integración Google
│   │       ├── annotate/      # Anotaciones manuales
│   │       └── api/           # API endpoints
│   └── vite.config.ts
│
├── server/                    # ⚙️ Backend (Services + DB)
│   ├── database/
│   │   ├── schema.ts          # Drizzle ORM schema
│   │   ├── repositories/      # Data access layer
│   │   └── migrations/
│   ├── services/
│   │   ├── invoice-processing.service.ts
│   │   ├── excel-import.service.ts
│   │   └── file-export.service.ts
│   ├── extractors/
│   │   ├── pdf-extractor.ts   # PDF_TEXT extraction
│   │   └── ocr-extractor.ts   # Tesseract OCR
│   └── validators/
│       └── cuit.ts            # Validación módulo 11
│
├── docs/                      # 📚 Documentación
│   ├── ARCHITECTURE.md
│   ├── MELT-UI.md
│   ├── SIDEBAR.md
│   └── UI_UX.md
│
├── legacy/                    # 🔴 Rutas deprecadas (solo dev)
│
├── SPEC.md                    # Especificación técnica completa
├── ROADMAP.md                 # Roadmap de desarrollo
└── CHANGELOG.md
```

---

## 🏗️ Stack Tecnológico

### Frontend
- **Framework**: SvelteKit 2.x
- **UI Library**: Svelte 5.41.0 (runes: $state, $derived)
- **Components**: Melt UI Next v0.44
- **Styling**: CSS puro con design tokens (no Tailwind)
- **Notifications**: svelte-sonner

### Backend
- **Runtime**: Node.js 22.x
- **Database**: SQLite + Drizzle ORM
- **PDF Processing**: pdf-parse
- **OCR**: Tesseract.js
- **Image Processing**: sharp, heic-convert

---

## 🎯 Rutas Principales

| Ruta | Descripción |
|------|-------------|
| `/` | Redirect a `/dashboard` |
| `/dashboard` | Vista principal con métricas |
| `/comprobantes` | **Hub principal** - Listado unificado con filtros |
| `/comprobantes/[id]` | Detalle individual del comprobante |
| `/emisores` | Gestión de emisores (CRUD) |
| `/google-sync` | Integración con Google Drive/Sheets |
| `/entrenamiento` | Templates de extracción (futuro) |
| `/annotate` | Anotaciones manuales |

**Rutas legacy** (archivadas en `/legacy`, solo visibles en dev):
- `/importar`, `/procesar`, `/facturas`, `/pending-files`
- Estas fueron reemplazadas por el **Comprobantes Hub**

---

## 📊 Flujo de Usuario

```
1. Usuario accede a /dashboard
2. Navega a /comprobantes
3. Sube archivo PDF/imagen (drag & drop)
   └─ Sistema guarda en `files` con status "uploaded"
   └─ Sistema extrae automáticamente texto (PDF_TEXT o OCR)
   └─ Guarda resultados en `file_extraction_results`
   └─ Busca match en expected_invoices (si existe Excel AFIP)
4. Usuario revisa detalle (/comprobantes/file:ID)
   └─ Ve datos extraídos con nivel de confianza
   └─ Corrige campos si es necesario
   └─ Asigna categoría (opcional)
   └─ Clickea "Crear factura"
5. Factura creada en `facturas`
6. Archivo actualizado: `files.status = 'processed'`
```

---

## 🔧 Comandos Disponibles

### Desarrollo

```bash
npm run dev              # Servidor de desarrollo (http://localhost:5173)
npm run build            # Build de producción
npm run preview          # Preview del build
```

### Base de Datos

```bash
npm run db:migrate       # Aplicar migraciones
npm run db:push          # Push schema sin migración
npm run db:studio        # Abrir Drizzle Studio (GUI)
npm run db:generate      # Generar nueva migración
npm run db:reset         # ⚠️ Resetear BD (borra todo)
```

### Testing y Calidad

```bash
npm run check            # Type checking
npm run format           # Formatear código (Prettier)
npm run test:extraction  # Tests de extracción de archivos
```

### Docker

```bash
docker compose up -d     # Levantar contenedor
docker compose down      # Detener contenedor
docker compose logs -f   # Ver logs
```

---

## 📚 Documentación

Para más detalles técnicos, consulta:

- **[SPEC.md](./SPEC.md)** - Especificación técnica completa
- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - Arquitectura del sistema
- **[docs/MELT-UI.md](./docs/MELT-UI.md)** - Componentes UI
- **[docs/UI_UX.md](./docs/UI_UX.md)** - Guías de UI/UX
- **[docs/GOOGLE_SETUP.md](./docs/GOOGLE_SETUP.md)** - Configuración Google Drive/Sheets
- **[ROADMAP.md](./ROADMAP.md)** - Roadmap de desarrollo
- **[CHANGELOG.md](./CHANGELOG.md)** - Historial de cambios

---

## 🐛 Issues y Milestones

El proyecto usa GitHub Issues para tracking de tareas:

- **[Issues](https://github.com/genuinefafa/simple-procesador-facturas/issues)**
- **[Milestones](https://github.com/genuinefafa/simple-procesador-facturas/milestones)**

### Milestones Activos

- **M0.5**: Documentation & Cleanup (Due: 2025-12-20)
- **M3**: Emisores management (Due: 2026-01-15)
- **M4**: Dashboard features (Due: 2026-02-01)
- **M5**: Mejoras secundarias y nice-to-have

---

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama feature (`git checkout -b feat/amazing-feature`)
3. Commit tus cambios (`git commit -m 'feat: add amazing feature'`)
4. Push a la rama (`git push origin feat/amazing-feature`)
5. Abre un Pull Request

**Convenciones de commits**:
```
feat(scope): descripción
fix(scope): descripción
docs: descripción
refactor: descripción
chore: descripción
```

---

## 📝 Licencia

Este proyecto está bajo la licencia MIT. Ver [LICENSE](./LICENSE) para más detalles.

---

## 🙏 Agradecimientos

- [SvelteKit](https://kit.svelte.dev/) - Framework fullstack
- [Melt UI](https://melt-ui.com/) - Componentes accesibles
- [Drizzle ORM](https://orm.drizzle.team/) - ORM TypeScript
- [Tesseract.js](https://tesseract.projectnaptha.com/) - OCR en JavaScript

---

**Versión actual**: v0.5.0
**Última actualización**: 2026-01-16
**Mantenedor**: [@fcaldera](https://github.com/fcaldera)
