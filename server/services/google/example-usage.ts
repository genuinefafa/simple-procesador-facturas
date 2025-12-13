/**
 * Ejemplo de uso de Google Integration Service
 * Este archivo muestra cómo integrar los servicios de Google en tu flujo de procesamiento
 */

import { getGoogleIntegrationService } from './google-integration.service';
import type {
  InvoiceData,
  GoogleIntegrationService,
  ProjectConfig,
} from './google-integration.service';
import { getConfig } from '../../utils/config-loader';

const config = getConfig() as ProjectConfig;

/**
 * Ejemplo 1: Inicializar el servicio de Google
 */
async function initializeGoogleServices(): Promise<GoogleIntegrationService | null> {
  const googleService = getGoogleIntegrationService();

  if (!config.google || !config.google.enabled) {
    console.info('Google integration is disabled in config.json');
    return null;
  }

  try {
    await googleService.initialize(config);
    console.info('✅ Google services initialized');
    return googleService;
  } catch (error) {
    console.error('❌ Failed to initialize Google services:', error);
    return null;
  }
}

/**
 * Ejemplo 2: Guardar una factura procesada
 */
async function saveProcessedInvoice(
  googleService: ReturnType<typeof getGoogleIntegrationService>
): Promise<void> {
  if (!googleService.isEnabled()) {
    console.info('Google integration not enabled');
    return;
  }

  // Datos de ejemplo de una factura procesada
  const invoiceData: InvoiceData = {
    cuit: '20-12345678-9',
    fechaEmision: '15/12/2023',
    tipoComprobante: 'A',
    puntoVenta: 1,
    numeroComprobante: 12345,
    total: 15000.5,
    moneda: 'ARS',
    tipoArchivo: 'PDF_DIGITAL',
    metodoExtraccion: 'GENERICO',
    confianzaExtraccion: 95,
    validadoManualmente: false,
    requiereRevision: false,
    archivoOriginal: './data/input/factura_ejemplo.pdf',
  };

  // Guardar en Google Sheets + Drive
  const result = await googleService.saveInvoice(invoiceData);

  if (result.success) {
    console.info('✅ Factura guardada:');
    console.info('   Invoice ID:', result.invoiceId);
    console.info('   Drive File ID:', result.driveFileId);
    console.info('   Drive Link:', result.driveLink);
  } else {
    console.error('❌ Error guardando factura:', result.error);
  }
}

/**
 * Ejemplo 3: Buscar si una factura ya existe
 */
async function checkIfInvoiceExists(
  googleService: ReturnType<typeof getGoogleIntegrationService>
): Promise<boolean> {
  if (!googleService.isEnabled()) {
    return false;
  }

  const existing = await googleService.findExistingInvoice('20-12345678-9', 'A', 1, 12345);

  if (existing) {
    console.info('⚠️  Factura ya existe:', existing.id);
    return true;
  } else {
    console.info('✅ Factura no existe, se puede procesar');
    return false;
  }
}

/**
 * Ejemplo 4: Matching con facturas esperadas (Excel AFIP)
 */
async function matchWithExpectedInvoices(
  googleService: ReturnType<typeof getGoogleIntegrationService>
): Promise<void> {
  if (!googleService.isEnabled()) {
    return;
  }

  // Buscar match exacto
  const exactMatch = await googleService.findExpectedInvoiceMatch('20-12345678-9', 'A', 1, 12345);

  if (exactMatch) {
    console.info('✅ Match exacto encontrado:');
    console.info('   ID:', exactMatch.id);
    console.info('   Status:', exactMatch.status);

    // Marcar como matched
    await googleService.markExpectedInvoiceAsMatched(
      exactMatch.id,
      'FAC-20-12345678-9-A-0001-00012345',
      100
    );
  } else {
    console.info('❌ No se encontró match exacto');

    // Buscar candidatos por rango
    const candidates = await googleService.findExpectedInvoiceCandidates(
      '20-12345678-9',
      '15/12/2023',
      15000.5
    );

    if (candidates.length > 0) {
      console.info(`⚠️  Se encontraron ${candidates.length} candidatos posibles:`);
      candidates.forEach((c) => {
        console.info(
          `   - ${c.tipoComprobante}-${c.puntoVenta}-${c.numeroComprobante} (${c.fechaEmision}, $${c.total})`
        );
      });
    }
  }
}

/**
 * Ejemplo 5: Importar facturas esperadas desde Excel AFIP
 */
