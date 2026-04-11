/**
 * Prueba detección de QR de un PDF probando múltiples scales y tamaños de ventana.
 * Útil para diagnosticar QR que no se detectan con los scales por defecto.
 *
 * Uso:
 *   npm run debug:qr:scales -- <ruta-pdf>
 *   npx tsx scripts/debug/qr/scales.ts <ruta-pdf>
 */
import jsQR from "jsqr";
import sharp from "sharp";
import { pdf } from "pdf-to-img";

const SCALES = [2.0, 2.5, 3.0, 3.5, 4.0, 5.0, 6.0];

async function scanImage(buf: Buffer, scale: number): Promise<void> {
  const meta = await sharp(buf).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  console.log(`\n--- scale ${scale} → ${width}x${height} ---`);

  // Full image
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const full = jsQR(new Uint8ClampedArray(data), info.width, info.height, {
    inversionAttempts: "attemptBoth",
  });
  if (full) {
    console.log(`  full image: ${full.data.substring(0, 80)}`);
  } else {
    console.log(`  full image: (no QR)`);
  }

  // Sliding windows over bottom half (where ARCA QR lives)
  const sizes = [800, 600, 500, 400, 300];
  for (const size of sizes) {
    if (size > width || size > height) continue;
    const found = new Set<string>();
    // Focus on bottom third
    const yStart = Math.max(0, Math.floor(height * 0.6));
    const step = Math.floor(size / 2);
    for (let y = yStart; y + size <= height; y += step) {
      for (let x = 0; x + size <= width; x += step) {
        try {
          const { data: d, info: i } = await sharp(buf)
            .extract({ left: x, top: y, width: size, height: size })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
          const q = jsQR(new Uint8ClampedArray(d), i.width, i.height, {
            inversionAttempts: "attemptBoth",
          });
          if (q) found.add(q.data.substring(0, 60));
        } catch {
          // ignore region errors
        }
      }
    }
    if (found.size > 0) {
      console.log(`  window ${size}px bottom: ${found.size} QR(s)`);
      for (const q of found) console.log(`    - ${q}`);
    }
  }
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Uso: npx tsx scripts/debug/qr/scales.ts <ruta-pdf>");
    process.exit(1);
  }

  const { readFileSync } = await import("fs");
  const pdfBuf = readFileSync(filePath);

  for (const scale of SCALES) {
    try {
      const doc = await pdf(pdfBuf, { scale });
      let pageNum = 0;
      for await (const page of doc) {
        pageNum++;
        if (pageNum > 1) break;
        await scanImage(page as Buffer, scale);
      }
    } catch (e) {
      console.log(`scale ${scale}: ERROR ${(e as Error).message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
