-- Agregar campo finalized_file para almacenar ruta relativa a data/
-- Formato: "finalized/yyyy-mm/nombre-archivo.pdf"
-- Si está NULL, se usa fallback con archivoProcesado (ruta absoluta legacy)

ALTER TABLE facturas ADD COLUMN finalized_file TEXT;

-- Comentario para documentar el propósito
COMMENT ON COLUMN facturas.finalized_file IS 'Ruta relativa a data/ del archivo finalizado. Formato: finalized/yyyy-mm/nombre.pdf. NULL indica que usa ruta legacy en archivoProcesado.';
