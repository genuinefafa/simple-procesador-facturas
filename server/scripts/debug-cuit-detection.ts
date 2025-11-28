/**
 * Script para analizar CUITs en PDFs problemáticos
 */

import { PDFExtractor } from '../extractors/pdf-extractor.js';
import { extractCUITsWithContext } from '../validators/cuit.js';

const problemFiles = [
  'factura11643.pdf', // Debe detectar 30-51758323-1 pero detecta 30-50001770-4
  'factura128.pdf',   // Debe detectar 23-10058899-4
  'factura3435.pdf',  // Debe detectar 23-18140463-9
  'factura5.pdf',     // Debe detectar 20-10200053-7
];

const extractor = new PDFExtractor();

for (const file of problemFiles) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📄 ${file}`);
  console.log(`${'='.repeat(80)}`);

  try {
    const text = await extractor.extractText(`../examples/facturas/${file}`);
    const cuits = extractCUITsWithContext(text);

    console.log(`\n🔍 CUITs encontrados (${cuits.length}):\n`);
    cuits.forEach((c, i) => {
      console.log(`${i + 1}. ${c.cuit} (score: ${c.score}, posición: ${c.position})`);
      const preview = `${c.contextBefore.slice(-50)}►${c.cuit}◄${c.contextAfter.slice(0, 50)}`;
      console.log(`   Contexto: "${preview.replace(/\s+/g, ' ')}"`);
    });

    // Mostrar snippet del texto donde aparecen los CUITs
    console.log(`\n📝 Texto relevante:`);
    const firstCuit = cuits[0];
    const start = Math.max(0, firstCuit.position - 200);
    const end = Math.min(text.length, firstCuit.position + 200);
    console.log(text.slice(start, end).replace(/\s+/g, ' '));

  } catch (error) {
    console.error(`❌ Error: ${error}`);
  }
}
