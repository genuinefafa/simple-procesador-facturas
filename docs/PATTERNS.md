# Patrones de Arquitectura

**Versión**: v0.6.0
**Última actualización**: 2026-02-05

Este documento describe los patrones arquitectónicos implementados en el proyecto, con énfasis en principios SOLID.

---

## 1. Contratos Zod (`server/contracts/`)

### Propósito

Validación runtime con Zod para API boundaries. Garantiza que los datos recibidos cumplen con el schema esperado antes de procesarlos.

### Estructura

```
server/contracts/
├── index.ts              # Re-exporta todos los schemas
├── shared.ts             # Schemas reutilizables (CUIT, fecha, etc.)
├── invoice.ts            # InvoicePatchSchema
└── expected-invoice.ts   # ExpectedInvoicePatchSchema
```

### Uso en Endpoints

```typescript
// En +server.ts
import { InvoicePatchSchema, formatZodError } from '@server/contracts';

export async function PATCH({ params, request }) {
  const body = await request.json();

  // Validar con Zod
  const result = InvoicePatchSchema.safeParse(body);
  if (!result.success) {
    return json(formatZodError(result.error), { status: 400 });
  }

  // result.data está tipado como InvoicePatchInput
  const validatedData = result.data;
  // ... procesar
}
```

### Schemas Compartidos

```typescript
// server/contracts/shared.ts
import { z } from 'zod';

// CUIT con validación módulo 11
export const cuitSchema = z.string()
  .regex(/^\d{2}-?\d{8}-?\d$/, 'Formato de CUIT inválido')
  .transform(val => val.replace(/-/g, ''));

// Fecha ISO
export const dateStringSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)');

// Monto monetario
export const amountSchema = z.number()
  .nonnegative('El monto no puede ser negativo')
  .multipleOf(0.01, 'Máximo 2 decimales');
```

### Formateo de Errores

```typescript
// Respuesta de error consistente
{
  "error": "Validación fallida",
  "details": {
    "emitterCuit": ["Formato de CUIT inválido"],
    "total": ["El monto no puede ser negativo"]
  }
}
```

### Crear Nuevo Schema

1. Crear archivo en `server/contracts/` (ej: `emitter.ts`)
2. Importar schemas compartidos de `shared.ts`
3. Definir el schema con validaciones
4. Exportar desde `index.ts`
5. Usar en el endpoint correspondiente

---

## 2. Servicios de Cliente (`client/src/lib/services/`)

### Propósito

Encapsular llamadas API en clases/módulos dedicados. Facilita testing, reutilización y mantenimiento.

### Estructura

```
client/src/lib/services/
├── ComprobanteService.ts   # Operaciones de facturas
└── EmitterService.ts       # Operaciones de emisores
```

### Patrón ApiResult

```typescript
// Respuesta tipada para todas las operaciones
export interface ApiResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}
```

### Ejemplo: ComprobanteService

```typescript
class ComprobanteService {
  /**
   * Actualizar una factura existente
   */
  async updateInvoice(invoiceId: number, data: InvoiceUpdateData): Promise<ApiResult> {
    try {
      const response = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emitterCuit: data.cuit,
          invoiceType: data.invoiceType,
          // ...
        }),
      });

      if (response.ok) {
        return { success: true };
      }
      const err = await response.json();
      return { success: false, error: err.error || 'Error al guardar' };
    } catch {
      return { success: false, error: 'Error al guardar' };
    }
  }
}

// Exportar instancia singleton
export const comprobanteService = new ComprobanteService();
```

### Uso en Componentes

```typescript
// En un componente Svelte
import { comprobanteService } from '$lib/services/ComprobanteService';

async function handleSave() {
  const result = await comprobanteService.updateInvoice(invoiceId, formData);
  if (result.success) {
    toast.success('Guardado');
  } else {
    toast.error(result.error);
  }
}
```

### Cuándo Crear un Servicio

- Operaciones CRUD repetidas
- Lógica de API compartida entre componentes
- Necesidad de transformar datos antes/después de la API
- Facilitar mocking en tests

