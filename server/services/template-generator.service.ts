/**
 * Servicio para generar templates de Excel para importación
 */

import ExcelJS from 'exceljs';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class TemplateGeneratorService {
  /**
   * Genera un archivo Excel template con el formato esperado de AFIP
   */
  async generateExcelTemplate(): Promise<Buffer> {
    // Leer metadata del template
    const templatePath = path.join(__dirname, '..', 'templates', 'excel-afip-template.json');
    const templateMetadata = JSON.parse(await readFile(templatePath, 'utf-8'));

    // Crear workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Procesador de Facturas';
    workbook.created = new Date();
    workbook.modified = new Date();

    // Hoja 1: Datos de facturas
    const dataSheet = workbook.addWorksheet('Facturas AFIP', {
      properties: {
        defaultRowHeight: 20,
      },
    });

    // Configurar columnas con formato
    dataSheet.columns = [
      { header: 'CUIT', key: 'cuit', width: 18 },
      { header: 'Razon Social', key: 'razonSocial', width: 30 },
      { header: 'Fecha', key: 'fecha', width: 15 },
      { header: 'Tipo', key: 'tipo', width: 8 },
      { header: 'Punto de Venta', key: 'puntoVenta', width: 15 },
      { header: 'Numero', key: 'numero', width: 12 },
      { header: 'Total', key: 'total', width: 15 },
      { header: 'CAE', key: 'cae', width: 20 },
    ];

    // Estilo del header
    const headerRow = dataSheet.getRow(1);
    headerRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 25;

    // Agregar datos de ejemplo
    const sampleData = templateMetadata.sampleData;

    sampleData.forEach((row: any, index: number) => {
      const excelRow = dataSheet.addRow({
        cuit: row.CUIT,
        razonSocial: row['Razon Social'],
        fecha: row.Fecha,
        tipo: row.Tipo,
        puntoVenta: row['Punto de Venta'],
        numero: row.Numero,
        total: row.Total,
        cae: row.CAE,
      });

      // Alternar color de filas para mejor legibilidad
      if (index % 2 === 0) {
        excelRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF2F2F2' },
        };
      }

      // Formato de fecha
      excelRow.getCell('fecha').numFmt = 'dd/mm/yyyy';

      // Formato de número con separador de miles
      excelRow.getCell('total').numFmt = '#,##0.00';
    });

    // Hoja 2: Instrucciones
    const instructionsSheet = workbook.addWorksheet('📖 Instrucciones');

    instructionsSheet.columns = [{ width: 80 }];

    const instructions = [
      { text: '📋 INSTRUCCIONES PARA IMPORTAR FACTURAS AFIP', style: 'title' },
      { text: '', style: 'normal' },
      { text: '1. Formato del Archivo', style: 'heading' },
      {
        text: '   • Este archivo puede ser guardado como .xlsx, .xls o exportado a .csv',
        style: 'normal',
      },
      {
        text: '   • Los nombres de las columnas pueden variar, el sistema intentará auto-detectarlas',
        style: 'normal',
      },
      { text: '', style: 'normal' },
      { text: '2. Columnas Requeridas', style: 'heading' },
      { text: '   ✅ CUIT: Formato XX-XXXXXXXX-X (puede estar sin guiones)', style: 'normal' },
      { text: '   ✅ Fecha: Formato DD/MM/YYYY o YYYY-MM-DD', style: 'normal' },
      { text: '   ✅ Tipo: A, B, C, E, M o X', style: 'normal' },
      { text: '   ✅ Punto de Venta: Número entero', style: 'normal' },
      { text: '   ✅ Numero: Número del comprobante', style: 'normal' },
      { text: '', style: 'normal' },
      { text: '3. Columnas Opcionales', style: 'heading' },
      { text: '   • Razon Social: Nombre del proveedor', style: 'normal' },
      { text: '   • Total: Importe total (número decimal)', style: 'normal' },
      { text: '   • CAE: Código de Autorización Electrónica', style: 'normal' },
      { text: '', style: 'normal' },
      { text: '4. Nombres de Columnas Alternativos Aceptados', style: 'heading' },
      {
        text: '   • CUIT: "Nro. CUIT", "Numero de CUIT", "CUIT Emisor"',
        style: 'normal',
      },
      {
        text: '   • Fecha: "Fecha Emision", "Fecha de Emision", "Fecha Factura"',
        style: 'normal',
      },
      { text: '   • Tipo: "Tipo Comprobante", "Comprobante"', style: 'normal' },
      {
        text: '   • Punto de Venta: "Pto Venta", "Pto. Vta", "Punto Vta"',
        style: 'normal',
      },
      {
        text: '   • Numero: "Nro Comprobante", "Numero Comprobante"',
        style: 'normal',
      },
      {
        text: '   • Total: "Importe", "Monto", "Importe Total"',
        style: 'normal',
      },
      { text: '', style: 'normal' },
      { text: '5. Consejos', style: 'heading' },
      {
        text: '   💡 Eliminá la primera fila si tiene títulos o metadatos no relacionados',
        style: 'normal',
      },
      {
        text: '   💡 Asegurate de que la primera fila contenga los nombres de columnas',
        style: 'normal',
      },
      { text: '   💡 Podés tener más columnas de las listadas, serán ignoradas', style: 'normal' },
      {
        text: '   💡 Si hay errores en algunas filas, el sistema las reportará pero importará el resto',
        style: 'normal',
      },
      { text: '', style: 'normal' },
      { text: '6. Ejemplo de Uso', style: 'heading' },
      {
        text: '   1. Descargá el Excel de AFIP con tus compras del mes',
        style: 'normal',
      },
      {
        text: '   2. Copiá las columnas necesarias a este template (o usá el Excel directamente)',
        style: 'normal',
      },
      { text: '   3. Guardá el archivo', style: 'normal' },
      {
        text: '   4. Importalo en la pestaña "📥 Importar Excel" de la aplicación',
        style: 'normal',
      },
      {
        text: '   5. Revisá los resultados y corregí errores si los hay',
        style: 'normal',
      },
      {
        text: '   6. ¡Listo! Ahora al subir PDFs, el sistema los matcheará automáticamente',
        style: 'normal',
      },
    ];

    instructions.forEach((instruction, index) => {
      const row = instructionsSheet.addRow([instruction.text]);

      switch (instruction.style) {
        case 'title':
          row.font = { bold: true, size: 16, color: { argb: 'FF4472C4' } };
          row.height = 30;
          row.alignment = { vertical: 'middle' };
          break;
        case 'heading':
          row.font = { bold: true, size: 12 };
          row.height = 25;
          break;
        case 'normal':
          row.font = { size: 11 };
          row.height = 20;
          break;
      }
    });

    // Hoja 3: Glosario
    const glossarySheet = workbook.addWorksheet('📚 Glosario');
    glossarySheet.columns = [
      { header: 'Término', key: 'term', width: 20 },
      { header: 'Descripción', key: 'description', width: 60 },
    ];

    const glossaryHeaderRow = glossarySheet.getRow(1);
    glossaryHeaderRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    glossaryHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF70AD47' },
    };
    glossaryHeaderRow.alignment = { vertical: 'middle', horizontal: 'center' };

    const glossaryTerms = [
      {
        term: 'CUIT',
        description:
          'Clave Única de Identificación Tributaria. Identifica de manera única a cada contribuyente.',
      },
      {
        term: 'CAE',
        description:
          'Código de Autorización Electrónica. Lo otorga AFIP para validar comprobantes electrónicos.',
      },
      {
        term: 'Tipo A/B/C',
        description:
          'Tipo de factura según el régimen impositivo. A: responsable inscripto, B: consumidor final, C: exento.',
      },
      {
        term: 'Punto de Venta',
        description:
          'Número que identifica el lugar físico o sistema desde donde se emite la factura.',
      },
      {
        term: 'Matching',
        description: 'Proceso de asociar un PDF escaneado con una factura esperada del Excel AFIP.',
      },
    ];

    glossaryTerms.forEach((term) => {
      glossarySheet.addRow(term);
    });

    // Generar buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Genera un archivo CSV template con el formato esperado
   */
  async generateCSVTemplate(): Promise<string> {
    const headers = [
      'CUIT',
      'Razon Social',
      'Fecha',
      'Tipo',
      'Punto de Venta',
      'Numero',
      'Total',
      'CAE',
    ];

    const sampleRows = [
      [
        '30-12345678-9',
        'Proveedor SA',
        '15/11/2025',
        'B',
        '1',
        '12345',
        '15234.50',
        '12345678901234',
      ],
      [
        '20-98765432-1',
        'Distribuidora XYZ',
        '18/11/2025',
        'A',
        '3',
        '567',
        '8920.00',
        '98765432109876',
      ],
      ['33-55555555-9', 'Servicios ABC SRL', '20/11/2025', 'C', '2', '9876', '4500.75', ''],
    ];

    const csvLines = [headers.join(','), ...sampleRows.map((row) => row.join(','))];

    return csvLines.join('\n');
  }
}
