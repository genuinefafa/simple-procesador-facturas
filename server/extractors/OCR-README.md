# OCR para PDFs Escaneados

## Estado Actual

El OCRExtractor soporta:

✅ **Imágenes directas**: JPG, PNG, TIFF, WEBP, HEIC
✅ **PDFs escaneados**: Conversión automática con `pdf-to-img`
✅ **Sin dependencias del sistema**: Funciona en Linux, macOS y Windows

## Cómo Funciona

El OCRExtractor usa `pdf-to-img` para convertir PDFs a imágenes antes de aplicar Tesseract OCR.

**No requiere dependencias del sistema** como Cairo, Pango, Canvas nativo, etc.

## Instalación

Ya está todo instalado. No necesitás hacer nada adicional. 🎉

```bash
npm install  # Ya incluye pdf-to-img y tesseract.js
```

## Flujo de Procesamiento

```
Subir archivo
    ↓
¿Es PDF?
    ├── Sí → Extraer texto con pdf-parse
    │        ↓
    │   ¿Tiene < 100 chars?
    │        ├── Sí → PDF_IMAGEN → Convertir a imagen con pdf-to-img → OCR
    │        └── No → PDF_DIGITAL → Usar texto extraído directamente
    │
    └── No → ¿Es imagen? → Sí → IMAGEN → OCR directo con Tesseract
```

## Tipos de Documentos

### 1. PDF Digital (con texto embebido)
- Se usa `pdf-parse` para extraer el texto directamente
- No requiere OCR ni conversión
- ✅ Rápido y preciso
- **Método de extracción**: `PDF_TEXT`

### 2. PDF Escaneado (imagen dentro del PDF)
- Se convierte el PDF a imagen con `pdf-to-img`
- Se aplica OCR con Tesseract.js
- ✅ Funciona automáticamente sin dependencias del sistema
- **Método de extracción**: `OCR`

### 3. Imagen Directa (JPG, PNG, TIFF, WEBP, HEIC)
- Se aplica OCR directamente con Tesseract.js
- Preprocesamiento con Sharp (escala de grises, normalización, enfoque)
- ✅ Funciona automáticamente
- **Método de extracción**: `OCR`

## Preprocesamiento de Imágenes

Antes de aplicar OCR, las imágenes pasan por un pipeline de preprocesamiento:

1. **Escala de grises**: Convertir a blanco y negro
2. **Normalización**: Ajustar contraste automáticamente
3. **Enfoque**: Mejorar definición de bordes (sharpen)
4. **Binarización**: Solo para TIFFs (threshold adaptativo)
5. **Escalado**: Si la imagen es muy pequeña, se escala 2x para mejor OCR

## Configuración de OCR

```typescript
const OCR_CONFIG = {
  language: 'spa',           // Español
  oem: Tesseract.OEM.LSTM_ONLY,  // Motor LSTM (más preciso)
  psm: Tesseract.PSM.AUTO,   // Detección automática de layout
};
```

## Formatos Soportados

| Formato | Extensión | OCR Directo | Requiere Conversión |
|---------|-----------|-------------|---------------------|
| PDF Digital | `.pdf` | No | No (usa pdf-parse) |
| PDF Escaneado | `.pdf` | No | Sí (pdf-to-img) |
| JPEG | `.jpg`, `.jpeg` | Sí | No |
| PNG | `.png` | Sí | No |
| TIFF | `.tif`, `.tiff` | Sí | No |
| WebP | `.webp` | Sí | No |
| HEIC | `.heic`, `.heif` | Sí | No |

## Rendimiento

- **PDF Digital**: ~100-200ms (extracción de texto)
- **PDF Escaneado**: ~3-5s (conversión + OCR)
- **Imagen Directa**: ~2-4s (preprocesamiento + OCR)

## Mejoras Futuras

- [ ] Soporte para múltiples páginas (actualmente solo procesa la primera)
- [ ] Detección automática de idioma
- [ ] OCR paralelo de múltiples archivos
- [ ] Cache de resultados OCR
- [ ] Mejora de preprocesamiento con deskew (rotación automática)

## Troubleshooting

### "OCR no pudo extraer texto suficiente"

**Causa**: El OCR no logró leer el documento.

**Soluciones**:
- Verificar que la imagen tenga buena resolución (mínimo 1000px)
- Verificar que el texto sea legible (no borroso)
- Probar con otra versión del documento
- Verificar que el idioma esté en español

### "Error ejecutando OCR"

**Causa**: Error interno de Tesseract.

**Soluciones**:
- Verificar que tesseract.js esté instalado: `npm list tesseract.js`
- Reinstalar: `npm install tesseract.js@latest`
- Verificar logs del servidor para más detalles

### Baja confianza en extracción (<50%)

**Causa**: El OCR funcionó pero los datos extraídos tienen baja certeza.

**Soluciones**:
- El archivo pasa automáticamente a revisión manual
- Podés editar los campos detectados en la interfaz
- Si la imagen es de baja calidad, considerar escanear nuevamente

## Ejemplos de Uso

### Procesar un PDF escaneado

```typescript
const ocrExtractor = new OCRExtractor();
const result = await ocrExtractor.extract('/path/to/factura-escaneada.pdf');

if (result.success) {
  console.log('CUIT:', result.data.cuit);
  console.log('Tipo:', result.data.invoiceType);
  console.log('Fecha:', result.data.date);
  console.log('Total:', result.data.total);
} else {
  console.log('Errores:', result.errors);
}
```

### Procesar una imagen directa

```typescript
const ocrExtractor = new OCRExtractor();
const result = await ocrExtractor.extract('/path/to/factura.jpg');
// Same as above
```

## Dependencias

```json
{
  "tesseract.js": "^5.1.1",   // Motor OCR
  "sharp": "^0.33.5",         // Preprocesamiento de imágenes
  "pdf-to-img": "^5.3.0"      // Conversión PDF → Imagen (sin deps del sistema)
}
```

## Contacto

Si tenés problemas con OCR, abrí un issue con:
- Tipo de archivo (PDF escaneado, imagen, etc.)
- Tamaño del archivo
- Logs del servidor
- Screenshot del documento (si es posible)
