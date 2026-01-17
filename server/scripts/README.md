# Scripts de Utilidades

Scripts para gestión de la base de datos y tareas de mantenimiento.

## 🗄️ Gestión de Base de Datos

### Migraciones

Aplica las migraciones de Drizzle ORM para crear/actualizar el schema:

```bash
npm run db:migrate
```

Para generar una nueva migración después de cambiar el schema:

```bash
npm run db:generate
```

### Drizzle Studio (GUI)

Abre una interfaz web para explorar y editar datos:

```bash
npm run db:studio
```

### Poblar con Datos de Prueba

Inserta datos de ejemplo en la base de datos desde archivos JSON en `server/scripts/seed-data/`. Podés poblar todas las tablas o solo una específica:

```bash
# Poblar todas las tablas (default)
npm run db:seed

# Poblar solo una tabla específica
npm run db:seed categories   # Solo categorías
npm run db:seed templates     # Solo templates de extracción
npm run db:seed emisores      # Solo emisores de ejemplo
npm run db:seed facturas      # Solo facturas de prueba
```

**Estructura de datos de seed**:

Los datos de seed están organizados en `server/scripts/seed-data/`:
- `categories.example.json`, `templates.example.json`, `emisores.example.json`, `facturas.example.json`: Templates de ejemplo (subidos a repo)
- `categories.json`, `templates.json`, `emisores.json`, `facturas.json`: Datos reales (ignorados por git, creados localmente)

El script **auto-copia** los `.example.json` a `.json` la primera vez, así simplificamos la vida. Si querés customizar los datos:

```bash
# Editar directamente el archivo .json local (git lo ignorará)
nano server/scripts/seed-data/emisores.json
npm run db:seed emisores -- --force
```

Las tablas disponibles incluyen:
- **categories**: Categorías de gastos/ingresos (5 por defecto)
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

## 📁 Estructura

```
scripts/
├── migrate.ts                    # Ejecutar migraciones Drizzle
├── seed.ts                       # Datos de prueba
├── seed-data/                    # JSONs con datos de seed
├── test-extraction-accuracy.ts   # Tests de extracción
└── README.md                     # Este archivo
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

### Con Drizzle Studio:

```bash
npm run db:studio
# Abre http://local.drizzle.studio en el navegador
```

## 🧹 Limpieza

Para empezar de cero:

```bash
# Usar el script de reset (recomendado)
./scripts/reset-dev-env.sh

# O manualmente:
rm data/database.sqlite
npm run db:migrate
npm run db:seed  # Opcional
```