async function importExpectedInvoices(
  googleService: ReturnType<typeof getGoogleIntegrationService>
): Promise<void> {
  if (!googleService.isEnabled()) {
    return;
  }

  const invoices = [
    {
      cuit: '20-12345678-9',
      nombreEmisor: 'PROVEEDOR SA',
      fechaEmision: '15/12/2023',
      tipoComprobante: 'A',
      puntoVenta: 1,
      numeroComprobante: 12345,
      total: 15000.5,
      cae: '12345678901234',
    },
    {
      cuit: '27-98765432-1',
      nombreEmisor: 'OTRO PROVEEDOR SRL',
      fechaEmision: '16/12/2023',
      tipoComprobante: 'B',
      puntoVenta: 2,
      numeroComprobante: 67890,
      total: 8500.0,
      cae: '98765432109876',
    },
  ];

  const loteId = `LOTE-${Date.now()}`;

  await googleService.importExpectedInvoices(invoices, loteId);
  console.info(`✅ ${invoices.length} facturas esperadas importadas (Lote: ${loteId})`);
}

/**
 * Ejemplo 6: Obtener estadísticas
 */
async function getStats(
  googleService: ReturnType<typeof getGoogleIntegrationService>
): Promise<void> {
  if (!googleService.isEnabled()) {
    return;
  }

  const stats = await googleService.getStats();

  if (stats) {
    console.info('📊 Estadísticas:');
    console.info('   Total Emisores:', stats.totalEmisores);
    console.info('   Total Facturas:', stats.totalFacturas);
    console.info('   Total Esperadas:', stats.totalEsperadas);
    console.info('   Esperadas Pendientes:', stats.esperadasPendientes);
    console.info('   Esperadas Matched:', stats.esperadasMatched);
  }
}

/**
 * Ejemplo 7: Integración completa en un flujo de procesamiento
 */
async function completeProcessingFlow(): Promise<void> {
  console.info('=== Flujo completo de procesamiento con Google ===\n');

  // 1. Inicializar
  const googleService = await initializeGoogleServices();
  if (!googleService) {
    console.info('⚠️  Flujo sin Google, usar SQLite local');
    return;
  }

  // 2. Verificar duplicados
  console.info('\n--- Paso 1: Verificar duplicados ---');
  const exists = await checkIfInvoiceExists(googleService);
  if (exists) {
    console.info('⚠️  Factura duplicada, saltando procesamiento');
    return;
  }

  // 3. Guardar factura procesada
  console.info('\n--- Paso 2: Guardar factura ---');
  await saveProcessedInvoice(googleService);

  // 4. Matching con esperadas
  console.info('\n--- Paso 3: Matching con esperadas ---');
  await matchWithExpectedInvoices(googleService);

  // 5. Actualizar estadísticas del emisor
  console.info('\n--- Paso 4: Actualizar emisor ---');
  await googleService.updateEmisorStats('20-12345678-9');

  // 6. Ver estadísticas
  console.info('\n--- Paso 5: Estadísticas ---');
  await getStats(googleService);

  console.info('\n✅ Flujo completo terminado');
}

/**
 * Ejemplo 8: Cómo modificar invoice-processing.service.ts
 */
function howToIntegrateInExistingService(): void {
  console.info(`
=== Cómo integrar en servicios existentes ===

En invoice-processing.service.ts:

import { getGoogleIntegrationService, InvoiceData } from './google/google-integration.service';

class InvoiceProcessingService {
  private googleService = getGoogleIntegrationService();

  async processInvoice(filePath: string) {
    // ... extracción existente (no cambiar) ...
    const extractedData = await this.extractData(filePath);

    // === AGREGAR AQUÍ ===
    // Si Google está habilitado, guardar en Sheets + Drive
    if (this.googleService.isEnabled()) {
      const invoiceData: InvoiceData = {
        cuit: extractedData.cuit,
        fechaEmision: extractedData.date,
        tipoComprobante: extractedData.invoiceType,
        puntoVenta: extractedData.pointOfSale,
        numeroComprobante: extractedData.invoiceNumber,
        total: extractedData.total,
        moneda: 'ARS',
        tipoArchivo: extractedData.documentType,
        metodoExtraccion: extractedData.method,
        confianzaExtraccion: extractedData.confidence,
        validadoManualmente: false,
        requiereRevision: extractedData.confidence < 70,
        archivoOriginal: filePath,
      };

      const result = await this.googleService.saveInvoice(invoiceData);

      if (result.success) {
        console.info('✅ Guardado en Google:', result.invoiceId);
      }
    } else {
      // Flujo existente con SQLite
      await this.saveToSQLite(extractedData);
    }
  }
}
  `);
}

// Para ejecutar los ejemplos:
// ts-node server/services/google/example-usage.ts

if (require.main === module) {
  completeProcessingFlow().catch(console.error);
}

export {
  initializeGoogleServices,
  saveProcessedInvoice,
  checkIfInvoiceExists,
  matchWithExpectedInvoices,
  importExpectedInvoices,
  getStats,
  completeProcessingFlow,
  howToIntegrateInExistingService,
};
