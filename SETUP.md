# Guía de Instalación - Procesador de Facturas

## Setup inicial

### 1. Instalar dependencias

```bash
# Dependencias del proyecto principal
npm install

# Dependencias de la interfaz web
cd web && npm install && cd ..
```

### 2. Migrar base de datos (IMPORTANTE)

Si ya tienes una base de datos existente con facturas procesadas, ejecuta la migración para agregar la tabla de zonas anotadas:

```bash
npm run db:migrate:zones
```

Deberías ver:
```
✅ Migración completada exitosamente
📋 Tabla creada: [ { name: 'facturas_zonas_anotadas' } ]
```

Esta migración es **idempotente** - puedes ejecutarla múltiples veces sin problemas.

## Uso

### CLI - Procesar facturas

```bash
# Procesar un archivo específico
npm run build
node dist/main.js process -f examples/factura4.pdf

# Procesar directorio completo
node dist/main.js process -d data/input

# Ver lista de facturas
node dist/main.js list

# Ver estadísticas
node dist/main.js stats
```

### Interfaz Web - Anotar facturas

```bash
# Iniciar servidor de desarrollo
npm run web:dev
```

Abre http://localhost:5173/ en tu navegador.

**Flujo de trabajo:**

1. **Ver facturas**: La página principal muestra todas las facturas procesadas
2. **Anotar**: Haz clic en "📝 Anotar" en cualquier factura
3. **Dibujar zonas**:
   - Selecciona el campo (CUIT, fecha, tipo, punto de venta, número, total)
   - Arrastra el mouse sobre la imagen para dibujar un rectángulo
   - Repite para todos los campos necesarios
4. **Guardar**: Haz clic en "💾 Guardar anotaciones"
   - Las zonas se guardan en la base de datos
   - La factura se marca como validada manualmente

## Estructura de archivos

```
simple-procesador-facturas/
├── data/
│   ├── database.sqlite      # Base de datos SQLite
│   ├── input/               # Facturas a procesar (PDFs)
│   └── processed/           # Facturas procesadas (renombradas)
├── examples/                # Ejemplos de facturas para testing
├── src/                     # Código fuente TypeScript
│   ├── cli/                # Comandos CLI
│   ├── database/           # Repositorios y schema
│   ├── extractors/         # Extractores PDF/OCR
│   └── utils/              # Utilidades
├── web/                     # Interfaz web SvelteKit
│   └── src/routes/
│       ├── +page.svelte           # Lista de facturas
│       ├── annotate/[id]/         # Herramienta de anotación
│       └── api/                   # API endpoints
└── scripts/
    └── migrate-zones.cjs    # Script de migración
```

## Troubleshooting

### Error "no such table: facturas_zonas_anotadas"

Ejecuta la migración:
```bash
npm run db:migrate:zones
```

### No veo facturas en la web

1. Verifica que procesaste facturas con el CLI
2. Verifica que la base de datos existe en `data/database.sqlite`
3. Verifica que las rutas en `originalFile` sean correctas

### Error al cargar imágenes/PDFs en anotación

Los archivos deben existir en las rutas guardadas en `originalFile`. Por defecto:
- PDFs procesados: `data/input/`
- Los archivos se sirven a través de `/api/files/[path]`

## Próximos pasos

- [ ] Implementar generación automática de templates desde anotaciones
- [ ] Agregar soporte para OCR en imágenes escaneadas
- [ ] Exportar datos a Excel/CSV
- [ ] Sistema de renombrado automático de archivos
