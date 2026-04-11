/**
 * Recorta ajustadamente la región del QR de ARCA en un ticket Coto escaneado
 * y prueba todas las combinaciones razonables de preprocesamiento.
 *
 * Uso:
 *   npm run debug:qr:crop-arca -- <ruta-pdf>
 *   npx tsx scripts/debug/qr/crop-arca.ts <ruta-pdf>
 */
import jsQR from "jsqr";
import sharp from "sharp";
import { pdf } from "pdf-to-img";
import { readFileSync, writeFileSync } from "fs";

async function tryDecode(buf: Buffer, label: string): Promise<boolean> {
  try {
    const { data, info } = await sharp(buf)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const qr = jsQR(new Uint8ClampedArray(data), info.width, info.height, {
      inversionAttempts: "attemptBoth",
    });
    if (qr) {
      console.log(`  ✅ ${label}: ${qr.data.substring(0, 70)}`);
      return true;
    }
  } catch (e) {
    console.log(`  ❌ ${label}: ERROR ${(e as Error).message}`);
    return false;
  }
  console.log(`     ${label}: (no QR)`);
  return false;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Uso: npx tsx scripts/debug/qr/crop-arca.ts <ruta-pdf>");
    process.exit(1);
  }

  const pdfBuf = readFileSync(filePath);

  // Probar varios scales
  for (const scale of [4.0, 5.0, 6.0, 8.0]) {
    console.log(`\n=================== SCALE ${scale} ===================`);
    const doc = await pdf(pdfBuf, { scale });
    let page: Buffer | null = null;
    for await (const p of doc) {
      page = p as Buffer;
      break;
    }
    if (!page) continue;

    const meta = await sharp(page).metadata();
    const W = meta.width || 0;
    const H = meta.height || 0;
    console.log(`página ${W}x${H}`);

    // El ARCA QR está en la parte inferior (después del texto "CODIGO QR ARCA RG 4892/2020").
    // Aproximadamente entre 70% y 90% de la altura, centrado horizontalmente.
    // Probar varias regiones de recorte
    const regions = [
      { top: 0.65, bottom: 0.92, left: 0.15, right: 0.85, name: "region A" },
      { top: 0.7, bottom: 0.9, left: 0.2, right: 0.8, name: "region B tight" },
      { top: 0.68, bottom: 0.88, left: 0.1, right: 0.9, name: "region C wide" },
      {
        top: 0.6,
        bottom: 0.95,
        left: 0.05,
        right: 0.95,
        name: "region D very wide",
      },
    ];

    for (const r of regions) {
      const left = Math.floor(W * r.left);
      const top = Math.floor(H * r.top);
      const width = Math.floor(W * (r.right - r.left));
      const height = Math.floor(H * (r.bottom - r.top));
      const crop = await sharp(page)
        .extract({ left, top, width, height })
        .toBuffer();
      console.log(`\n-- ${r.name} (${left},${top},${width}x${height}) --`);

      if (await tryDecode(crop, "raw")) {
        writeFileSync(
          `/tmp/arca-qr-${scale}-${r.name.replace(/\s/g, "_")}.png`,
          crop,
        );
        continue;
      }

      // Grayscale variants
      const gray = await sharp(crop).grayscale().toBuffer();
      await tryDecode(gray, "grayscale");

      // Normalise
      const norm = await sharp(crop).grayscale().normalise().toBuffer();
      await tryDecode(norm, "grayscale+normalise");

      // Linear contrast boost
      const linear = await sharp(crop).grayscale().linear(1.5, -50).toBuffer();
      await tryDecode(linear, "linear contrast");

      // Threshold variants
      for (const t of [100, 120, 140, 160, 180]) {
        const thr = await sharp(crop)
          .grayscale()
          .normalise()
          .threshold(t)
          .toBuffer();
        await tryDecode(thr, `norm+thr(${t})`);
      }

      // Sharpen + threshold
      const sharpThr = await sharp(crop)
        .grayscale()
        .sharpen()
        .normalise()
        .threshold(140)
        .toBuffer();
      await tryDecode(sharpThr, "sharpen+norm+thr(140)");

      // Median blur (remove noise) + threshold
      const med = await sharp(crop)
        .grayscale()
        .median(3)
        .normalise()
        .threshold(140)
        .toBuffer();
      await tryDecode(med, "median(3)+norm+thr(140)");

      // Resize up (upscale) + threshold
      const meta2 = await sharp(crop).metadata();
      const up = await sharp(crop)
        .resize(
          Math.floor((meta2.width || 0) * 2),
          Math.floor((meta2.height || 0) * 2),
          {
            kernel: "lanczos3",
          },
        )
        .grayscale()
        .normalise()
        .threshold(140)
        .toBuffer();
      await tryDecode(up, "upscale 2x + thr");

      // Resize down
      const down = await sharp(crop)
        .resize(
          Math.floor((meta2.width || 0) / 2),
          Math.floor((meta2.height || 0) / 2),
          {
            kernel: "lanczos3",
          },
        )
        .grayscale()
        .normalise()
        .threshold(140)
        .toBuffer();
      await tryDecode(down, "downscale 0.5x + thr");

      // Save sample for visual inspection
      writeFileSync(
        `/tmp/arca-crop-${scale}-${r.name.replace(/\s/g, "_")}.png`,
        crop,
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
