# OCR para PDFs Escaneados

## Estado Actual

El OCRExtractor actualmente soporta:

✅ **Imágenes directas**: JPG, PNG, TIFF, WEBP, HEIC
❌ **PDFs escaneados**: Requiere dependencias adicionales (ver abajo)

## Problema

Para procesar PDFs escaneados con OCR, se necesita convertir el PDF a imagen primero. Esto requiere la librería `canvas` de Node.js, que a su vez requiere dependencias del sistema operativo.

## Solución 1: Instalar Dependencias del Sistema (Recomendado)

### Linux (Ubuntu/Debian)

```bash
# Instalar dependencias del sistema
sudo apt-get update
sudo apt-get install -y build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev

# Instalar canvas en el proyecto
cd server
npm install canvas
```

### macOS

```bash
# Instalar dependencias con Homebrew
brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman

# Instalar canvas en el proyecto
cd server
npm install canvas
```

### Windows

1. Descargar GTK+ desde: https://github.com/tschoonj/GTK-for-Windows-Runtime-Environment-Installer
2. Instalar GTK+
3. Reiniciar la terminal
4. Ejecutar:

```bash
cd server
npm install canvas
```

## Solución 2: Convertir PDFs a Imágenes Manualmente (Alternativa)

Si no podés instalar las dependencias, convertí los PDFs escaneados a imágenes antes de subirlos:

### Con ImageMagick

```bash
convert documento.pdf documento.jpg
```

### Con GIMP

1. Abrir el PDF en GIMP
2. Exportar como JPG o PNG

### Con herramientas online

- https://www.ilovepdf.com/pdf_to_jpg
- https://smallpdf.com/pdf-to-jpg

## Verificar Instalación

Para verificar que canvas está correctamente instalado:

```bash
cd server
node -e "const canvas = require('canvas'); console.log('✅ Canvas instalado correctamente')"
```

Si ves el mensaje de éxito, ya podés procesar PDFs escaneados con OCR.

## Cómo Funciona

1. **PDF Digital** (con texto embebido):
   - Se usa `pdf-parse` para extraer el texto directamente
   - No requiere OCR
   - ✅ Funciona sin dependencias adicionales

2. **PDF Escaneado** (imagen dentro del PDF):
   - Se convierte el PDF a imagen con `canvas`
   - Se aplica OCR con Tesseract.js
   - ❌ Requiere dependencias de canvas

3. **Imagen Directa** (JPG, PNG, etc.):
   - Se aplica OCR directamente con Tesseract.js
   - ✅ Funciona sin dependencias adicionales

## Flujo de Detección

```
Subir archivo
    ↓
¿Es PDF?
    ├── Sí → Extraer texto con pdf-parse
    │        ↓
    │   ¿Tiene < 100 chars?
    │        ├── Sí → PDF_IMAGEN → Intentar OCR con canvas
    │        └── No → PDF_DIGITAL → Usar texto extraído
    │
    └── No → ¿Es imagen? → Sí → IMAGEN → OCR directo
```

## Errores Comunes

### "No se pudo convertir PDF a imagen para OCR"

**Causa**: Intentaste procesar un PDF escaneado sin tener canvas instalado.

**Solución**: Instalar dependencias (ver arriba) o convertir el PDF a JPG/PNG manualmente.

### "gyp ERR! find Python"

**Causa**: canvas requiere Python para compilarse.

**Solución**:
- Linux: `sudo apt-get install python3`
- macOS: Ya viene con Python
- Windows: Instalar Python desde python.org

### "Package 'cairo' not found"

**Causa**: Falta la librería Cairo en el sistema.

**Solución**:
- Linux: `sudo apt-get install libcairo2-dev`
- macOS: `brew install cairo`

## Contacto

Si tenés problemas con la instalación, abrí un issue en el repositorio con:
- Sistema operativo y versión
- Logs del error
- Output de `npm install canvas`
