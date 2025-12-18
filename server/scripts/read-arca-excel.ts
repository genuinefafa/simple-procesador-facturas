import ExcelJS from 'exceljs';

async function readARCAExcel() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(
    '/Users/fafa/Library/CloudStorage/OneDrive-Personal/3f/contable.compras/Mis Comprobantes Recibidos 2025-11 - CUIT 30710578296.xlsx'
  );

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('No se encontró ninguna hoja de cálculo en el archivo');
  }

  // Buscar fila de headers (puede no ser la primera si hay títulos)
  let headerRowNum = 1;
  let headers: string[] = [];

  // Buscar la fila que tiene headers reales (no merged cells/títulos)
  for (let i = 1; i <= 10; i++) {
    const row = worksheet.getRow(i);
    const cellValues: string[] = [];
    row.eachCell((cell, colNumber) => {
      cellValues[colNumber - 1] = String(cell.value || '');
    });

    // Si encontramos headers distintos (no todos iguales), usar esta fila
    const uniqueValues = new Set(cellValues.filter((v) => v));
    if (uniqueValues.size > 5) {
      headerRowNum = i;
      headers = cellValues;
      break;
    }
  }

  console.log(`Fila de headers detectada: ${headerRowNum}`);

  console.log('=== COLUMNAS DEL EXCEL DE ARCA ===');
  headers.forEach((header, index) => {
    console.log(`${index + 1}. ${header}`);
  });

  // Leer primeras 3 filas de datos
  console.log('\n=== MUESTRA DE DATOS (3 primeras filas) ===');
  const samples: any[] = [];
  const startDataRow = headerRowNum + 1;
  for (let rowNum = startDataRow; rowNum < startDataRow + 3; rowNum++) {
    const row = worksheet.getRow(rowNum);
    const rowData: any = {};
    row.eachCell((cell, colNumber) => {
      const header = headers[colNumber - 1];
      if (header) {
        rowData[header] = cell.value;
      }
    });
    samples.push(rowData);
  }
  console.log(JSON.stringify(samples, null, 2));

  console.log(`\n=== TOTAL DE FILAS: ${worksheet.rowCount - headerRowNum} ===`);
}

readARCAExcel().catch(console.error);
