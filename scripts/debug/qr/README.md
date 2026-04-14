# Toolkit de debug para QR AFIP/ARCA

Scripts reutilizables para diagnosticar problemas de extracción de QR. Todos son pequeños y autocontenidos — usalos cuando un comprobante no reconoce el QR correctamente y querés entender por qué antes de tocar el extractor.

## Scripts activos (usan zxing-wasm)

| Script | Cuándo | npm script |
|---|---|---|
| `extract.ts` | Primer paso siempre. Corre el pipeline completo igual que el server. | `npm run debug:qr` |
| `raw.ts` | `extract.ts` falló o devolvió datos raros. Querés ver el payload crudo del QR. | `npm run debug:qr:raw` |
| `benchmark.ts` | Comparar jsQR vs zxing-wasm lado a lado (requiere `npm install jsqr` manual). | `npm run debug:qr:benchmark` |

## Scripts legacy (requieren jsQR, pre-migración)

Los siguientes scripts fueron creados para diagnosticar limitaciones de jsQR. Se conservan como documentación del proceso que motivó la migración a zxing-wasm. Para ejecutarlos, instalar jsQR manualmente: `npm install jsqr -w server`.

| Script | Propósito original |
|---|---|
| `scales.ts` | Probar múltiples render scales (jsQR fallaba con scale alto). |
| `preprocess.ts` | Probar preprocesamiento (grayscale, threshold, etc.) para QRs degradados. |
| `crop-arca.ts` | Recorte exhaustivo para tickets Coto con dual QR. |
| `hand-crop.ts` | Recorte manual a ojo para verificar que ni un crop humano salva a jsQR. |

## Workflow sugerido

1. **Reproducí el problema**: `npm run debug:qr -- <archivo>`.
   - Si devuelve éxito → el problema no está en el extractor, está en el pipeline upstream.
   - Si devuelve error → leé el mensaje.
2. **Si el error es "JSON inválido"**: corré `npm run debug:qr:raw -- <archivo>` para ver el payload exacto. Los QR de ARCA a veces tienen JSON malformado (`"nroDocRec":,`) — el extractor ya lo maneja con `parseAFIPJson`, pero si aparece una variante nueva conviene capturarla.
3. **Si el error es "No se encontró QR"**: con zxing-wasm esto es raro. Si ocurre, el QR está tan destruido que ni ZXing con tryHarder lo recupera. Solución: fallback de paste manual en la UI (ver issue #173).
