// Dumps an ARCA "Mis Comprobantes" Excel as TSV (all sheets, raw cell values).
// Usage: bun scripts/debug/excel/dump.ts <file.xlsx> [maxRows]
import ExcelJS from "../../../server/node_modules/exceljs/index.js";

const [file, maxRowsArg] = process.argv.slice(2);
if (!file) throw new Error("usage: dump.ts <file.xlsx> [maxRows]");
const maxRows = maxRowsArg ? Number(maxRowsArg) : Infinity;
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
for (const ws of wb.worksheets) {
  console.log(
    `## sheet "${ws.name}" rows=${ws.rowCount} cols=${ws.columnCount}`,
  );
  ws.eachRow((row, n) => {
    if (n > maxRows) return;
    const vals = (row.values as unknown[])
      .slice(1)
      .map((v) =>
        v instanceof Date
          ? v.toISOString().slice(0, 10)
          : v === null || v === undefined
            ? ""
            : String(v),
      );
    console.log(`${n}\t${vals.join("\t")}`);
  });
}
