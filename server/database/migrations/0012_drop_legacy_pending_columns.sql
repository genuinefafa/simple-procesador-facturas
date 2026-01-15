-- Migración: Eliminar columnas legacy de pending_files
-- Issue #40: Simplificación de arquitectura de archivos
--
-- Estas columnas fueron reemplazadas por:
-- - facturas.pending_file_id -> facturas.file_id
-- - expected_invoices.matched_pending_file_id -> expected_invoices.matched_file_id

-- Primero eliminar el índice que depende de la columna
DROP INDEX IF EXISTS idx_facturas_pending_file;

-- Eliminar columna legacy de facturas
ALTER TABLE facturas DROP COLUMN pending_file_id;

-- Eliminar columna legacy de expected_invoices
ALTER TABLE expected_invoices DROP COLUMN matched_pending_file_id;