---

## 3. Interface Segregation Principle (ISP)

### Propósito

Separar tipos por caso de uso. Un componente no debe depender de tipos que no usa.

### Ejemplo: InvoiceCard.types.ts

```typescript
// client/src/lib/components/InvoiceCard.types.ts

/**
 * Base compartida entre modos
 */
export interface InvoiceFieldsBase {
  cuit: string;
  emitterName?: string | null;
  issueDate: string | null;
  invoiceType: number | null;
  // ...
}

/**
 * Modo VIEW - requiere ID (factura existente)
 */
export interface InvoiceViewData extends InvoiceFieldsBase {
  id: number;
}

/**
 * Modo CREATE - ID ausente (factura nueva)
 */
export interface InvoiceCreateData extends InvoiceFieldsBase {
  id?: never;
}

/**
 * Union type para el prop
 */
export type InvoiceData = InvoiceViewData | InvoiceCreateData;
```

### Props Segregados

```typescript
/**
 * Props para modo VIEW
 */
export interface InvoiceCardViewProps {
  invoice: InvoiceViewData;
  categories?: Category[];
  mode?: 'view';
  onsave?: (data: InvoiceSaveData) => void;
  ondelete?: () => void;
}

/**
 * Props para modo CREATE
 */
export interface InvoiceCardCreateProps {
  invoice: InvoiceCreateData;
  categories?: Category[];
  mode: 'create';
  onsave?: (data: InvoiceSaveData) => void;
  oncancel?: () => void;
}

/**
 * Union type para el componente
 */
export type InvoiceCardProps = InvoiceCardViewProps | InvoiceCardCreateProps;
```

### Beneficios

- TypeScript discrimina automáticamente por `mode`
- En modo `view`, sabemos que `invoice.id` existe
- En modo `create`, `oncancel` está disponible pero no `ondelete`
- Componentes consumidores solo ven los tipos relevantes

---

## 4. Dependency Inversion Principle (DIP)

### Propósito

Componentes dependen de abstracciones (callbacks), no de implementaciones concretas. Facilita testing y reutilización.

### Ejemplo: NavigationBar

```typescript
// NavigationBar.svelte
type Props = {
  currentId: string;
  title: string;
  /**
   * Callback opcional para navegación.
   * Si se provee, el componente delega la navegación al padre.
   * Si no, usa goto() de SvelteKit.
   */
  onnavigate?: (targetId: string | null) => void;
};

let { currentId, title, onnavigate }: Props = $props();

function navigate(targetId: string | null) {
  if (onnavigate) {
    // Delegado al padre
    onnavigate(targetId);
  } else {
    // Comportamiento por defecto
    if (targetId === null) {
      goto('/comprobantes');
    } else {
      goto(`/comprobantes/${targetId}`);
    }
  }
}
```

### Uso Normal (comportamiento por defecto)

```svelte
<!-- La navegación usa goto() internamente -->
<NavigationBar
  currentId="factura:123"
  title="FACB 0007-00000640"
/>
```

### Uso con Callback (testing/custom behavior)

```svelte
<script>
  function handleNav(targetId: string | null) {
    console.log('Navegando a:', targetId);
    // Custom behavior...
  }
</script>

<NavigationBar
  currentId="factura:123"
  title="FACB 0007-00000640"
  onnavigate={handleNav}
/>
```

### Beneficios

- Componentes testeables sin mocks de `goto()`
- Comportamiento por defecto sensato
- Flexibilidad para casos especiales
- Bajo acoplamiento

---

## 5. URL como Fuente de Verdad (Navigation State)

### Principio

La URL debe ser la **única fuente de verdad** para el estado de navegación visible al usuario. Esto incluye:
- Drawers/paneles laterales abiertos
- Modales con contexto (ej: `/emisores?selected=CUIT`)
- Filtros de búsqueda activos
- Tabs o vistas seleccionadas

### Por qué

