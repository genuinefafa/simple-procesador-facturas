/**
 * Benchmark: jsQR vs zxing-wasm contra un set de archivos de test.
 * Compara ambos decoders lado a lado para validar la migración.
 *
 * Uso:
 *   npx tsx scripts/debug/qr/benchmark.ts <archivo1> [archivo2] [archivo3] ...
 *   npx tsx scripts/debug/qr/benchmark.ts data/input/invoice-*.pdf
 *
 * Ejemplo con los dos casos conocidos:
 *   npx tsx scripts/debug/qr/benchmark.ts \
 *     data/input/invoice-2000015306120516.pdf \
 *     "data/input/2026-04-07 23.02 - Adobe Scan.pdf"
 */
import jsQR from "jsqr";
import sharp from "sharp";
import { pdf } from "pdf-to-img";
import { readFileSync } from "fs";
import { readBarcodes } from "zxing-wasm/reader";
import { basename } from "path";

const AFIP_PREFIXES = [
  "https://www.afip.gob.ar/fe/qr/",
  "https://servicioscf.afip.gob.ar/publico/comprobantes/",
  "https://serviciosweb.afip.gob.ar/genericos/comprobantes/",
  "https://www.arca.gob.ar/fe/qr/",
];

function isAFIP(url: string): boolean {
  return AFIP_PREFIXES.some((p) => url.startsWith(p));
}

interface DecoderResult {
  found: boolean;
  isAFIP: boolean;
  url?: string;
  timeMs: number;
}

async function getPageBuffer(filePath: string, scale: number): Promise<Buffer> {
  const pdfBuf = readFileSync(filePath);
  const doc = await pdf(pdfBuf, { scale });
  for await (const page of doc) {
    return page as Buffer;
  }
  throw new Error("PDF sin páginas");
}

async function tryJsQR(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<DecoderResult> {
  const t0 = performance.now();
  const qr = jsQR(pixels, width, height, { inversionAttempts: "attemptBoth" });
  const timeMs = performance.now() - t0;
  if (qr && qr.data) {
    return { found: true, isAFIP: isAFIP(qr.data), url: qr.data, timeMs };
  }
  return { found: false, isAFIP: false, timeMs };
}

async function tryZXing(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<DecoderResult> {
  const imageData = { data: pixels, width, height };
  const t0 = performance.now();
  const results = await readBarcodes(imageData, {
    formats: ["QRCode"],
    tryHarder: true,
    maxNumberOfSymbols: 5,
  });
  const timeMs = performance.now() - t0;

  // Find AFIP QR among results
  for (const r of results) {
    if (r.text && isAFIP(r.text)) {
      return { found: true, isAFIP: true, url: r.text, timeMs };
    }
  }
  // If no AFIP QR, report first non-empty result
  if (results.length > 0 && results[0].text) {
    return {
      found: true,
      isAFIP: false,
      url: results[0].text,
      timeMs,
    };
  }
  return { found: false, isAFIP: false, timeMs };
}

async function benchmarkFile(filePath: string): Promise<void> {
  const name = basename(filePath);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`${name}`);
  console.log("=".repeat(60));

  for (const scale of [3.0, 5.0]) {
    const pageBuf = await getPageBuffer(filePath, scale);
    const { data, info } = await sharp(pageBuf)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixels = new Uint8ClampedArray(data);

    console.log(`\n  scale ${scale} (${info.width}x${info.height}):`);

    const jsqr = await tryJsQR(pixels, info.width, info.height);
    const zxing = await tryZXing(pixels, info.width, info.height);

    const fmtResult = (r: DecoderResult) => {
      if (!r.found) return `❌ no QR (${r.timeMs.toFixed(0)}ms)`;
      const tag = r.isAFIP ? "✅ AFIP" : "⚠️  otro";
      return `${tag} (${r.timeMs.toFixed(0)}ms) → ${(r.url || "").substring(0, 50)}...`;
    };

    console.log(`    jsQR:   ${fmtResult(jsqr)}`);
    console.log(`    zxing:  ${fmtResult(zxing)}`);
  }
}

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error(
      "Uso: npx tsx scripts/debug/qr/benchmark.ts <archivo1> [archivo2] ...",
    );
    process.exit(1);
  }

  console.log(`Benchmark jsQR vs zxing-wasm — ${files.length} archivo(s)`);

  for (const f of files) {
    await benchmarkFile(f);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Benchmark completo.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
