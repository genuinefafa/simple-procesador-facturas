# Ejemplos y Datos de Prueba

Este directorio contiene recursos de ejemplo para testing y desarrollo del Procesador Contable.

## 📁 Estructura

```
examples/
└── facturas/          # Facturas argentinas de ejemplo
    ├── README.md      # Información sobre las facturas
    └── *.pdf          # 8 PDFs de facturas reales
```

## 🚀 Cómo Usar

### Para Testing Manual

1. Iniciar el servidor de desarrollo:
   ```bash
   npm run dev
   ```

2. Abrir la aplicación en el navegador (`http://localhost:5173`)

3. Ir a la pestaña "📤 1. Subir Archivos"

4. Arrastrar uno o más PDFs desde `examples/facturas/`

5. Probar el flujo completo:
   - Upload → Procesamiento automático
   - Ver en "Archivos Pendientes"
   - Editar datos manualmente si es necesario
   - Procesar y exportar

### Para Tests Automatizados

```typescript
// Usar en tests
const testInvoicePath = path.join(__dirname, '../examples/facturas/factura4.pdf');
```

## 📋 Casos de Prueba Sugeridos

### 1. Happy Path
- Usar `factura4.pdf` - suele tener formato estándar
- Verificar que se extraigan todos los campos correctamente
- Confirmar que se procese automáticamente

### 2. Extracción Parcial
- Probar con `facturamy.pdf` o `factura11643.pdf`
- Verificar que los datos parciales se muestren
- Editar manualmente y procesar

### 3. Batch Processing
- Seleccionar múltiples facturas
- Procesarlas en lote
- Verificar estadísticas (exitosas/fallidas)

### 4. Edge Cases
- Subir el mismo archivo dos veces (debería detectar duplicado)
- Intentar procesar sin completar campos obligatorios
- Eliminar archivo pendiente

## 🙏 Créditos

Las facturas de ejemplo provienen del repositorio [romo64/pfactura](https://github.com/romo64/pfactura).

## 📝 Agregar Más Ejemplos

Para agregar más facturas de ejemplo:

1. Colocar los PDFs en `examples/facturas/`
2. Actualizar el README en ese directorio
3. Commitear con mensaje descriptivo

---

**Nota:** Estos archivos son solo para propósitos de desarrollo y testing.
