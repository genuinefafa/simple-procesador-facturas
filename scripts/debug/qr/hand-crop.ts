/**
 * Recorte a mano del QR de ARCA sobre un crop ya existente.
 * Simula lo que haría un humano con una herramienta de captura: recortar
 * solo el bounding box del QR, con un margen mínimo, y pasárselo a jsQR
 * con preprocesamiento agresivo.
 *
 * Se usa para responder la pregunta: "si recorto el QR a mano, ¿jsQR lo lee?"
 *
 * Uso:
 *   npx tsx scripts/debug/qr/hand-crop.ts <ruta-imagen> <left> <top> <width> <height>
 */
import jsQR from "jsqr";
import sharp from "sharp";

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
      console.log(`  ✅ ${label}: ${qr.data.substring(0, 80)}`);
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
  const [, , filePath, lStr, tStr, wStr, hStr] = process.argv;
  if (!filePath || !lStr) {
    console.error(
      "Uso: npx tsx scripts/debug/qr/hand-crop.ts <imagen> <left> <top> <width> <height>",
    );
    process.exit(1);
  }

  const left = parseInt(lStr, 10);
  const top = parseInt(tStr, 10);
  const width = parseInt(wStr, 10);
  const height = parseInt(hStr, 10);

  console.log(`Recortando ${filePath} → (${left},${top}) ${width}x${height}`);
  const crop = await sharp(filePath)
    .extract({ left, top, width, height })
    .toBuffer();

  const { writeFileSync } = await import("fs");
  writeFileSync("/tmp/hand-crop.png", crop);
  console.log("Guardado → /tmp/hand-crop.png\n");

  console.log("=== jsQR contra el recorte a mano ===");
  await tryDecode(crop, "raw");

  const gray = await sharp(crop).grayscale().toBuffer();
  await tryDecode(gray, "grayscale");

  const norm = await sharp(crop).grayscale().normalise().toBuffer();
  await tryDecode(norm, "grayscale+normalise");

  for (const t of [100, 120, 140, 160, 180]) {
    const thr = await sharp(crop)
      .grayscale()
      .normalise()
      .threshold(t)
      .toBuffer();
    await tryDecode(thr, `norm+thr(${t})`);
  }

  // Upscale + threshold
  for (const mult of [1.5, 2, 3]) {
    const m = await sharp(crop).metadata();
    const up = await sharp(crop)
      .resize(
        Math.floor((m.width || 0) * mult),
        Math.floor((m.height || 0) * mult),
        { kernel: "lanczos3" },
      )
      .grayscale()
      .normalise()
      .threshold(140)
      .toBuffer();
    await tryDecode(up, `upscale ${mult}x + norm+thr(140)`);
  }

  // Downscale + threshold
  for (const div of [2, 3, 4]) {
    const m = await sharp(crop).metadata();
    const down = await sharp(crop)
      .resize(
        Math.floor((m.width || 0) / div),
        Math.floor((m.height || 0) / div),
        { kernel: "lanczos3" },
      )
      .grayscale()
      .normalise()
      .threshold(140)
      .toBuffer();
    await tryDecode(down, `downscale 1/${div}x + norm+thr(140)`);
  }

  // Sharpen + threshold
  const sharpThr = await sharp(crop)
    .grayscale()
    .sharpen()
    .normalise()
    .threshold(140)
    .toBuffer();
  await tryDecode(sharpThr, "sharpen+norm+thr(140)");

  // Median + threshold
  const med = await sharp(crop)
    .grayscale()
    .median(3)
    .normalise()
    .threshold(140)
    .toBuffer();
  await tryDecode(med, "median(3)+norm+thr(140)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
