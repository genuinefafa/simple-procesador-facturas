/**
 * Corre el QRExtractor completo contra un archivo (PDF/imagen) y muestra el resultado.
 *
 * Uso:
 *   npm run debug:qr -- <ruta-archivo>
 *   npx tsx scripts/debug/qr/extract.ts <ruta-archivo>
 *
 * Redirige stderr a /dev/null si querés filtrar el ruido de pdfjs:
 *   npm run debug:qr -- <archivo> 2>/dev/null
 */
import { QRExtractor } from "../../../server/extractors/qr-extractor.ts";

const filePath = process.argv[2];

if (!filePath) {
  console.error("Uso: npx tsx scripts/debug/qr/extract.ts <ruta-archivo>");
  process.exit(1);
}

const extractor = new QRExtractor();

extractor
  .extract(filePath)
  .then((result) => {
    console.log("\n>>> RESULT <<<");
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((err) => {
    console.error("ERR", err);
    process.exit(1);
  });
