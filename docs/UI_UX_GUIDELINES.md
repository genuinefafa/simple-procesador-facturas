# UI/UX Guidelines

## ❌ PROHIBIDO TERMINANTEMENTE

### 1. `alert()`, `confirm()`, `prompt()` - NUNCA, JAMÁS

```javascript
// ❌ PROHIBIDO - Esto es de Visual Basic del año 1995
alert('Operación exitosa');
confirm('¿Estás seguro?');
prompt('Ingrese un valor');
```

**¿Por qué está prohibido?**
- Bloquea toda la UI
- No se puede personalizar el diseño
- Horrible experiencia de usuario
- Parecemos amateur
- Es código de los años 90

**✅ Usar en su lugar:**
- **Toast notifications** para mensajes informativos
- **Modals/Dialogs** para confirmaciones
- **Inline validation** para formularios
- **Banner notifications** para errores persistentes

---

## ✅ PRÁCTICAS RECOMENDADAS

### Toast Notifications (Mensajes temporales)

```svelte
<script>
  import { toast } from './lib/toast'; // Sistema de toast propio

  function handleSuccess() {
    toast.success('✅ Operación exitosa');
  }

  function handleError() {
    toast.error('❌ Error al procesar');
  }

  function handleWarning() {
    toast.warning('⚠️ Revisar datos');
  }
</script>
```

### Confirmaciones (Modals)

```svelte
<script>
  let showConfirmDialog = $state(false);

  function askConfirmation() {
    showConfirmDialog = true;
  }
</script>

{#if showConfirmDialog}
  <ConfirmDialog
    title="¿Eliminar archivo?"
    message="Esta acción no se puede deshacer"
    onConfirm={handleDelete}
    onCancel={() => showConfirmDialog = false}
  />
{/if}
```

### Validación Inline

```svelte
<script>
  let error = $state<string | null>(null);
</script>

<input type="text" bind:value={cuit} />
{#if error}
  <p class="error-message">{error}</p>
{/if}
```

### Mensajes de Estado en la UI

```svelte
{#if loading}
  <LoadingSpinner />
{:else if error}
  <ErrorBanner message={error} />
{:else if success}
  <SuccessBanner message="Operación completada" />
{/if}
```

---

## 📋 Checklist Antes de Commitear

- [ ] ¿Hay algún `alert()`, `confirm()` o `prompt()`? → ELIMINAR
- [ ] ¿Los errores se muestran inline o con toast?
- [ ] ¿Las confirmaciones usan modals personalizados?
- [ ] ¿El feedback es no-intrusivo?
- [ ] ¿El usuario puede seguir usando la app mientras se muestra el mensaje?

---

## 🎯 Ejemplos del Mundo Real

### ❌ MAL (Como NO hacerlo)

```javascript
// Subir archivo
const response = await uploadFile(file);
if (response.success) {
  alert('✅ Archivo subido'); // ← HORROR
} else {
  alert('❌ Error: ' + response.error); // ← PEOR TODAVÍA
}
```

### ✅ BIEN (Como SÍ hacerlo)

```javascript
// Subir archivo
let uploadStatus = $state<'idle' | 'loading' | 'success' | 'error'>('idle');
let message = $state('');

async function uploadFile(file) {
  uploadStatus = 'loading';
  try {
    const response = await api.upload(file);
    uploadStatus = 'success';
    message = 'Archivo subido correctamente';
    toast.success(message);

    // Auto-ocultar después de 3s
    setTimeout(() => uploadStatus = 'idle', 3000);
  } catch (err) {
    uploadStatus = 'error';
    message = err.message;
    // Error persiste hasta que el usuario lo cierre
  }
}
```

---

## 🛠️ Herramientas Recomendadas

### Para este proyecto (Svelte 5)

1. **Sistema de Toast propio** (lo vamos a implementar)
2. **Componentes de Modal/Dialog reutilizables**
3. **Estados de UI reactivos** ($state, $derived)

### Alternativas (librerías existentes)

