# 📄 Procesador Inteligente de Facturas

Sistema automatizado para procesamiento, extracción y gestión de facturas argentinas con reconocimiento OCR y aprendizaje de patrones.

## 🎯 Descripción

Este proyecto permite procesar facturas en diversos formatos (imágenes, PDFs digitales, PDFs escaneados) extrayendo automáticamente información clave como CUIT, razón social, fecha, número de comprobante y totales. Utiliza un sistema de **templates reutilizables** que aprende los formatos de facturación de cada emisor, permitiendo automatización incremental.

## ✨ Características Principales

- ✅ **Multi-formato**: Soporta JPG, PNG, TIF, HEIF, PDF (digital y escaneado)
- 🧠 **Templates Inteligentes**: Aprende formatos de facturación y los reutiliza entre emisores
- 🔍 **OCR Avanzado**: Reconocimiento óptico de caracteres con Tesseract.js
- ✔️ **Validación CUIT**: Algoritmo módulo 11 para validar CUITs argentinos
- 📊 **Base de Datos**: SQLite con modelo relacional normalizado
- 📤 **Exportación**: CSV y Excel listos para análisis
- 🔎 **Búsqueda Avanzada**: Por CUIT, fecha, monto, número de comprobante
- 📁 **Organización**: Renombrado automático y archivado estructurado

## 🏗️ Arquitectura

### Stack Tecnológico

- **Runtime**: Node.js 18+
- **Lenguaje**: TypeScript
- **Base de Datos**: SQLite (better-sqlite3)
- **OCR**: Tesseract.js
- **PDFs**: pdf-parse, pdf-lib
- **Imágenes**: sharp
- **CLI**: commander
- **Exportación**: xlsx

### Estructura del Proyecto

```
simple-procesador-facturas/
├── src/
│   ├── scanner/              # Escaneo de directorios de entrada
│   ├── readers/              # Lectores por tipo de archivo
│   ├── extractors/           # Extractores de información (OCR, regex)
│   ├── templates/            # Motor de templates
│   ├── database/             # Capa de acceso a datos
│   ├── validators/           # Validación de CUIT y otros datos
│   ├── exporters/            # Exportadores (CSV, Excel)
│   ├── storage/              # Gestión de archivos procesados
│   ├── cli/                  # Comandos CLI
│   └── main.ts               # Punto de entrada
├── data/
│   ├── input/                # Facturas a procesar (entrada)
│   ├── processed/            # Facturas ya procesadas
│   └── database.sqlite       # Base de datos SQLite
├── exports/                  # Archivos CSV/Excel generados
├── tests/                    # Tests unitarios e integración
├── docs/                     # Documentación adicional
└── config.json               # Configuración del sistema
```

## 📊 Modelo de Datos

### Concepto Clave: Templates Reutilizables

El sistema separa el **formato de extracción** (template) de la **entidad emisora**. Múltiples emisores pueden compartir el mismo template si usan el mismo software de facturación (Bejerman, Tango, SAP, facturas electrónicas AFIP, etc.).

```
Templates de Extracción (formatos genéricos)
    ↓ son usados por
Múltiples Emisores
    ↓ emiten
Facturas
```

### Tablas Principales

#### `templates_extraccion`
Define cómo extraer información de un formato específico de factura.

```sql
- id: Identificador único
- nombre: "Bejerman v2.1", "AFIP Factura Electrónica A"
- categoria: SOFTWARE_COMERCIAL | AFIP_ELECTRONICA | MANUAL | GENERICO
- tipo_documento: PDF_DIGITAL | PDF_IMAGEN | IMAGEN
- estrategia: REGEX | OCR_ZONES | PDF_TEXT | HYBRID
- config_extraccion: JSON con patrones y coordenadas
- confianza_promedio: 0-100
- emisores_usando: Contador de emisores que usan este template
- facturas_procesadas: Total de facturas procesadas con este template
```

#### `emisores`
Empresas o personas que emiten facturas.

```sql
- cuit: Clave primaria (formato: XX-XXXXXXXX-X)
- cuit_numerico: Sin guiones para búsquedas
- nombre: Nombre comercial
- razon_social: Razón social oficial
- template_preferido_id: FK a templates_extraccion
- config_override: JSON con ajustes específicos del emisor
- tipo_persona: FISICA | JURIDICA
```

#### `facturas`
Comprobantes procesados.

```sql
- id: Identificador único
- emisor_cuit: FK a emisores
- template_usado_id: FK a templates_extraccion
- fecha_emision: Fecha del comprobante
- tipo_comprobante: A, B, C, X, etc.
- punto_venta: 4 dígitos
- numero_comprobante: 8 dígitos
- comprobante_completo: "A-0001-00000123"
- total: Importe total
- archivo_original: Nombre del archivo original
- archivo_procesado: Path al archivo renombrado
- confianza_extraccion: 0-100
- validado_manualmente: Boolean
```

#### `emisor_templates_historial`
Tracking de qué templates se probaron para cada emisor y sus tasas de éxito.

