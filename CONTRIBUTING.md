# Guía de Contribución

Gracias por tu interés en contribuir al proyecto. Esta guía te ayudará a empezar.

## Requisitos Previos

- Node.js >= 22.21.0
- npm >= 10.x
- Git

## Setup Inicial

```bash
# 1. Clonar el repositorio
git clone https://github.com/genuinefafa/simple-procesador-facturas.git
cd simple-procesador-facturas

# 2. Instalar dependencias
npm install

# 3. Configurar git hooks
git config core.hooksPath .githooks

# 4. Inicializar base de datos
npm run db:migrate

# 5. Levantar servidor de desarrollo
npm run dev
```

## Estructura del Proyecto

```
simple-procesador-facturas/
├── client/              # Frontend (SvelteKit)
│   └── src/
│       ├── lib/
│       │   ├── components/
│       │   └── services/
│       └── routes/
├── server/              # Backend (Services + DB)
│   ├── contracts/       # Schemas Zod
│   ├── database/
│   ├── services/
│   └── extractors/
├── docs/                # Documentación técnica
└── examples/            # Fixtures de test
```

## Flujo de Trabajo

### 1. Crear Branch

```bash
# Features
git checkout -b feat/nombre-descriptivo

# Bugfixes
git checkout -b fix/nombre-descriptivo

# Refactoring
git checkout -b refactor/nombre-descriptivo
```

### 2. Desarrollo

- Mantener commits pequeños y frecuentes
- Ejecutar validaciones antes de commitear:
  ```bash
  npm run check          # TypeScript
  npm run lint           # ESLint
  npm run format         # Prettier
  ```

### 3. Commits

Usamos [Conventional Commits](https://www.conventionalcommits.org/) en inglés:

```bash
feat(scope): add new feature
fix(scope): fix bug description
docs: update documentation
refactor(scope): refactor code
chore: update dependencies
```

**Ejemplos de scopes**: `api`, `ui`, `database`, `contracts`, `services`

### 4. Pull Request

- **Título y descripción en español argentino formal**
- Asociar al milestone correspondiente
- Incluir:
  - Resumen de cambios
  - Issues que cierra
  - Screenshots (si hay cambios visuales)

**Template:**
```markdown
## Resumen
[Descripción breve de los cambios]

## Cambios
- Cambio 1
- Cambio 2

## Cierra
- Cierra #XX
```

---

## Convenciones de Código

### TypeScript

- Usar tipos estrictos, evitar `any`
- Interfaces en PascalCase
- Enums para estados: `"pending" | "processed"`

### Svelte 5

- Usar runes: `$state`, `$derived`, `$effect`, `$bindable`
- NO usar stores (`writable`, `derived`) para estado local

### Estilos

- CSS puro con design tokens (ver `tokens.css`)
- NO Tailwind
- BEM naming cuando sea necesario

### API

- Validar inputs con Zod (ver `server/contracts/`)
- Usar `formatZodError()` para respuestas de error
- Endpoints RESTful

---

## Patrones Arquitectónicos

### Contratos Zod

Para validación runtime en endpoints:

```typescript
// server/contracts/invoice.ts
import { z } from 'zod';

export const InvoicePatchSchema = z.object({
  emitterCuit: cuitSchema.optional(),
  invoiceType: invoiceTypeSchema.optional(),
  // ...
});

// En el endpoint
const result = InvoicePatchSchema.safeParse(body);
if (!result.success) {
  return json(formatZodError(result.error), { status: 400 });
}
```

### Servicios de Cliente

Encapsular llamadas API:

```typescript
// client/src/lib/services/ComprobanteService.ts
class ComprobanteService {
  async updateInvoice(id: number, data: InvoiceUpdateData): Promise<ApiResult> {
    // ...
  }
}
export const comprobanteService = new ComprobanteService();
```

### Interface Segregation

Tipos separados por caso de uso:

```typescript
// Componente.types.ts
interface ViewProps { id: number; /* ... */ }
interface CreateProps { id?: never; /* ... */ }
type Props = ViewProps | CreateProps;
```

### Dependency Injection

Callbacks opcionales para navegación/acciones:

```typescript
type Props = {
  onnavigate?: (targetId: string | null) => void;
};

function navigate(targetId: string | null) {
  if (onnavigate) {
    onnavigate(targetId);
  } else {
    goto(`/comprobantes/${targetId}`);
  }
}
```

---

## Testing

### Base de Datos de Test

Los tests usan `database.test.sqlite` automáticamente:

```typescript
import { runTestMigrations, resetTestDb, cleanupTestDb } from '@server/database/db-test';

beforeAll(async () => {
  await runTestMigrations();
});

beforeEach(() => {
  resetTestDb();
});

afterAll(() => {
  cleanupTestDb();
});
```

### Datos de Prueba

**IMPORTANTE**: Este repo es público. NUNCA usar datos reales.

CUITs de prueba aprobados:
- Persona: `20-12345678-9`
- Empresa: `30-12345678-9`
- Monotributista: `23-12345678-9`

---

## Políticas de UI/UX

### Prohibido
- `alert()`, `confirm()`, `prompt()`
- `window.location.href` (rompe SPA)
- Valores CSS hardcoded
- Tailwind classes

### Requerido
- Toast notifications (`svelte-sonner`)
- Dialog component para confirmaciones
- `goto()` de `$app/navigation`
- Design tokens de `tokens.css`

---

## Comandos Útiles

```bash
# Desarrollo
npm run dev              # Servidor http://localhost:5173

# Base de datos
npm run db:migrate       # Aplicar migraciones
npm run db:studio        # GUI Drizzle
npm run db:reset         # Resetear BD (borra todo)

# Calidad
npm run check            # TypeScript check
npm run lint             # ESLint
npm run format           # Prettier (auto-fix)
npm run format:check     # Prettier (verify only)

# Tests
npm run test             # Vitest
npm run test:extraction  # Tests de extracción

# Build
npm run build            # Build de producción
npm run preview          # Preview del build
```

---

## Git Hooks

El proyecto usa hooks personalizados en `.githooks/`:

1. **Auto-formateo**: Prettier en archivos staged
2. **Validación Svelte**: Detecta errores de sintaxis
3. **svelte-check**: Opcional, con confirmación

Si el hook no se ejecuta:
```bash
git config core.hooksPath .githooks
```

---

## Preguntas Frecuentes

### ¿Por qué no Tailwind?

El proyecto usa CSS puro con design tokens para mayor control y consistencia. Ver `client/src/lib/components/ui/tokens.css`.

### ¿Cómo agrego un nuevo endpoint?

1. Crear archivo en `client/src/routes/api/[recurso]/+server.ts`
2. Agregar schema Zod en `server/contracts/` si es PATCH/POST
3. Documentar en SPEC.md

### ¿Cómo creo un nuevo componente?

1. Crear `Componente.svelte` en `client/src/lib/components/`
2. Si tiene tipos complejos, crear `Componente.types.ts`
3. Usar design tokens para estilos

---

## Contacto

- Issues: [GitHub Issues](https://github.com/genuinefafa/simple-procesador-facturas/issues)
- Mantenedor: [@fcaldera](https://github.com/fcaldera)

---

**Última actualización**: 2026-01-26
