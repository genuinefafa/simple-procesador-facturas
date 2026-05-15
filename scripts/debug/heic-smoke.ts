/**
 * Smoke: confirma que heic-convert (libheif-js) carga y decodifica HEIC sin bundle.
 * Si sale OK → commit 7 (drop libheif → sharp) NO es necesario, el bug #180 B
 * es bundling-specific y se resuelve al salir de SvelteKit.
 */
// @ts-expect-error - sin tipos
import convert from "heic-convert";
import { readFileSync } from "fs";
import { join } from "path";

const HEIC = join(
  import.meta.dirname,
  "..",
  "..",
  "data",
  "finalized",
  "2025-05",
  "2025-05-13 COTO 30548083156 FACA 02056-00090460 [Fa].heic",
);

const buf = readFileSync(HEIC);
console.log("input bytes:", buf.length);

const jpegBuf = await (
  convert as (args: { buffer: Buffer; format: "JPEG" }) => Promise<Buffer>
)({
  buffer: buf,
  format: "JPEG",
});

console.log("JPEG bytes:", jpegBuf.length);
console.log("magic:", jpegBuf.subarray(0, 4).toString("hex"));
console.log("OK");