```sql
- emisor_cuit: FK a emisores
- template_id: FK a templates_extraccion
- intentos: Cantidad de veces que se probó
- exitos: Cantidad de extracciones exitosas
- tasa_exito: Porcentaje calculado
```

### Ejemplo de config_extraccion

**Para PDFs digitales:**
```json
{
  "tipo": "PDF_DIGITAL",
  "patrones": {
    "cuit": {
      "regex": "CUIT[:\\s]*(\\d{2}-\\d{8}-\\d)",
      "flags": "i",
      "confianza": 95
    },
    "fecha": {
      "regex": "Fecha[:\\s]*(\\d{2}/\\d{2}/\\d{4})",
      "formato": "DD/MM/YYYY"
    },
    "comprobante": {
      "regex": "([A-C])\\s*-?\\s*(\\d{4})\\s*-?\\s*(\\d{8})",
      "grupos": ["tipo", "punto_venta", "numero"]
    },
    "total": {
      "regex": "Total[:\\s]*\\$?\\s*([\\d,.]+)"
    }
  }
}
```

**Para imágenes con OCR:**
```json
{
  "tipo": "OCR_ZONES",
  "zonas": {
    "cuit": {
      "x": 50, "y": 10, "width": 200, "height": 30,
      "preproceso": ["binarize", "denoise"],
      "regex_validacion": "\\d{2}-\\d{8}-\\d"
    },
    "fecha": {
      "x": 400, "y": 10, "width": 150, "height": 30,
      "formato_esperado": "DD/MM/YYYY"
    },
    "total": {
      "x": 400, "y": 700, "width": 150, "height": 40,
      "keywords": ["TOTAL", "IMPORTE"],
      "busqueda": "bottom_right"
    }
  },
  "resolucion_dpi": 300,
  "idioma_ocr": "spa"
}
```

## 🔄 Flujo de Trabajo

### Procesamiento Automático

1. **Escaneo**: El sistema lee archivos del directorio `data/input/`
2. **Detección de tipo**: Identifica si es imagen, PDF digital o PDF escaneado
3. **Extracción inicial**: Intenta detectar el CUIT del emisor
4. **Búsqueda de emisor**: Consulta si el emisor ya existe en la base de datos
5. **Selección de template**:
   - Si el emisor tiene template preferido → lo usa
   - Si no, prueba templates por orden de confianza
   - Si ninguno funciona, usa extracción genérica
6. **Extracción de datos**: Aplica el template seleccionado
7. **Validación**: Valida CUIT (módulo 11), formato de fecha, etc.
8. **Almacenamiento**: Guarda en base de datos
9. **Renombrado**: `{CUIT}_{FECHA}_{TIPO}-{PV}-{NUM}.{ext}`
10. **Archivado**: Mueve de `input/` a `processed/`
11. **Actualización de estadísticas**: Incrementa contadores de template y emisor

### Aprendizaje Continuo

- Cada extracción exitosa incrementa la confianza del template
- Si un template falla, se prueban otros automáticamente
- El historial permite identificar cuál template funciona mejor para cada emisor
- Los usuarios pueden corregir manualmente y el sistema aprende de esas correcciones

## 🚀 Uso

### Instalación

```bash
# Clonar repositorio
git clone https://github.com/genuinefafa/simple-procesador-facturas.git
cd simple-procesador-facturas

# Instalar dependencias
npm install

# Compilar
npm run build

# Inicializar base de datos
npm run db:init
```

### Comandos CLI

```bash
# Procesar un archivo individual
procesador process --file data/input/factura.pdf

# Procesar todo el directorio input
procesador process --batch

# Listar facturas
procesador list

# Buscar facturas
procesador search --cuit 30-71057829-6
procesador search --fecha-desde 2025-01-01 --fecha-hasta 2025-12-31
procesador search --comprobante "A-0001-00000123"
procesador search --emisor "Empresa%"

# Exportar a Excel
procesador export --format xlsx --output reporte.xlsx
procesador export --format csv --emisor 30-71057829-6 --output emisor.csv

# Gestión de templates
procesador templates list
procesador templates show --id 5
procesador templates create --nombre "Mi Template" --tipo PDF_DIGITAL
procesador templates test --id 5 --file test.pdf
procesador templates stats --id 5

# Gestión de emisores
procesador emisores list
procesador emisores show --cuit 30-71057829-6
procesador emisores set-template --cuit 30-71057829-6 --template-id 5
procesador emisores history --cuit 30-71057829-6

# Ver estadísticas generales
procesador stats
```

## 🧪 Validación de CUIT

El sistema implementa el **algoritmo módulo 11** para validar CUITs argentinos:

```typescript
// Ejemplo de uso
validarCUIT("30-71057829-6")  // ✅ true
validarCUIT("30-71057829-5")  // ❌ false (DV incorrecto)

// Normalización automática
normalizarCUIT("30710578296")  // "30-71057829-6"
```

### Algoritmo

