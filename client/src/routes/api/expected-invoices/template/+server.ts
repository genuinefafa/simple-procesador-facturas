/**
 * Endpoint para descargar template de Excel AFIP
 */

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  console.info('\n📥 [API] GET /api/expected-invoices/template');

  try {
    // Lazy-load exceljs (~25MB) — only loaded when template is requested
    const { TemplateGeneratorService } =
      await import('@server/services/template-generator.service.js');
    const format = url.searchParams.get('format') || 'xlsx';
    const service = new TemplateGeneratorService();

    if (format === 'csv') {
      console.info('   📄 Generando template CSV...');
      const csv = await service.generateCSVTemplate();

      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="template-facturas-afip.csv"',
        },
      });
    } else {
      console.info('   📊 Generando template Excel...');
      const buffer = await service.generateExcelTemplate();

      return new Response(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="template-facturas-afip.xlsx"',
        },
      });
    }
  } catch (error) {
    console.error('   ❌ Error generando template:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
