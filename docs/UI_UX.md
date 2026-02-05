# UI/UX Guidelines

## Prohibiciones

### `alert()`, `confirm()`, `prompt()` - NUNCA

```javascript
// ❌ PROHIBIDO
alert('Operación exitosa');
confirm('¿Estás seguro?');
prompt('Ingrese un valor');
```

**Usar en su lugar:**
- **Toast notifications** (`svelte-sonner`) para mensajes informativos
- **Modals/Dialogs** (Melt UI) para confirmaciones
- **Inline validation** para formularios

---

## Prácticas Recomendadas

### Toast Notifications

```svelte
<script>
  import { toast } from 'svelte-sonner';

  function handleSuccess() {
    toast.success('Operación exitosa');
  }

  function handleError() {
    toast.error('Error al procesar');
  }
</script>
```

### Confirmaciones (Modals)

```svelte
<script>
  import { Dialog } from '$lib/components/ui';
  let showConfirmDialog = $state(false);
</script>

{#if showConfirmDialog}
  <Dialog
    title="¿Eliminar archivo?"
    onconfirm={handleDelete}
    oncancel={() => showConfirmDialog = false}
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

---

## Checklist Pre-Commit

- [ ] ¿Hay algún `alert()`, `confirm()` o `prompt()`? → ELIMINAR
- [ ] ¿Los errores se muestran inline o con toast?
- [ ] ¿Las confirmaciones usan Dialogs?
- [ ] ¿El feedback es no-intrusivo?

---

## Iconos

Usamos **lucide-svelte** para todos los iconos. Ver [ICONS.md](./ICONS.md) para la guía completa.

**Reglas rápidas:**
- Importar: `import { Check, X, Search } from '$lib/components/icons'`
- Tamaños estándar: xs (14px), sm (16px), md (20px), lg (24px)
- **NO usar**: emoji Unicode, HTML entities, strings como iconos

---

## Styling

- CSS vanilla con design tokens (`tokens.css`)
- Consistencia en espaciado y tipografía
- **NO** Tailwind, **NO** valores hardcoded
- Desktop-first (mobile fuera de alcance)

---

## Componentes con Labels Integrados

Algunos componentes ya incluyen su propio label. **NO agregar labels externos:**

```svelte
<!-- ❌ INCORRECTO - Label duplicado -->
<div class="field">
  <label>Emisor</label>
  <EmitterCombobox />  <!-- Ya tiene label interno -->
</div>

<!-- ✅ CORRECTO - Usar directamente -->
<EmitterCombobox />
```

**Componentes con label integrado:**
- `EmitterCombobox` - label "Emisor"

---

## Accesibilidad

- ARIA labels en elementos interactivos
- Navegación por teclado (Melt UI lo maneja)
- Focus visible en todos los controles
- Contraste suficiente en textos

---

## Filosofía

> **"La UI moderna no interrumpe, informa"**

- Mensajes **no-intrusivos**
- Usuario mantiene **control total**
- Feedback **contextual** (cerca de la acción)
- Errores **accionables** (qué hacer para resolver)

---

Última actualización: 2026-02-04