1. Se multiplican los primeros 10 dígitos por: `[5, 4, 3, 2, 7, 6, 5, 4, 3, 2]`
2. Se suman los resultados
3. Se calcula el resto de dividir por 11
4. El dígito verificador es: `11 - resto`
   - Si el resultado es 11 → DV = 0
   - Si el resultado es 10 → DV = 9
   - Caso contrario → DV = resultado

## 📁 Nomenclatura de Archivos

Los archivos procesados se renombran siguiendo este patrón:

```
{CUIT_SIN_GUIONES}_{FECHA_YYYYMMDD}_{TIPO}-{PV}-{NUM}.{extension}

Ejemplos:
30710578296_20251112_A-0001-00000123.pdf
27123456789_20251015_B-0003-00005678.jpg
33987654321_20250820_C-0002-00000045.pdf
```

Este formato permite:
- ✅ Búsqueda rápida por nombre de archivo
- ✅ Ordenamiento cronológico automático
- ✅ Identificación única del comprobante
- ✅ Compatibilidad con sistemas de archivos

## 📤 Exportación

### Formato Excel

Genera un archivo `.xlsx` con las siguientes columnas:

| CUIT Emisor | Razón Social | Fecha | Tipo | Punto Venta | Número | Comprobante | Total | Moneda | Archivo | Confianza |
|-------------|--------------|-------|------|-------------|--------|-------------|-------|--------|---------|-----------|

### Formato CSV

Mismo esquema que Excel, delimitado por comas, codificación UTF-8 con BOM para compatibilidad con Excel.

## 🔧 Configuración

### config.json

```json
{
  "directories": {
    "input": "./data/input",
    "processed": "./data/processed",
    "exports": "./exports"
  },
  "database": {
    "path": "./data/database.sqlite"
  },
  "ocr": {
    "engine": "tesseract",
    "language": "spa",
    "dpi": 300
  },
  "processing": {
    "auto_process": false,
    "watch_directory": false,
    "confidence_threshold": 70,
    "require_manual_validation": true
  },
  "templates": {
    "auto_detect": true,
    "max_attempts": 5
  }
}
```

## 🧪 Testing

```bash
# Ejecutar todos los tests
npm test

# Tests unitarios
npm run test:unit

# Tests de integración
npm run test:integration

# Cobertura
npm run test:coverage
```

## 📚 Casos de Uso

### Caso 1: Contador que recibe facturas de clientes

- Clientes envían facturas por email (PDFs, fotos)
- El contador las guarda en `data/input/`
- El sistema las procesa automáticamente
- Exporta un Excel mensual para análisis contable

### Caso 2: Empresa que archiva sus gastos

- Empleados escanean tickets y facturas
- El sistema extrae información y organiza por proveedor
- Búsqueda rápida: "¿Cuánto gastamos en X proveedor este año?"
- Exporta para rendiciones de gastos

### Caso 3: Auditoría de comprobantes

- Importa miles de facturas históricas
- El sistema las procesa en batch
- Detecta duplicados automáticamente
- Genera reportes de totales por emisor y período

## 🛠️ Desarrollo

### Prerequisitos

- Node.js 18 o superior
- npm o yarn
- SQLite 3

### Setup de desarrollo

```bash
# Instalar dependencias
npm install

# Modo desarrollo (watch)
npm run dev

# Compilar TypeScript
npm run build

# Linter
npm run lint

# Formatear código
npm run format
```

### Estructura de código

```typescript
// Convención de comentarios: español
// Convención de código: inglés (por claridad técnica)

/**
 * Valida un CUIT argentino usando el algoritmo módulo 11
 * @param cuit - CUIT en formato XX-XXXXXXXX-X o XXXXXXXXXXX
 * @returns true si el CUIT es válido
 */
function validateCUIT(cuit: string): boolean {
  // ... implementación
}
```

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea un branch para tu feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -m 'Agrega nueva funcionalidad'`)
4. Push al branch (`git push origin feature/nueva-funcionalidad`)
5. Abre un Pull Request

## 📝 Licencia

Este proyecto está bajo la Licencia MIT. Ver archivo `LICENSE` para más detalles.

## 🐛 Reportar Bugs

Si encuentras un bug, por favor abre un issue en GitHub con:

- Descripción del problema
- Pasos para reproducir
- Comportamiento esperado vs. actual
- Screenshots si aplica
- Versión del sistema operativo y Node.js

## 📮 Contacto

- **Autor**: [Tu Nombre]
- **Email**: [tu-email@ejemplo.com]
- **GitHub**: [@genuinefafa](https://github.com/genuinefafa)

## 🙏 Agradecimientos

- [Tesseract.js](https://tesseract.projectnaptha.com/) - OCR engine
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - SQLite bindings
- [sharp](https://sharp.pixelplumbing.com/) - Procesamiento de imágenes
- [pdf-parse](https://www.npmjs.com/package/pdf-parse) - Extracción de texto de PDFs

## 📖 Documentación Adicional

- [ROADMAP.md](./ROADMAP.md) - Plan de desarrollo y fases del proyecto
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Guía para contribuidores
- [CHANGELOG.md](./CHANGELOG.md) - Historial de cambios

---

**Hecho con ❤️ en Argentina 🇦🇷**