Si querés usar una librería:
- `svelte-sonner` - Toast notifications modernas
- `svelte-french-toast` - Otra opción de toasts
- `@melt-ui/svelte` - Componentes headless (incluye Dialog)

---

## 📖 Filosofía de UX

> **"La UI moderna no interrumpe, informa"**

- Los mensajes deben ser **no-intrusivos**
- El usuario debe mantener **control total**
- El feedback debe ser **contextual** (cerca de donde ocurrió la acción)
- Los errores deben ser **accionables** (decir qué hacer para resolverlos)

---

## 🚨 Si encontrás un `alert()` en el código

1. **Parar todo**
2. **Abrir un issue** o arreglarlo inmediatamente
3. **Reemplazarlo** por el patrón correcto
4. **Agregar un test** para que no vuelva a pasar

---

## 💡 Regla de Oro

> **Si estás por escribir `alert()`, pensá en cómo lo harías en una app moderna que usás todos los días (Gmail, Slack, Notion, etc.). Ninguna usa `alert()`. Nosotros tampoco.**

---

---

## 🧭 Navigation & Layout
- Sidebar expandida por defecto (desktop-first), persistente entre rutas.
- Rutas limpias: `/importar`, `/revisar`, `/facturas`, `/sync` (baja prioridad), `/anotar/[id]` (baja prioridad).
- Evitar navegación por tabs dentro de una sola página; usar rutas SvelteKit.
- Topbar minimal con espacio para buscador global.
- Contenedores full-width; evitar `max-width: 1200px` heredado.

## 📥 Importación y 📑 Revisión
- Entrada única en `/importar` con dropzone unificada.
- Detección por tipo:
  - Excel/CSV → importar y procesar inmediatamente (crea batch; clave: CUIT, tipo, PV, número).
  - PDFs/Imágenes → subir solamente; no procesar automáticamente.
- Procesamiento manual en `/revisar`:
  - Listar `pending_files` y acción por ítem “Procesar”.
  - Calcular hash de contenido (SHA-256) si falta; mostrar hash corto.
  - Preview y sugerencias desde reporte fisco con scores; indicar origen (OCR vs PDF_TEXT).
  - Acciones: aplicar sugerencia, editar manual, descartar.

## 🔐 Hashing y 🏷️ Naming
- Guardar SHA-256 completo en DB; mostrar hash corto (8–10 chars) en la UI.
- Dedupe por contenido (hash), no por nombre: avisar y permitir sobrescribir o descartar.
- Export/nombre: `processed/yyyy-mm/Alias CUIT YYYY-MM-DD Tipo PV Numero [cat].pdf`
  - Alias (emisor corto), CUIT, fecha emisión (`YYYY-MM-DD`).
  - Tipo: `FACA` | `NCRA` | `NDDA`.
  - PV: padded a 5; Número: padded a 8; categoría entre corchetes.
- Colisiones: resolver con sufijo o hash corto.

## 🔎 Buscador Global
- Input en topbar para facturas procesadas.
- Filtros: texto libre (alias, CUIT, tipo, categoría), rango de fechas, rango de montos.
- Resultados con acciones rápidas (ver, abrir archivo, copiar hash corto).

## ♿ Accesibilidad y Feedback
- Sin `alert`, `confirm`, `prompt`.
- Toasts para feedback no intrusivo; dialogs para confirmaciones.
- ARIA y navegación por teclado correctos (Melt UI builders).
- Validación inline en formularios.

## 🎨 Styling
- CSS vanilla con tokens compartidos (colores, espaciado, tipografía) y estilos por componente.
- Consistencia en espaciado y escala tipográfica; evitar valores hardcoded repetidos.
- Desktop-first; mobile fuera de alcance por ahora.

## 🧩 Librería de Componentes
- Adoptar Melt UI (builders ≈ composables de Vue) para componentes headless accesibles.
- Primitives en `client/src/lib/components/ui`: Button, Input, Dialog, Tabs, Badge, Modal.
- Reutilizar `FilePreview` y `RevisionTable`; dividir vistas grandes en piezas pequeñas.

---

Última actualización: 2025-12-13
**Estas pautas son no negociables en el proyecto.**
