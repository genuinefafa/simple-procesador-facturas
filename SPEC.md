# Especificación Técnica - Procesador de Facturas

**Versión actual**: v0.6.0
**Última actualización**: 2026-02-02

---

## 1. Visión del Proyecto

### 1.1 Filosofía

> **"La intervención humana es el núcleo, no un fallback"**

- El sistema **ayuda pero no decide**
- El usuario **siempre revisa** antes de confirmar
- OCR es **manual** (usuario clickea "Reconocer")
- Excel AFIP sirve para **completar datos**, no para automatizar

### 1.2 Historia

| Versión | Fecha | Hitos |
|---------|-------|-------|
| v0.1 | - | CLI básico, SQLite manual |
| v0.2 | Nov 2024 | Web-only, Drizzle ORM |
| v0.3 | Nov-Dec 2024 | OCR + Excel AFIP |
| v0.4 | Dec 2024 | Comprobantes Hub, Melt UI |
| v0.5 | Ene 2026 | Unified File Management |
| v0.6 | Feb 2026 | Categories, lucide-svelte |

---

## 2. Flujos de Usuario

### 2.1 Flujo Principal (Happy Path)

```
1. Usuario accede a /dashboard
2. Navega a /comprobantes
3. Sube archivo PDF/imagen (drag & drop)
   → Sistema guarda en `files` con status "uploaded"
   → Extrae texto (PDF_TEXT o OCR)
   → Guarda en `file_extraction_results`
   → Busca match en expected_invoices
4. Usuario revisa detalle (/comprobantes/file:ID)
   → Ve datos extraídos con nivel de confianza
   → Corrige campos si es necesario
   → Asigna categoría (opcional)
   → Clickea "Crear factura"
5. Factura creada en `invoices`
6. Archivo movido a `data/finalized/`
```

### 2.2 Flujo Excel AFIP (Matching)

```
1. Usuario importa Excel AFIP desde /comprobantes
2. Sistema crea registros en expected_invoices
3. Al procesar archivo:
   a. Busca match exacto (CUIT + Tipo + PV + Número)
   b. Si no hay exacto → candidatos (CUIT + Fecha ±7d + Total ±10%)
   c. Match único → auto-completa campos
   d. Múltiples candidatos → usuario elige
4. Usuario confirma match
5. expected_invoice marcado como "matched"
```

### 2.3 Flujo Emisores

```
1. Acceder a /emisores
2. Ver lista (CUIT, nombre, alias)
3. "Nuevo Emisor" → CUIT, nombre, alias
4. Sistema valida CUIT (módulo 11)
5. Emisor disponible para asignar en facturas
```

---

## 3. Algoritmos y Decisiones Técnicas

### 3.1 Extracción de Datos

**Prioridad de métodos:**
1. **PDF_TEXT** - PDF con texto embebido
2. **OCR** - Tesseract.js para PDFs escaneados/imágenes
3. **Excel AFIP** - Auto-completar desde datos fiscales

**Scoring:**
- Cada campo tiene score de confianza (0-100)
- CUIT tiene prioridad absoluta (activa OCR si falla)
- Fecha usa patrones específicos (±200 pts para match definitivo)
- Tipo soporta texto pegado ("AFACTURA" → "A")

**Fallbacks:**
- CUIT de receptor conocido → penalización -300
- CUIT no encontrado → OCR automático
- Confianza < threshold → status "reviewing"

### 3.2 Matching Excel AFIP

**Match exacto:**
```
CUIT + Tipo + PuntoVenta + Número === expected_invoice
```

**Match por proximidad:**
```
CUIT === expected.cuit
&& |Date - expected.date| <= 7 días
&& |Total - expected.total| <= 10%
```

**Estados:** `pending` | `matched` | `ignored`

### 3.3 File Hashing (SHA-256)

**Decisión:** SHA-256 (64 caracteres hex)

**Justificación:**
- Estándar de la industria
- Resistente a colisiones
- ~50-100ms por archivo de 500KB
- Compatible con herramientas estándar

**Flujo:**
1. **Upload** → Hash calculado inmediatamente, guardado en `files.file_hash`
2. **Processing** → Hash copiado a `invoices.file_hash`
3. **Backfill** → `npm run backfill-hashes` para archivos existentes

### 3.4 Performance

**Implementado:**
- Lazy loading de componentes
- Debounce en búsquedas (300ms)
- localStorage para filtros
- SPA navigation con `goto()`

**Pendiente:**
- Paginación en listados largos
- Virtual scrolling
- Cache de previews PDF

---

## 4. Deployment

### 4.1 Docker

```bash
docker build -t procesador-facturas .
docker compose up -d
```

### 4.2 Variables de Entorno

**Client (.env):**
```bash
VITE_PORT=5173
PUBLIC_API_URL=http://localhost:5173
```

**Server (.env):**
```bash
DATABASE_URL=file:./database/invoices.db
NODE_ENV=production
```

### 4.3 Healthcheck

```
GET http://localhost:5173/api/health
```

---

## 5. Futuras Posibilidades

Ideas NO comprometidas que podrían considerarse:

- Multi-tenant (varios usuarios/empresas)
- API pública con JWT
- Integración con ERPs
- Machine Learning para detección
- App mobile
- Auditoría de cambios
- Validación contra constancia AFIP

---

## 6. Índice de Documentación

| Documento | Contenido |
|-----------|-----------|
| [CLAUDE.md](./CLAUDE.md) | Reglas de desarrollo, prohibiciones, convenciones |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Stack, estructura, schema DB, API endpoints |
| [docs/PATTERNS.md](./docs/PATTERNS.md) | Patrones SOLID, Zod contracts, servicios |
| [docs/ICONS.md](./docs/ICONS.md) | Sistema de iconos (lucide-svelte) |
| [docs/UI_UX.md](./docs/UI_UX.md) | Guidelines UI, componentes, accesibilidad |
| [docs/MELT-UI.md](./docs/MELT-UI.md) | Uso de Melt UI Next |
| [ROADMAP.md](./ROADMAP.md) | Milestones, issues, releases |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Guía para contributors |
| [CHANGELOG.md](./CHANGELOG.md) | Historial de versiones |

---

**Última revisión**: 2026-02-02
**Mantenedor**: @fcaldera
