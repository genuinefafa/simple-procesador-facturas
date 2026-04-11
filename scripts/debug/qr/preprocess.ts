/**
 * Prueba preprocesamiento de imagen (grayscale + threshold/normalize) para mejorar
 * detección de QR de ARCA en tickets térmicos escaneados.
 *
 * Uso:
 *   npm run debug:qr:preprocess -- <ruta-pdf>
 *   npx tsx scripts/debug/qr/preprocess.ts <ruta-pdf>
 */
import jsQR from "jsqr";
import sharp from "sharp";
import { pdf } from "pdf-to-img";
import { readFileSync, writeFileSync } from "fs";

async function tryDecode(buf: Buffer, label: string): Promise<void> {
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const qr = jsQR(new Uint8ClampedArray(data), info.width, info.height, {
    inversionAttempts: "attemptBoth",
  });
  if (qr) {
    console.log(`  ${label}: ✅ ${qr.data.substring(0, 70)}`);
  } else {
    console.log(`  ${label}: (no QR)`);
  }
}

async function cropBottom(pageBuf: Buffer): Promise<Buffer> {
  const meta = await sharp(pageBuf).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  // Bottom third (where ARCA QR sits)
  const top = Math.floor(height * 0.55);
  return sharp(pageBuf)
    .extract({ left: 0, top, width, height: height - top })
    .toBuffer();
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Uso: npx tsx scripts/debug/qr/preprocess.ts <ruta-pdf>");
    process.exit(1);
  }

  const pdfBuf = readFileSync(filePath);
  const doc = await pdf(pdfBuf, { scale: 3.0 });
  let pageBuf: Buffer | null = null;
  for await (const page of doc) {
    pageBuf = page as Buffer;
    break;
  }
  if (!pageBuf) {
    console.error("PDF sin páginas");
    process.exit(1);
  }

  const bottom = await cropBottom(pageBuf);
  writeFileSync("/tmp/qr-bottom-raw.png", bottom);
  console.log("Guardado recorte inferior → /tmp/qr-bottom-raw.png");

  console.log("\n=== Probando variantes de preprocesamiento ===");
  await tryDecode(bottom, "raw (sin tocar)");

  // Grayscale
  const gray = await sharp(bottom).grayscale().toBuffer();
  await tryDecode(gray, "grayscale");

  // Grayscale + normalize
  const norm = await sharp(bottom).grayscale().normalise().toBuffer();
  await tryDecode(norm, "grayscale + normalise");

  // Grayscale + threshold (binarizar) a varios niveles
  for (const t of [100, 128, 140, 160, 180]) {
    const thr = await sharp(bottom).grayscale().threshold(t).toBuffer();
    await tryDecode(thr, `grayscale + threshold(${t})`);
  }

  // Grayscale + normalize + threshold
  const normThr = await sharp(bottom)
    .grayscale()
    .normalise()
    .threshold(128)
    .toBuffer();
  await tryDecode(normThr, "grayscale + normalise + threshold(128)");

  // Gamma + threshold
  const gamma = await sharp(bottom)
    .grayscale()
    .gamma(1.5)
    .threshold(140)
    .toBuffer();
  await tryDecode(gamma, "gamma 1.5 + threshold(140)");

  // Blur + threshold (para reducir ruido térmico)
  const blur = await sharp(bottom)
    .grayscale()
    .blur(1)
    .threshold(128)
    .toBuffer();
  await tryDecode(blur, "blur + threshold(128)");

  // Guardar el mejor candidato para inspección visual
  writeFileSync("/tmp/qr-bottom-normthr.png", normThr);
  console.log("\nGuardado normalise+threshold → /tmp/qr-bottom-normthr.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
