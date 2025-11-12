# Configuración de VS Code

Esta carpeta contiene archivos de ejemplo para configurar VS Code para trabajar en este proyecto.

## 🚀 Uso

Para usar estas configuraciones, renombrá los archivos eliminando `.example`:

```bash
cp .vscode/settings.json.example .vscode/settings.json
cp .vscode/extensions.json.example .vscode/extensions.json
cp .vscode/launch.json.example .vscode/launch.json
```

Los archivos sin `.example` están en `.gitignore` para que puedas personalizarlos sin afectar al repositorio.

## 📦 Extensiones Recomendadas

Al abrir el proyecto, VS Code te sugerirá instalar las extensiones recomendadas:

- **ESLint**: Linting de código TypeScript
- **Prettier**: Formateo automático
- **Path Intellisense**: Autocompletado de rutas
- **Error Lens**: Muestra errores inline
- **Code Spell Checker**: Corrector ortográfico
- **Code Spell Checker Spanish**: Diccionario español
- **Todo Tree**: Vista de TODOs en el código
- **Markdown All in One**: Mejor experiencia con markdown
- **SQLite**: Explorador de base de datos

## 🐛 Configuraciones de Debug

### Debug: Procesar Factura
Ejecuta el procesamiento de un archivo de prueba. Ajustá la ruta del archivo en `launch.json`.

### Debug: Tests
Ejecuta los tests en modo debug.

### Debug: CLI Actual
Ejecuta cualquier comando CLI. Te pedirá los argumentos al iniciar.

## ⚙️ Configuración Personalizada

Podés editar `settings.json` para ajustar:

- Formateo automático al guardar
- Reglas de ESLint
- Exclusiones de búsqueda
- Asociaciones de archivos
