# Directorio de Datos

Este directorio contiene todos los datos del procesador contable.

**⚠️ IMPORTANTE**: Este directorio está en `.gitignore` y NO se sube al repositorio para proteger información sensible.

## 📁 Estructura

```
data/
├── input/          # Facturas a procesar (PDFs, imágenes)
├── processed/      # Facturas ya procesadas y renombradas
├── backup/         # Respaldo de archivos originales (opcional)
└── database.sqlite # Base de datos SQLite
```

## 🚀 Uso

### 1. Agregar facturas para procesar

Colocá tus archivos de facturas en `data/input/`:

```bash
cp /ruta/a/factura.pdf data/input/
```

### 2. Procesar

```bash
npm run process
# o
procesador process --batch
```

### 3. Facturas procesadas

Las facturas procesadas se mueven automáticamente a `data/processed/` con nomenclatura normalizada:

```
30710578296_20251112_A-0001-00000123.pdf
27123456789_20251015_B-0003-00005678.jpg
```

## 🔒 Seguridad

- **NO** compartas este directorio
- **NO** subas la base de datos al repositorio
- Considerá encriptar este directorio si contiene información sensible
- Hacé backups regulares fuera del proyecto

## 🗄️ Base de Datos

El archivo `database.sqlite` contiene:

- Emisores (con CUITs y razones sociales)
- Facturas procesadas (con todos los campos extraídos)
- Templates de extracción
- Historial de procesamiento

Para explorar la base de datos:

```bash
# Con SQLite CLI
sqlite3 data/database.sqlite

# O usar la extensión de VS Code: alexcvzz.vscode-sqlite
```

## 📤 Exportación

Los datos se pueden exportar sin exponer archivos sensibles:

```bash
procesador export --format xlsx --output reporte.xlsx
```

Esto genera un Excel en `exports/` con los datos de las facturas (sin los archivos originales).
