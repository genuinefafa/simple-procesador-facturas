// Imports ARCA "Emitidos" Excel files through the service against DB_PATH.
// Usage: DB_PATH=/path/to/copy.sqlite bun scripts/debug/excel/import-issued.ts <a.xlsx> [b.xlsx ...]
import { IssuedInvoiceImportService } from "../../../server/services/issued-invoice-import.service";

const service = new IssuedInvoiceImportService();
for (const file of process.argv.slice(2)) {
  const res = await service.importIfIssued(file);
  if (!res) {
    console.log(`${file}: not an issued file`);
    continue;
  }
  const { filename, totalRows, created, updated, unchanged, errors, periods } =
    res;
  console.log(
    JSON.stringify({
      filename,
      totalRows,
      created,
      updated,
      unchanged,
      errors,
      periods,
    }),
  );
}
