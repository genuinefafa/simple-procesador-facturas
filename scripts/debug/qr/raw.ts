/**
 * Decodifica el QR crudo de una factura y muestra el JSON en string (sin parsear),
 * útil para debuggear QR de ARCA con JSON inválido.
 *
 * Uso:
 *   npm run debug:qr:raw -- <ruta-archivo>
 *   npx tsx scripts/debug/qr/raw.ts <ruta-archivo>
 */
import { readBarcodes } from "zxing-wasm/reader";
import sharp from "sharp";
import { readFileSync } from "fs";
import { pdf } from "pdf-to-img";
import { extname } from "path";

async function getFirstPageImage(filePath: string): Promise<Buffer> {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".pdf") {
    const document = await pdf(filePath, { scale: 3.0 });
    for await (const page of document) {
      return page as Buffer;
    }
    throw new Error("PDF sin páginas");
  }
  return readFileSync(filePath);
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Uso: npx tsx scripts/debug/qr/raw.ts <ruta-archivo>");
    process.exit(1);
  }

  const imgBuf = await getFirstPageImage(filePath);
  const { data, info } = await sharp(imgBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const imageData: ImageData = {
    data: new Uint8ClampedArray(data),
    width: info.width,
    height: info.height,
    colorSpace: "srgb",
  };

  const results = await readBarcodes(imageData, {
    formats: ["QRCode"],
    tryHarder: true,
    maxNumberOfSymbols: 10,
  });

  if (results.length === 0) {
    console.error("QR no detectado");
    process.exit(1);
  }

  console.log(`${results.length} QR(s) encontrado(s):\n`);

  for (const [i, qr] of results.entries()) {
    console.log(`--- QR #${i + 1} ---`);
    console.log("URL:", qr.text);
    try {
      const url = new URL(qr.text);
      const p = url.searchParams.get("p");
      if (p) {
        const jsonStr = Buffer.from(p, "base64").toString("utf-8");
        console.log("\nJSON crudo:");
        console.log(jsonStr);
        try {
          const parsed = JSON.parse(jsonStr);
          console.log("\nJSON parseado OK:");
          console.log(parsed);
        } catch (e) {
          console.log("\nJSON.parse falló:", (e as Error).message);
        }
      }
    } catch (e) {
      console.log("No es URL:", (e as Error).message);
    }
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