1. **Deep links**: Los usuarios pueden compartir/guardar URLs específicas
2. **Historial coherente**: Back/forward funcionan como el usuario espera
3. **Refresh**: Recargar la página mantiene el estado visible
4. **SSR-friendly**: El servidor puede pre-renderizar el estado correcto

### Implementación con SvelteKit

```typescript
// ❌ MAL: Estado local como fuente de verdad
let selectedId = $state<string | null>(null);

function openDrawer(id: string) {
  selectedId = id;
  history.pushState({}, '', `?selected=${id}`); // Sincronización manual
}

// ✅ BIEN: URL como fuente de verdad
import { goto } from '$app/navigation';
import { page } from '$app/state';

// Derivar estado de la URL
let selectedId = $derived(page.url.searchParams.get('selected'));

// Reaccionar a cambios de URL
$effect(() => {
  if (selectedId) {
    loadData(selectedId);
  }
});

function openDrawer(id: string) {
  goto(`?selected=${id}`); // La URL es la fuente de verdad
}

function closeDrawer() {
  goto('/ruta-base');
}
```

### replaceState vs pushState

| Escenario | Método | Ejemplo |
|-----------|--------|---------|
| Abrir drawer/modal | `goto(url)` (push) | Usuario puede hacer "back" para cerrar |
| Cerrar drawer/modal | `goto(url)` (push) | Usuario puede hacer "back" para reabrir |
| Cambiar filtros | `goto(url)` (push) | Usuario navega por historial de filtros |
| Corrección de URL | `goto(url, { replaceState: true })` | Normalizar URL sin agregar entrada |
| Redirección | `goto(url, { replaceState: true })` | No contaminar historial |

### Qué NO va en la URL

- Estado de UI temporal (hover, focus, animaciones)
- Estado de formularios en edición (antes de guardar)
- Estado de carga (loading spinners)
- Mensajes de error/éxito (toasts)

### Checklist

- [ ] ¿El estado es visible para el usuario y compartible? → URL
- [ ] ¿Back/forward debería afectar este estado? → URL con pushState
- [ ] ¿Es estado transitorio de UI? → `$state` local
- [ ] ¿Es estado de formulario sin guardar? → `$state` local

---

## 6. Melt UI Select/Dropdown Positioning

### Problema

Los dropdowns de Melt UI Select usan la Popover API nativa del navegador y calculan posiciones absolutas desde el viewport. Sin la estructura CSS correcta, el dropdown puede aparecer en ubicaciones incorrectas.

### Solución

El wrapper debe tener `position: relative` y el content debe tener `position: absolute` con `margin-left: 0`:

```svelte
<div class="select-wrapper">
  <button {...select.trigger} class="select-trigger">
    {selectedLabel}
    <ChevronDown size={14} />
  </button>

  <div {...select.content} class="select-content">
    {#each options as opt}
      <div {...select.getOption(opt.value, opt.label)} class="select-option">
        {opt.label}
      </div>
    {/each}
  </div>
</div>

<style>
  /* CRÍTICO: wrapper con position relative */
  .select-wrapper {
    position: relative;
    display: flex;
    flex-direction: column;
  }

  /* CRÍTICO: content con position absolute y margin-left: 0 */
  .select-content {
    position: absolute;
    margin-left: 0;
    z-index: var(--z-dropdown);
    min-width: var(--melt-invoker-width);
    /* resto de estilos... */
  }
</style>
```

### Reglas Clave

1. **Wrapper**: `position: relative` (ancla el contenedor)
2. **Content**: `position: absolute` + `margin-left: 0` (posiciona respecto al wrapper)
3. **Contenedores padre**: `overflow: visible` si el dropdown puede sobresalir
4. **NO usar**: `left: 0; top: 100%;` - Melt calcula las coordenadas automáticamente

### Referencias

- [InvoiceTypeSelect.svelte](../client/src/lib/components/InvoiceTypeSelect.svelte)
- [CategorySelect.svelte](../client/src/lib/components/CategorySelect.svelte)

