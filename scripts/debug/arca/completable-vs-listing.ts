/**
 * Compares the "completable" count shown after an ARCA import with what the
 * comprobantes listing exposes to the `desglose:completable` filter.
 *
 * Usage (always against a COPY of the database, the import writes to it):
 *   DB_PATH=/path/to/copy.sqlite bun scripts/debug/arca/completable-vs-listing.ts [file.xlsx ...]
 *
 * Prints only ids and statuses, no invoice data.
 */
import { ExcelImportService } from "../../../server/services/excel-import.service.js";
import { ReconciliationRepository } from "../../../server/database/repositories/reconciliation.js";
import { reconcileTaxBreakdown } from "../../../server/services/tax-breakdown-reconciliation.js";
import { createComprobanteService } from "../../../server/factories/index.js";

if (!process.env.DB_PATH) {
  console.error("DB_PATH is required (point it to a copy of the database)");
  process.exit(1);
}

const files = process.argv.slice(2);
for (const file of files) {
  const r = await new ExcelImportService().importFromFile(file);
  console.log(
    `import ${file.split("/").pop()}: +${r.imported} ~${r.updated} =${r.unchanged}`,
  );
}

const repo = new ReconciliationRepository();
const completable = repo
  .listAllTaxBreakdownCandidates()
  .map((c) => ({
    c,
    r: reconcileTaxBreakdown({
      invoice: { total: c.total, invoiceType: c.invoiceType, lines: c.lines },
      expected: c.expected,
      ack: c.ack,
    }),
  }))
  .filter(({ r }) => r.status === "completable");

console.log(`\ncompletable invoices: ${completable.length}`);

const { comprobantes } = await createComprobanteService().listAll();
const byFinal = new Map(
  comprobantes
    .filter((cmp) => cmp.final)
    .map((cmp) => [cmp.final!.id, cmp] as const),
);

for (const { c } of completable) {
  const cmp = byFinal.get(c.invoiceId);
  console.log(
    `invoice ${c.invoiceId} (expected ${c.expectedInvoiceId ?? "-"}, ${c.issueDate}, type ${c.invoiceType}): ` +
      (cmp ? `in listing as ${cmp.id}` : "NOT in listing"),
  );
}
