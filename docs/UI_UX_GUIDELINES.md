# 🚫 UI/UX Guidelines - LO QUE NO SE DEBE HACER

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

Última actualización: 2025-11-20
**Esta es una regla no negociable del proyecto.**
