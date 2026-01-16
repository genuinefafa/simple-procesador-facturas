-- Migration 0011: Drop pending_files table
-- Esta tabla fue reemplazada por el nuevo modelo files + file_extraction_results

-- Drop the pending_files table completely
DROP TABLE IF EXISTS pending_files;
