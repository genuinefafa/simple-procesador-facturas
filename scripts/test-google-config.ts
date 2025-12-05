#!/usr/bin/env ts-node
/**
 * Script para verificar la configuración de Google
 * Uso: npm run test:google
 */

import { GoogleAuthService, isGoogleConfigured } from '../server/services/google/google-auth.service';
import { GoogleSheetsService } from '../server/services/google/google-sheets.service';
import { GoogleDriveService } from '../server/services/google/google-drive.service';
import { GoogleIntegrationService } from '../server/services/google/google-integration.service';
import * as config from '../server/config.json';
import * as fs from 'fs';

const EMOJI = {
  SUCCESS: '✅',
  ERROR: '❌',
  WARNING: '⚠️ ',
  INFO: 'ℹ️ ',
  ROCKET: '🚀',
  LOCK: '🔒',
};

console.log(`${EMOJI.ROCKET} Test de configuración de Google Sheets + Drive\n`);

async function testGoogleConfiguration() {
  let errors = 0;
  let warnings = 0;

  // ========== 1. Verificar config.json ==========
  console.log('📋 1. Verificando config.json...');

  if (!config.google) {
    console.log(`${EMOJI.ERROR} Falta configuración "google" en config.json`);
    errors++;
  } else {
    console.log(`${EMOJI.SUCCESS} Configuración "google" encontrada`);

    if (!config.google.enabled) {
      console.log(`${EMOJI.WARNING} Google integration está deshabilitada (enabled: false)`);
      warnings++;
    } else {
      console.log(`${EMOJI.SUCCESS} Google integration habilitada`);
    }

    if (!config.google.sheets?.spreadsheetId || config.google.sheets.spreadsheetId === 'REPLACE_WITH_YOUR_SPREADSHEET_ID') {
      console.log(`${EMOJI.ERROR} Falta configurar spreadsheetId en config.json`);
      errors++;
    } else {
      console.log(`${EMOJI.SUCCESS} Spreadsheet ID configurado: ${config.google.sheets.spreadsheetId.substring(0, 20)}...`);
    }

    if (!config.google.drive?.rootFolderId || config.google.drive.rootFolderId === 'REPLACE_WITH_YOUR_ROOT_FOLDER_ID') {
      console.log(`${EMOJI.ERROR} Falta configurar rootFolderId en config.json`);
      errors++;
    } else {
      console.log(`${EMOJI.SUCCESS} Root Folder ID configurado: ${config.google.drive.rootFolderId.substring(0, 20)}...`);
    }
  }

  console.log();

  // ========== 2. Verificar credenciales ==========
  console.log('🔑 2. Verificando credenciales de Google...');

  const credentialsPath = config.google?.credentialsPath || './google-credentials.json';

  if (!fs.existsSync(credentialsPath)) {
    console.log(`${EMOJI.ERROR} Archivo de credenciales no encontrado: ${credentialsPath}`);
    console.log(`${EMOJI.INFO} Descarga las credenciales desde Google Cloud Console`);
    console.log(`${EMOJI.INFO} Ver: GOOGLE_SETUP.md para instrucciones`);
    errors++;
  } else {
    console.log(`${EMOJI.SUCCESS} Archivo de credenciales encontrado: ${credentialsPath}`);

    try {
      const creds = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));

      if (!creds.client_email || !creds.private_key) {
        console.log(`${EMOJI.ERROR} Credenciales inválidas (faltan client_email o private_key)`);
        errors++;
      } else {
        console.log(`${EMOJI.SUCCESS} Service Account Email: ${creds.client_email}`);
        console.log(`${EMOJI.INFO} Project ID: ${creds.project_id}`);
      }
    } catch (error) {
      console.log(`${EMOJI.ERROR} Error leyendo credenciales: ${error}`);
      errors++;
    }
  }

  console.log();

  // ========== 3. Test de autenticación ==========
  console.log('🔐 3. Probando autenticación...');

  if (!isGoogleConfigured()) {
    console.log(`${EMOJI.ERROR} No se puede autenticar (credenciales no configuradas)`);
    errors++;
  } else {
    try {
      const authService = GoogleAuthService.getInstance();
      const auth = await authService.getAuthClient();

      console.log(`${EMOJI.SUCCESS} Autenticación exitosa`);
      const info = authService.getServiceAccountInfo();
      if (info) {
        console.log(`${EMOJI.INFO} Autenticado como: ${info.email}`);
      }
    } catch (error) {
      console.log(`${EMOJI.ERROR} Error de autenticación: ${error}`);
      errors++;
    }
  }

  console.log();

  // ========== 4. Test de Google Sheets ==========
  if (!errors && config.google.enabled) {
    console.log('📊 4. Probando conexión a Google Sheets...');

    try {
      const sheetsService = GoogleSheetsService.getInstance();
      await sheetsService.initialize(config.google.sheets);

      // Intentar inicializar headers
      await sheetsService.initializeSheetsWithHeaders();

      console.log(`${EMOJI.SUCCESS} Conexión a Google Sheets exitosa`);

      // Obtener estadísticas
      const stats = await sheetsService.getStats();
      console.log(`${EMOJI.INFO} Estadísticas:`);
      console.log(`   - Emisores: ${stats.totalEmisores}`);
      console.log(`   - Facturas: ${stats.totalFacturas}`);
      console.log(`   - Esperadas: ${stats.totalEsperadas} (${stats.esperadasPendientes} pendientes, ${stats.esperadasMatched} matched)`);
    } catch (error: any) {
      console.log(`${EMOJI.ERROR} Error conectando a Google Sheets: ${error.message}`);

      if (error.message.includes('permission')) {
        console.log(`${EMOJI.INFO} SOLUCIÓN: Comparte el Spreadsheet con el service account email`);
        console.log(`${EMOJI.INFO} Ver: GOOGLE_SETUP.md sección 4.2`);
      }

      errors++;
    }

    console.log();

    // ========== 5. Test de Google Drive ==========
    console.log('📁 5. Probando conexión a Google Drive...');

    try {
      const driveService = GoogleDriveService.getInstance();
      await driveService.initialize(config.google.drive);

      await driveService.initializeFolderStructure();

      console.log(`${EMOJI.SUCCESS} Conexión a Google Drive exitosa`);
      console.log(`${EMOJI.INFO} Root Folder ID: ${config.google.drive.rootFolderId}`);
    } catch (error: any) {
      console.log(`${EMOJI.ERROR} Error conectando a Google Drive: ${error.message}`);

      if (error.message.includes('not found')) {
        console.log(`${EMOJI.INFO} SOLUCIÓN: Verifica que el rootFolderId en config.json es correcto`);
        console.log(`${EMOJI.INFO} SOLUCIÓN: Comparte la carpeta con el service account email`);
        console.log(`${EMOJI.INFO} Ver: GOOGLE_SETUP.md sección 5.1`);
      }

      errors++;
    }

    console.log();

    // ========== 6. Test de integración completa ==========
    console.log('🔗 6. Probando servicio de integración...');

    try {
      const integrationService = GoogleIntegrationService.getInstance();
      await integrationService.initialize(config);

      if (integrationService.isEnabled()) {
        console.log(`${EMOJI.SUCCESS} Servicio de integración inicializado`);

        // Test: agregar un log
        await integrationService.addLog({
          timestamp: new Date().toISOString(),
          tipoEvento: 'PROCESS',
          archivo: 'test-google-config.ts',
          cuit: '',
          status: 'SUCCESS',
          mensaje: 'Test de configuración ejecutado',
          usuario: 'system',
        });

        console.log(`${EMOJI.SUCCESS} Log de prueba agregado a Google Sheets`);
      } else {
        console.log(`${EMOJI.WARNING} Servicio de integración no habilitado`);
        warnings++;
      }
    } catch (error) {
      console.log(`${EMOJI.ERROR} Error en servicio de integración: ${error}`);
      errors++;
    }
  }

  // ========== RESUMEN ==========
  console.log('\n' + '='.repeat(60));
  console.log('📋 RESUMEN');
  console.log('='.repeat(60));

  if (errors === 0 && warnings === 0) {
    console.log(`${EMOJI.SUCCESS} ¡Configuración perfecta! Todos los tests pasaron.`);
    console.log(`${EMOJI.ROCKET} Estás listo para usar Google Sheets + Drive.`);
    console.log();
    console.log('Próximos pasos:');
    console.log('1. Procesar facturas normalmente');
    console.log('2. Verificar en Google Sheets que se agreguen las facturas');
    console.log('3. Verificar en Google Drive que se suban los archivos');
    return 0;
  } else if (errors === 0) {
    console.log(`${EMOJI.WARNING} Configuración funcional con ${warnings} advertencia(s).`);
    console.log(`${EMOJI.INFO} Puedes continuar pero revisa las advertencias arriba.`);
    return 0;
  } else {
    console.log(`${EMOJI.ERROR} Configuración incompleta: ${errors} error(es), ${warnings} advertencia(s).`);
    console.log();
    console.log('Pasos para solucionar:');
    console.log('1. Lee GOOGLE_SETUP.md para instrucciones detalladas');
    console.log('2. Verifica config.json (spreadsheetId, rootFolderId)');
    console.log('3. Verifica google-credentials.json existe');
    console.log('4. Comparte Spreadsheet y carpeta Drive con el service account');
    return 1;
  }
}

// Ejecutar test
testGoogleConfiguration()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error(`${EMOJI.ERROR} Error inesperado:`, error);
    process.exit(1);
  });
