/**
 * Test rápido para verificar que el servicio completo detecta CUIT correctamente en factura5
 */

import { InvoiceProcessingService } from '../services/invoice-processing.service.js';
import { join } from 'path';

// Obtener el path correcto (desde el directorio server o desde la raíz)
const FACTURA5_PATH = join(
  process.cwd().includes('/server')
    ? join(process.cwd(), '..', 'examples', 'facturas', 'factura5.pdf')
    : join(process.cwd(), 'examples', 'facturas', 'factura5.pdf')
);

async function testFactura5Service() {
  console.log('🧪 Test del servicio completo con factura5.pdf\n');
  console.log('='.repeat(100));

  const service = new InvoiceProcessingService();

  console.log(`📄 Procesando: ${FACTURA5_PATH}\n`);

  const result = await service.processInvoice(FACTURA5_PATH, 'factura5.pdf');

  console.log('\n' + '='.repeat(100));
  console.log('📊 RESULTADO FINAL:\n');
  console.log(`   Success: ${result.success}`);
  console.log(`   Confidence: ${result.confidence}%`);
  console.log(`   Source: ${result.source}`);
  console.log(`   Method: ${result.method}`);
  console.log(`   Requires Review: ${result.requiresReview}`);

  if (result.extractedData) {
    console.log('\n   Datos extraídos:');
    console.log(`      CUIT: ${result.extractedData.cuit || 'NO DETECTADO'}`);
    console.log(`      Fecha: ${result.extractedData.date || 'NO DETECTADO'}`);
    console.log(`      Tipo: ${result.extractedData.invoiceType || 'NO DETECTADO'}`);
    console.log(`      PV: ${result.extractedData.pointOfSale ?? 'NO DETECTADO'}`);
    console.log(`      Número: ${result.extractedData.invoiceNumber ?? 'NO DETECTADO'}`);
    console.log(`      Total: ${result.extractedData.total ?? 'NO DETECTADO'}`);
  }

  console.log('\n' + '='.repeat(100));

  // Verificar resultado esperado
  const expectedCuit = '20-10200053-7';
  const detectedCuit = result.extractedData?.cuit;

  if (detectedCuit === expectedCuit) {
    console.log(`\n✅ ¡ÉXITO! CUIT detectado correctamente: ${detectedCuit}`);
  } else {
    console.log(
      `\n❌ FALLÓ: CUIT esperado ${expectedCuit}, detectado ${detectedCuit || 'NO DETECTADO'}`
    );
  }

  console.log('='.repeat(100) + '\n');
}

testFactura5Service().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
