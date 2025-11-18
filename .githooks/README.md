# Git Hooks

Este directorio contiene git hooks personalizados para validar código antes de commitear.

## Instalación

```bash
# Desde la raíz del proyecto
./.githooks/install.sh
```

O agregarlo al script de instalación inicial:

```bash
npm install
./.githooks/install.sh
```

## Hooks disponibles

### `pre-commit`

Validación automática antes de cada commit:

✅ **Sintaxis básica de Svelte:**
- Detecta errores comunes como `</div}` en lugar de `</div>`
- Detecta bloques `{/if}` mal formados

✅ **Type checking (opcional):**
- Ejecuta `svelte-check` en archivos `.svelte` modificados
- Si hay errores, pregunta si querés commitear igual

### ¿Cómo funciona?

1. Al hacer `git commit`, el hook se ejecuta automáticamente
2. Valida solo los archivos `.svelte` en staging
3. Si encuentra errores de sintaxis, **bloquea el commit**
4. Si encuentra errores de tipos, **pregunta** si querés continuar

### Ejemplo de salida

```
🔍 Validando archivos Svelte...
📝 Archivos a validar:
  - client/src/routes/+page.svelte

🔎 Verificando sintaxis básica...
❌ Error en client/src/routes/+page.svelte: etiqueta de cierre con } en lugar de >
260:					</div}

❌ Se encontraron 1 error(es) de sintaxis.
   Por favor, corregalos antes de commitear.
```

## Desinstalar

Si querés deshabilitar los hooks temporalmente:

```bash
# Mover el hook
mv .git/hooks/pre-commit .git/hooks/pre-commit.disabled

# O eliminar el symlink
rm .git/hooks/pre-commit
```

## Notas

- Los hooks NO se versionan en git (están en `.git/hooks/`)
- Por eso los guardamos en `.githooks/` y creamos symlinks
- Cada desarrollador debe instalarlos con `install.sh`
