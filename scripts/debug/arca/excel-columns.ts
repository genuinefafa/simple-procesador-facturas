/**
 * Summarizes an ARCA "Mis Comprobantes Recibidos" Excel without printing data:
 * header row, and per invoice type how many rows have each amount column
 * non-empty / non-zero, plus how many rows bring no breakdown at all (total only).
 *
 * Usage: npm run debug:arca:excel -- <file.xlsx> [more.xlsx...]
 */
import { createRequire } from "node:module";
import type ExcelJSType from "exceljs";

// exceljs is a server dependency: resolve it from server/
const require = createRequire(
  new URL("../../../server/package.json", import.meta.url),
);
const ExcelJS = require("exceljs") as typeof ExcelJSType;

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "result" in v)
    return num((v as { result: unknown }).result);
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

for (const file of process.argv.slice(2)) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  if (!ws) continue;

  // Header: first row containing "Tipo"
  let headerRow = 0;
  let headers: string[] = [];
  ws.eachRow((row, i) => {
    if (headerRow) return;
    const vals = (row.values as unknown[])
      .slice(1)
      .map((v) => String(v ?? "").trim());
    if (vals.some((v) => /^Tipo/i.test(v))) {
      headerRow = i;
      headers = vals;
    }
  });
  console.log(`\n=== ${file.split("/").pop()} (header row ${headerRow})`);
  console.log(headers.map((h, i) => `${i}:${h}`).join(" | "));

  const typeIdx = headers.findIndex((h) => /^Tipo/i.test(h));
  const totalIdx = headers.findIndex((h) =>
    /^(Imp\. )?Total$|^Imp\. Total/i.test(h),
  );
  const amountCols = headers
    .map((h, i) => ({ h, i }))
    .filter(
      ({ h, i }) =>
        i !== typeIdx && /Neto|IVA|Exent|Tributos|Total|Gravado/i.test(h),
    );

  const stats = new Map<
    string,
    {
      n: number;
      nonEmpty: Record<string, number>;
      nonZero: Record<string, number>;
      totalEqNoBreakdown: number;
    }
  >();
  ws.eachRow((row, i) => {
    if (i <= headerRow) return;
    const vals = (row.values as unknown[]).slice(1);
    const type = String(vals[typeIdx] ?? "")
      .split("-")[0]!
      .trim();
    if (!type) return;
    const s = stats.get(type) ?? {
      n: 0,
      nonEmpty: {},
      nonZero: {},
      totalEqNoBreakdown: 0,
    };
    s.n++;
    let breakdownSum = 0;
    for (const { h, i: idx } of amountCols) {
      const v = num(vals[idx]);
      if (v !== null) s.nonEmpty[h] = (s.nonEmpty[h] ?? 0) + 1;
      if (v !== null && v !== 0) s.nonZero[h] = (s.nonZero[h] ?? 0) + 1;
      if (idx !== totalIdx && !/Total/i.test(h) && v) breakdownSum += v;
    }
    if (breakdownSum === 0) s.totalEqNoBreakdown++;
    stats.set(type, s);
  });

  for (const [type, s] of [...stats].sort(
    (a, b) => Number(a[0]) - Number(b[0]),
  )) {
    console.log(
      `\n  tipo ${type}: ${s.n} filas, ${s.totalEqNoBreakdown} sin ningún componente (solo total)`,
    );
    for (const { h } of amountCols) {
      console.log(
        `    ${h.padEnd(28)} con valor ${String(s.nonEmpty[h] ?? 0).padStart(4)}  ≠0 ${String(s.nonZero[h] ?? 0).padStart(4)}`,
      );
    }
  }
}
