# Toolkit de debug: Excel de ARCA

Scripts para inspeccionar los Excel "Mis Comprobantes Recibidos" de ARCA sin
imprimir datos de los comprobantes (solo encabezados y conteos).

## `npm run debug:arca:excel -- <archivo.xlsx> [más.xlsx...]`

Muestra la fila de encabezados y, por tipo de comprobante, cuántas filas traen
cada columna de importes con valor y distinta de cero, y cuántas no traen ningún
componente del desglose (solo `Imp. Total`).

Sirve para verificar qué discrimina ARCA por tipo: por ejemplo, en B y C todas
las columnas de desglose vienen en 0 y el único importe es `Imp. Total`.

## `DB_PATH=<copia.sqlite> bun scripts/debug/arca/completable-vs-listing.ts [archivo.xlsx...]`

Importa los Excel indicados (opcional) sobre **una copia** de la base y compara
las facturas con desglose "completable" contra el listado de comprobantes que usa
el filtro `desglose:completable`. Indica, por id, si cada completable aparece en el
listado. Sirve para explicar cuando el aviso de importación cuenta más de lo que
muestra el filtro (por ejemplo, secundarias de un balance group, que el listado
oculta).