---

## 7. CSS/Layout Patterns

### Tablas con Columnas Alineadas

Para layouts tabulares donde las columnas deben estar perfectamente alineadas entre filas, usar HTML `<table>` con `<tbody>` y `<tfoot>`:

```svelte
<table class="data-table">
  <tbody>
    {#each items as item}
      <tr>
        <td class="col-label">{item.label}</td>
        <td class="col-value">{item.value}</td>
        <td class="col-actions">...</td>
      </tr>
    {/each}
  </tbody>
  <tfoot>
    <tr class="total-row">
      <td>Total</td>
      <td>{total}</td>
      <td></td>
    </tr>
  </tfoot>
</table>

<style>
  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-xs);
  }
  .data-table td {
    padding: 2px var(--spacing-2);
  }
</style>
```

### Paneles Anidados (Evitar "Doble Cuadro")

Cuando un panel contiene otro componente con borde propio, el contenedor **NO debe tener borde**:

```css
/* ❌ MAL: doble borde */
.section { border: 1px solid var(--color-border); }
.panel-inside { border: 1px solid var(--color-border); }

/* ✅ BIEN: solo el hijo tiene borde */
.section {
  border: none;
  padding: 0;
  background: transparent;
}
.panel-inside {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}
```

### Columnas Flexibles en Grid

Para que una columna crezca con el viewport pero tenga un mínimo:

```css
.list-row {
  display: grid;
  /* Emisor crece, otras columnas fijas */
  grid-template-columns: 180px minmax(200px, 1fr) 85px 110px 60px;
}
```

### Texto Truncado con CSS (no JS)

No truncar texto en JavaScript cuando CSS puede manejarlo:

```typescript
// ❌ MAL: truncar en JS
function getEmitterName(name: string) {
  return name.length > 20 ? name.slice(0, 20) + '...' : name;
}

// ✅ BIEN: dejar que CSS lo maneje
function getEmitterName(name: string) {
  return name; // CSS hace el truncado si es necesario
}
```

```css
.emitter-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

---

## 8. Patrones Adicionales

### Repository Pattern

Los repositorios encapsulan acceso a base de datos:

```typescript
// server/database/repositories/invoice.ts
export class InvoiceRepository {
  findById(id: number): Invoice | undefined { ... }
  findAll(filters?: InvoiceFilters): Invoice[] { ... }
  create(data: CreateInvoiceData): Invoice { ... }
  update(id: number, data: UpdateInvoiceData): Invoice { ... }
  delete(id: number): void { ... }
}
```

### Service Layer

Los servicios orquestan lógica de negocio:

```typescript
// server/services/invoice-processing.service.ts
export class InvoiceProcessingService {
  constructor(
    private invoiceRepo: InvoiceRepository,
    private fileRepo: FileRepository,
    private extractorService: ExtractorService
  ) {}

  async processFile(fileId: number): Promise<ProcessResult> {
    // Orquesta múltiples operaciones
  }
}
```

---

## 9. Checklist para Nuevos Componentes

- [ ] **Tipos**: ¿Hay múltiples modos/variantes? → Crear `Componente.types.ts` con ISP
- [ ] **API calls**: ¿Múltiples endpoints? → Crear/usar Service
- [ ] **Navegación**: ¿Usa `goto()`? → Considerar callback `onnavigate`
- [ ] **URL State**: ¿Estado visible/compartible? → Derivar de `page.url`, usar `goto()`
- [ ] **Acciones**: ¿Tiene efectos secundarios? → Considerar callbacks delegados
- [ ] **Validación**: ¿Endpoint recibe datos? → Usar schema Zod

---

## 10. Referencias

- [SOLID Principles](https://en.wikipedia.org/wiki/SOLID)
- [Zod Documentation](https://zod.dev/)
- [Svelte 5 Props](https://svelte.dev/docs/svelte/$props)
- [TypeScript Discriminated Unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions)

---

**Última revisión**: 2026-02-05
**Mantenedor**: @fcaldera
