# Configuración de Google Sheets + Drive

Esta guía te ayudará a configurar la integración con Google Sheets y Google Drive para el procesador de facturas.

## 📋 Requisitos previos

- Cuenta de Google (Gmail o Google Workspace)
- Acceso a [Google Cloud Console](https://console.cloud.google.com)
- Node.js y npm instalados

---

## 🚀 Paso 1: Crear proyecto en Google Cloud

1. Ve a [Google Cloud Console](https://console.cloud.google.com)
2. Crea un nuevo proyecto o selecciona uno existente
3. Anota el **Project ID** (lo necesitarás después)

---

## 🔌 Paso 2: Habilitar APIs necesarias

1. En Google Cloud Console, ve a **APIs & Services** → **Library**
2. Busca y habilita las siguientes APIs:
   - **Google Sheets API**
   - **Google Drive API**

Para cada una:
- Haz clic en el resultado
- Clic en **"Enable"** (Habilitar)
- Espera a que se active (tarda unos segundos)

---

## 🔑 Paso 3: Crear Service Account

Un Service Account es una cuenta de servicio que permite que tu aplicación acceda a Google APIs sin necesidad de autenticación manual.

### 3.1 Crear la cuenta

1. Ve a **APIs & Services** → **Credentials**
2. Clic en **"+ CREATE CREDENTIALS"** → **Service account**
3. Completa el formulario:
   - **Service account name**: `procesador-facturas-sa`
   - **Service account ID**: (se genera automáticamente)
   - **Description**: `Service account para procesador de facturas`
4. Clic en **"CREATE AND CONTINUE"**

### 3.2 Asignar permisos (opcional)

En esta pantalla puedes asignar roles. Para este proyecto, **puedes saltearlo** haciendo clic en **"CONTINUE"** y luego **"DONE"**.

### 3.3 Descargar credenciales JSON

1. En la lista de Service Accounts, haz clic en el que acabas de crear
2. Ve a la pestaña **"KEYS"**
3. Clic en **"ADD KEY"** → **"Create new key"**
4. Selecciona formato **JSON**
5. Clic en **"CREATE"**
6. Se descargará un archivo JSON (ej: `procesador-facturas-xxxxxx.json`)

### 3.4 Guardar credenciales

1. Renombra el archivo descargado a `google-credentials.json`
2. Cópialo a la raíz de este proyecto:
   ```bash
   cp ~/Downloads/procesador-facturas-xxxxxx.json ./google-credentials.json
   ```
3. **IMPORTANTE**: Agrega este archivo a `.gitignore` para no subirlo a Git:
   ```bash
   echo "google-credentials.json" >> .gitignore
   ```

---

## 📊 Paso 4: Crear Google Spreadsheet

1. Ve a [Google Sheets](https://docs.google.com/spreadsheets)
2. Crea una nueva hoja de cálculo: **"Procesador de Facturas"**
3. Crea 4 pestañas (sheets) con estos nombres exactos:
   - `Emisores`
   - `Facturas Procesadas`
   - `Facturas Esperadas AFIP`
   - `Logs de Procesamiento`

### 4.1 Obtener Spreadsheet ID

El ID del spreadsheet está en la URL:
```
https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit
                                        ^^^^^^^^^^^^^^^^^^
```

Ejemplo:
```
https://docs.google.com/spreadsheets/d/1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z/edit
```

El ID sería: `1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z`

Cópialo, lo necesitarás para el config.

### 4.2 Compartir con Service Account

**MUY IMPORTANTE**: Debes compartir el spreadsheet con el email del Service Account.

1. Abre el archivo `google-credentials.json`
2. Busca el campo `"client_email"`, algo como:
   ```json
   "client_email": "procesador-facturas-sa@tu-proyecto.iam.gserviceaccount.com"
   ```
3. En Google Sheets, clic en **"Share"** (Compartir)
4. Pega el email del service account
5. Dale permisos de **Editor**
6. **Desmarca** "Notify people" (para no enviar email)
7. Clic en **"Share"**

---

## 📁 Paso 5: Crear carpeta en Google Drive

1. Ve a [Google Drive](https://drive.google.com)
2. Crea una carpeta llamada **"Facturas"**
3. Haz clic derecho en la carpeta → **"Get link"** → **"Copy link"**
4. El link será algo como:
   ```
   https://drive.google.com/drive/folders/[FOLDER_ID]
                                           ^^^^^^^^^^^
   ```
5. Extrae el **FOLDER_ID** del link

### 5.1 Compartir carpeta con Service Account

Al igual que con el Spreadsheet:

1. Clic derecho en la carpeta **"Facturas"** → **"Share"**
2. Pega el email del service account (`client_email` del JSON)
3. Dale permisos de **Editor**
4. **Desmarca** "Notify people"
5. Clic en **"Share"**

---

## ⚙️ Paso 6: Configurar el proyecto

Edita el archivo `server/config.json` y reemplaza los valores:

```json
{
  "google": {
    "enabled": true,  // ← Cambia a true para activar
    "credentialsPath": "./google-credentials.json",
    "sheets": {
      "spreadsheetId": "PEGA_AQUI_TU_SPREADSHEET_ID"  // Del paso 4.1
    },
    "drive": {
      "rootFolderId": "PEGA_AQUI_TU_FOLDER_ID"  // Del paso 5
    }
  }
}
```

---

## 🧪 Paso 7: Probar la configuración

Ejecuta el script de prueba (próximamente):

```bash
npm run test:google
```

O desde Node.js REPL:

```javascript
const { GoogleAuthService } = require('./server/services/google/google-auth.service');
const { GoogleSheetsService } = require('./server/services/google/google-sheets.service');
const config = require('./server/config.json');

// Probar autenticación
const auth = GoogleAuthService.getInstance();
console.log('Service Account:', auth.getServiceAccountInfo());

// Probar inicialización de Sheets
const sheets = GoogleSheetsService.getInstance();
await sheets.initialize(config.google.sheets);
await sheets.initializeSheetsWithHeaders();
console.log('Stats:', await sheets.getStats());
```

Si todo funciona, verás:
```
✅ Google credentials found at: ./google-credentials.json
✅ Google Auth initialized successfully
✅ Google Sheets service initialized
✅ Headers agregados a sheet: Emisores
✅ Headers agregados a sheet: Facturas Procesadas
✅ Headers agregados a sheet: Facturas Esperadas AFIP
✅ Headers agregados a sheet: Logs de Procesamiento
```

---

## 🔒 Seguridad

### ⚠️ NUNCA subas `google-credentials.json` a Git

Este archivo contiene credenciales privadas. Si lo subes accidentalmente:

1. **Revoca la clave inmediatamente**:
   - Ve a Google Cloud Console → Service Accounts
   - Selecciona tu service account → Keys
   - Elimina la clave comprometida

2. **Genera una nueva clave** (Paso 3.3)

3. **Elimina el archivo del historial de Git**:
   ```bash
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch google-credentials.json" \
     --prune-empty --tag-name-filter cat -- --all
   ```

### Permisos mínimos

El Service Account solo necesita acceso a:
- El Spreadsheet específico (no a todos los sheets del usuario)
- La carpeta "Facturas" en Drive (no a todo el Drive)

Esto se logra compartiéndolo **solo** en esos recursos (pasos 4.2 y 5.1).

---

## 📖 Estructura de datos en Google Sheets

### Sheet: "Emisores"

| CUIT | CUIT Numérico | Nombre | Razón Social | Aliases (JSON) | Template Preferido | Tipo Persona | Total Facturas | Primera Factura | Última Factura |
|------|---------------|--------|--------------|----------------|-------------------|--------------|----------------|-----------------|----------------|

### Sheet: "Facturas Procesadas"

| ID | Emisor CUIT | Fecha Emisión | Tipo | PV | Número | Total | Moneda | Archivo Drive ID | Archivo Link | Tipo Archivo | Método Extracción | Confianza | Validado | Requiere Revisión | Hash | Procesado En |
|----|-------------|---------------|------|----|--------|-------|--------|------------------|--------------|--------------|-------------------|-----------|----------|-------------------|------|--------------|

### Sheet: "Facturas Esperadas AFIP"

| ID | Lote Importación | CUIT | Nombre Emisor | Fecha Emisión | Tipo | PV | Número | Total | CAE | Status | ID Factura Matched | Confianza Match | Notas |
|----|------------------|------|---------------|---------------|------|----|--------|-------|-----|--------|---------------------|-----------------|-------|

### Sheet: "Logs de Procesamiento"

| Timestamp | Tipo Evento | Archivo | CUIT | Status | Mensaje | Usuario |
|-----------|-------------|---------|------|--------|---------|---------|

---

## 🌐 Estructura de carpetas en Google Drive

```
📁 Facturas (rootFolderId)
  ├── 📁 20-12345678-9
  │   ├── 📁 originales
  │   │   └── 📄 factura_original_001.pdf
  │   └── 📁 procesados
  │       └── 📄 20-12345678-9_20231215_A-0001-00012345.pdf
  │
  └── 📁 27-98765432-1
      ├── 📁 originales
      └── 📁 procesados
```

Cada emisor (identificado por CUIT) tiene:
- **originales**: Archivos como fueron subidos
- **procesados**: Archivos renombrados con formato normalizado

---

## 🐛 Troubleshooting

### Error: "Service account not found"

- Verifica que el archivo `google-credentials.json` existe en la raíz del proyecto
- Verifica que la ruta en `config.json` es correcta

### Error: "The caller does not have permission"

- Asegúrate de haber compartido el Spreadsheet y la carpeta de Drive con el email del service account
- El email está en `google-credentials.json` → `client_email`

### Error: "Spreadsheet not found"

- Verifica que el `spreadsheetId` en `config.json` es correcto
- Copia el ID directamente de la URL del spreadsheet

### Los headers no se crean automáticamente

- Ejecuta manualmente:
  ```javascript
  const sheets = GoogleSheetsService.getInstance();
  await sheets.initializeSheetsWithHeaders();
  ```

---

## 📚 Recursos adicionales

- [Google Sheets API Documentation](https://developers.google.com/sheets/api)
- [Google Drive API Documentation](https://developers.google.com/drive/api/v3/about-sdk)
- [Service Accounts Overview](https://cloud.google.com/iam/docs/service-accounts)
- [googleapis Node.js Client](https://github.com/googleapis/google-api-nodejs-client)

---

## ✅ Checklist de configuración

- [ ] Proyecto creado en Google Cloud Console
- [ ] Google Sheets API habilitada
- [ ] Google Drive API habilitada
- [ ] Service Account creado
- [ ] Credenciales JSON descargadas y guardadas como `google-credentials.json`
- [ ] `google-credentials.json` agregado a `.gitignore`
- [ ] Spreadsheet creado con 4 sheets (Emisores, Facturas Procesadas, Facturas Esperadas AFIP, Logs)
- [ ] Spreadsheet compartido con service account (Editor)
- [ ] Spreadsheet ID copiado y pegado en `config.json`
- [ ] Carpeta "Facturas" creada en Google Drive
- [ ] Carpeta compartida con service account (Editor)
- [ ] Folder ID copiado y pegado en `config.json`
- [ ] `google.enabled` cambiado a `true` en `config.json`
- [ ] Configuración probada ejecutando script de prueba

---

**¿Listo?** Una vez completado el checklist, estás listo para usar Google Sheets + Drive como backend del procesador de facturas. 🎉
