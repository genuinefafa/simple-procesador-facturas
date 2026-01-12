-- Migración 0011: Eliminar tabla pending_files (legacy)
--
-- Esta migración elimina la tabla pending_files que ha sido reemplazada por:
-- - `files`: Gestión de archivos físicos
-- - `file_extraction_results`: Datos extraídos por OCR/PDF
--
-- Prerequisitos:
-- - Migración 0010 debe haber ejecutado (crea files y file_extraction_results)
-- - Script 0010-migrate-pending-to-files.ts debe haber corrido (migra datos existentes)
-- - Script 0011-migrate-extraction-data.ts debe haber corrido (migra datos de extracción)

-- 1. Eliminar columna matchedPendingFileId de expected_invoices
--    (ya fue reemplazada por matchedFileId en migración 0010)
ALTER TABLE expected_invoices DROP COLUMN matched_pending_file_id;

-- 2. Eliminar columna pendingFileId de facturas
--    (ya fue reemplazada por fileId en migración 0010)
ALTER TABLE facturas DROP COLUMN pending_file_id;

-- 3. Eliminar tabla pending_files
DROP TABLE IF EXISTS pending_files;
