-- Agregar campo finalized_file para almacenar ruta relativa a data/
-- Formato: "finalized/yyyy-mm/nombre-archivo.pdf"
-- Si está NULL, se usa fallback con archivoProcesado (ruta absoluta legacy)
--
-- Nota: SQLite no soporta COMMENT ON COLUMN. La documentación está en este comentario.
-- Propósito: Ruta relativa a data/ del archivo finalizado.
-- Formato: finalized/yyyy-mm/nombre.pdf
-- NULL indica que usa ruta legacy en archivoProcesado

ALTER TABLE facturas ADD COLUMN finalized_file TEXT;
