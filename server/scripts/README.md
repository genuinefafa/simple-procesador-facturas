# Scripts de Utilidades

Scripts para gestión de la base de datos y tareas de mantenimiento.

## 🗄️ Gestión de Base de Datos

### Inicializar Base de Datos

Crea el archivo `database.sqlite` y ejecuta el schema SQL completo:

```bash
npm run db:init
```

**⚠️ Importante**: No ejecutar si la base de datos ya existe. Si necesitás reiniciar:

```bash
rm data/database.sqlite
npm run db:init
```

### Poblar con Datos de Prueba

Inserta datos de ejemplo en la base de datos. Podés poblar todas las tablas o solo una específica:

```bash
# Poblar todas las tablas (default)
npm run db:seed

# Poblar solo una tabla específica
npm run db:seed categories   # Solo categorías desde categorias.json
npm run db:seed templates     # Solo templates de extracción
npm run db:seed emisores      # Solo emisores de ejemplo
npm run db:seed facturas      # Solo facturas de prueba
```

Las tablas disponibles incluyen:
- 3 templates de extracción
- 3 emisores de ejemplo
- 4 facturas de prueba
- **categories**: Carga desde `categorias.json` (usar `INSERT OR IGNORE`)
- **templates**: 3 templates de extracción (AFIP Electrónica A, PDF Genérico, OCR Genérico)
- **emisores**: 3 emisores de ejemplo (Servicios Tecnológicos SA, Distribuidora ABC, Consultora XYZ)
- **facturas**: 4 facturas de prueba

> **Nota**: El seeding usa `INSERT OR IGNORE`, por lo que ejecutar el comando múltiples veces no duplicará datos.

### Borrar datos antes de poblar (force)

Podés truncar la(s) tabla(s) seleccionadas antes de poblar usando `--force`:

```bash
# Forzar sobre una tabla
npm run db:seed facturas -- --force

# Forzar sobre todas
npm run db:seed -- --force
```

Esto ejecuta `DELETE FROM ...` y resetea el contador de `AUTOINCREMENT` (limpiando `sqlite_sequence`).

### Seleccionar tablas específicas (`--only`)

Podés elegir qué tablas poblar usando `--only` (override del argumento posicional):

```bash
npm run db:seed -- --only=templates,emisores
npm run db:seed categories -- --only=facturas   # `--only` tiene prioridad
```

### Simular acciones sin modificar (`--dry-run`)

Para verificar qué haría el script sin tocar la base:

```bash
npm run db:seed templates -- --dry-run
npm run db:seed -- --only=facturas --dry-run --force
```

El modo `--dry-run` muestra "Truncaría" y/o "Poblaría" según corresponda.

### Migraciones (futuro)

```bash
npm run db:migrate
```

_Nota: Sistema de migraciones versionadas se implementará en fases posteriores_

## 📁 Estructura

```
scripts/
├── init-db.ts      # Inicialización de base de datos
├── seed.ts         # Datos de prueba
└── migrate.ts      # Migraciones (futuro)
```

## 🛠️ Crear Nuevos Scripts

Para agregar un nuevo script:

1. Crear archivo TypeScript en `scripts/`
2. Usar imports ESM con `import`
3. Agregar comando en `package.json`:

```json
{
  "scripts": {
    "mi-script": "tsx scripts/mi-script.ts"
  }
}
```

## 🔍 Verificar Base de Datos

### Con SQLite CLI:

```bash
sqlite3 data/database.sqlite

# Ver tablas
.tables

# Ver schema de una tabla
.schema emisores

# Consultar datos
SELECT * FROM emisores;
```

### Con VS Code:

Instalar extensión: `alexcvzz.vscode-sqlite`

1. Cmd/Ctrl + Shift + P
2. "SQLite: Open Database"
3. Seleccionar `data/database.sqlite`

## 🧹 Limpieza

Para empezar de cero:

```bash
# Eliminar base de datos
rm data/database.sqlite

# Reinicializar
npm run db:init

# (Opcional) Poblar con datos de prueba
npm run db:seed
```
