# Scripts de utilidad

Esta carpeta contiene scripts útiles para el mantenimiento y configuración del proyecto.

## test-google-config.ts

Script para verificar la configuración de Google Sheets + Drive.

**Uso:**
```bash
npm run test:google
```

**Verifica:**
- ✅ Configuración en `config.json`
- ✅ Credenciales de Google Cloud
- ✅ Autenticación con Google APIs
- ✅ Conexión a Google Sheets
- ✅ Conexión a Google Drive
- ✅ Inicialización de servicios

**Salida esperada:**
```
🚀 Test de configuración de Google Sheets + Drive

📋 1. Verificando config.json...
✅ Configuración "google" encontrada
✅ Google integration habilitada
✅ Spreadsheet ID configurado
✅ Root Folder ID configurado

🔑 2. Verificando credenciales de Google...
✅ Archivo de credenciales encontrado
✅ Service Account Email: xxx@xxx.iam.gserviceaccount.com

🔐 3. Probando autenticación...
✅ Autenticación exitosa

📊 4. Probando conexión a Google Sheets...
✅ Conexión a Google Sheets exitosa
ℹ️  Estadísticas:
   - Emisores: 0
   - Facturas: 0
   - Esperadas: 0

📁 5. Probando conexión a Google Drive...
✅ Conexión a Google Drive exitosa

🔗 6. Probando servicio de integración...
✅ Servicio de integración inicializado

============================================================
📋 RESUMEN
============================================================
✅ ¡Configuración perfecta! Todos los tests pasaron.
🚀 Estás listo para usar Google Sheets + Drive.
```

**Si hay errores:**
El script te indicará qué falta y cómo solucionarlo. Ver `GOOGLE_SETUP.md` para instrucciones detalladas.
