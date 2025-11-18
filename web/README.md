# Interfaz Web - Procesador de Facturas

Interfaz web para anotar y entrenar el sistema de extracción de facturas.

## Inicio rápido

Desde el directorio raíz del proyecto:

```bash
# Primera vez: instalar dependencias
cd web && npm install && cd ..

# Iniciar servidor de desarrollo
npm run web:dev
```

La aplicación estará disponible en http://localhost:5173/

## Funcionalidades

### Página principal (/)

- Lista de facturas pendientes de revisión
- Estadísticas de facturas con baja confianza
- Acceso rápido a la herramienta de anotación

### Herramienta de anotación (/annotate/[id])

Permite anotar visualmente las zonas de una factura para entrenar el sistema de extracción.

**Campos disponibles:**
- CUIT (rojo)
- Fecha (azul)
- Tipo de comprobante (morado)
- Punto de venta (verde)
- Número de comprobante (naranja)
- Total (rosa)

**Cómo usar:**
1. Selecciona el campo a anotar en el panel izquierdo
2. Arrastra el mouse sobre la imagen para dibujar un rectángulo en la zona correspondiente
3. Repite para todos los campos necesarios
4. Haz clic en "Guardar anotaciones"

**Características:**
- Soporte para PDFs e imágenes (JPG, PNG, TIF)
- Los PDFs se renderizan automáticamente en el navegador
- Las zonas se guardan con coordenadas absolutas del documento original
- Al guardar, la factura se marca como validada manualmente

## API Endpoints

- `GET /api/invoices/pending` - Lista de facturas pendientes
- `GET /api/invoices/[id]` - Detalle de una factura con zonas anotadas
- `GET /api/files/[...path]` - Servir archivos de facturas
- `POST /api/annotations` - Guardar anotaciones de zonas

## Desarrollo

```bash
# Verificar tipos
cd web && npm run check

# Construir para producción
npm run build

# Preview de producción
npm run preview
```

## Notas técnicas

- Las rutas de archivos se sirven a través de `/api/files/` con validación de seguridad
- PDF.js se usa para renderizar PDFs en canvas
- Las zonas se almacenan en la tabla `facturas_zonas_anotadas`
- Al guardar anotaciones, se eliminan las anteriores de esa factura
