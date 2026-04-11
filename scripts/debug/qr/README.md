# Toolkit de debug para QR AFIP/ARCA

Scripts reutilizables para diagnosticar problemas de extracción de QR. Todos son pequeños y autocontenidos — usalos cuando un comprobante no reconoce el QR correctamente y querés entender por qué antes de tocar el extractor.

## Cuándo usar cada uno

El flujo típico de diagnóstico va de lo más alto a lo más bajo nivel:

| Script | Cuándo | Qué muestra |
|---|---|---|
| `extract.ts` | Primer paso siempre. Corre el pipeline completo igual que el server. | Resultado final del `QRExtractor` (campos extraídos, confianza, errores). |
| `raw.ts` | `extract.ts` falló o devolvió datos raros. Querés ver el payload crudo del QR. | URL decodificada, JSON en texto plano (antes del parseo), y si `JSON.parse` falla. |
| `scales.ts` | Sospechás que el scale de render del PDF no es el óptimo. | Matriz de detección probando scales 2→6 × tamaños de ventana. Útil para ver si el QR es decodificable a algún scale y cuál. |
| `preprocess.ts` | jsQR ve el QR pero no lo decodifica (imagen degradada). | Prueba variantes de grayscale, normalise, threshold, sharpen, blur, etc. sobre el tercio inferior de la página. Guarda recortes en `/tmp/qr-bottom-*.png` para inspección visual. |
| `crop-arca.ts` | Tickets térmicos Coto/supermercados con dos QRs (Coto + ARCA) donde el de ARCA está degradado. | Combinación masiva: 4 scales × 4 regiones × 13 variantes de preprocesamiento. Guarda recortes en `/tmp/arca-crop-*.png`. |

## Comandos

Todos corren vía npm scripts desde la raíz del repo:

```bash
npm run debug:qr           -- data/input/mi-factura.pdf
npm run debug:qr:raw       -- data/input/mi-factura.pdf
npm run debug:qr:scales    -- data/input/mi-factura.pdf
npm run debug:qr:preprocess -- data/input/mi-factura.pdf
npm run debug:qr:crop-arca -- data/input/mi-factura.pdf
```

Tip: agregá `2>/dev/null` al final si te molesta el ruido de pdfjs en stderr.

## Workflow sugerido

1. **Reproducí el problema**: `npm run debug:qr -- <archivo>`.
   - Si devuelve éxito → el problema no está en el extractor, está en el pipeline upstream (cómo se guarda, cuándo se corre, etc.).
   - Si devuelve error → leé el mensaje.
2. **Si el error es "JSON inválido"**: corré `raw.ts` para ver el payload exacto. Los QR de ARCA a veces tienen JSON malformado (`"nroDocRec":,`) — el extractor ya lo maneja, pero si aparece una variante nueva conviene capturarla.
3. **Si el error es "No se encontró QR"**: corré `scales.ts`. Si algún scale detecta el QR, actualizamos el orden en el extractor. Si ninguno lo detecta → el problema es de imagen, pasá al punto 4.
4. **Si ningún scale funciona**: corré `preprocess.ts` (general) o `crop-arca.ts` (específico para tickets Coto). Si ALGUNA variante lo decodifica, la incorporamos al extractor. Si NINGUNA lo decodifica → estamos en el límite de jsQR, y la solución es fallback de paste manual o migración a zxing-wasm.

## Limitaciones conocidas

- **jsQR falla con finder patterns degradados** (tickets térmicos muy desgastados). Ningún preprocesamiento lo resuelve — es limitación estructural del decoder. En esos casos, usar el fallback de paste manual en la UI.
- **Los scripts no usan exactamente la misma ventana deslizante que el extractor real** — usan variantes simplificadas para diagnóstico. Si querés reproducir al 100% lo que hace el server, usá `extract.ts`.
