-- Migration 0013: Drop legacy path columns from facturas (Phase 1)
-- Issue #40: Simplificación de arquitectura de archivos
--
-- Eliminamos columnas que ya están 100% duplicadas en la tabla files:
-- - archivo_original: Reemplazado por files.original_filename
-- - file_hash: Redundante con files.file_hash
--
-- NOTA: Mantenemos por ahora:
-- - archivo_procesado: Tiene índice UNIQUE y es referenciado en varios lugares
-- - finalized_file: Usada en algunos endpoints como fallback
-- Estas serán eliminadas en migraciones posteriores una vez que todo el código
-- use files.storage_path exclusivamente.
--
-- La relación facturas.file_id -> files.id contiene toda la información necesaria.

-- Eliminar índice que depende de file_hash
DROP INDEX IF EXISTS idx_facturas_hash;

-- Eliminar columnas completamente redundantes
ALTER TABLE facturas DROP COLUMN archivo_original;
ALTER TABLE facturas DROP COLUMN file_hash;
