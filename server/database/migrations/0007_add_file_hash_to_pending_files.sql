-- Migration: Add file_hash to pending_files
-- Date: 2026-01-06
-- Description: Agregar campo file_hash para almacenar SHA-256 de archivos subidos

-- Agregar campo file_hash a pending_files
ALTER TABLE pending_files ADD COLUMN file_hash TEXT;

-- Crear índice para búsquedas por hash
CREATE INDEX idx_pending_files_hash ON pending_files(file_hash);
