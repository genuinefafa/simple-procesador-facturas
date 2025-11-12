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

Inserta datos de ejemplo (templates, emisores, facturas):

```bash
npm run db:seed
```

Esto crea:
- 3 templates de extracción
- 3 emisores de ejemplo
- 4 facturas de prueba

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
