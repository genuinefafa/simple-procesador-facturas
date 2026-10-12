# Toolkit de debug: Excel de ARCA

Scripts para inspeccionar los Excel "Mis Comprobantes Recibidos" de ARCA sin
imprimir datos de los comprobantes (solo encabezados y conteos).

## `npm run debug:arca:excel -- <archivo.xlsx> [más.xlsx...]`

Muestra la fila de encabezados y, por tipo de comprobante, cuántas filas traen
cada columna de importes con valor y distinta de cero, y cuántas no traen ningún
componente del desglose (solo `Imp. Total`).

Sirve para verificar qué discrimina ARCA por tipo: por ejemplo, en B y C todas
las columnas de desglose vienen en 0 y el único importe es `Imp. Total`.
