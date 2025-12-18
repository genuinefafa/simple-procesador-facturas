Probando encontré un bug con el formato uno de los formatos de importación de Excel, el archivo data/input.2/Mis Comprobantes Recibidos 2025-11 - CUIT 30710578296.xlsx no se reconoce bien y debería contemplarse ese formato de archivo (cambian algunos títulos de columnas pero la idea es la misma); habría que revisar qué pasó con eso porque habría sido hecho en una de las últimas versiones; me parece que no tiene que ver con tus cambios, armate un issue para resolver esto en otra iteración si te parece;

Ahora bien, volviendo al plan de test;
la db no está en server/database/invoices.db, ¿de dónde sacaste eso? está en el SPEC.md :scream: (lo digo por el plan que me armaste arriba)

---

🧪 Plan de Testing
Paso 1: Ejecutar migraciones (⚠️ HACER BACKUP PRIMERO)

# 1. Backup de la DB actual

cp server/database/invoices.db server/database/invoices.db.backup

# 2. Ejecutar migraciones

npm run db:migrate

# o si tenés otro comando:

# drizzle-kit push:sqlite

# 3. Verificar que las columnas cambiaron

sqlite3 server/database/invoices.db "PRAGMA table_ninfo(facturas);" | grep tipo_comprobante
sqlite3 server/database/invoices.db "PRAGMA table_info(expected_invoices);" | grep invoice_type
sqlite3 server/database/invoices.db "PRAGMA table_info(pending_files);" | grep extracted_type
Paso 2: Verificar datos migrados

# Ver algunos tipos migrados en facturas

sqlite3 server/database/invoices.db "SELECT id, tipo_comprobante, comprobante_completo FROM facturas LIMIT 10;"

# Ver algunos tipos en expected_invoices

sqlite3 server/database/invoices.db "SELECT id, invoice_type, cuit FROM expected_invoices LIMIT 10;"
Esperado:
tipo_comprobante debe ser números: 1, 6, 11, 19, 51, o NULL
comprobante_completo debe tener formato: FACA 0001-00000123 (no A-0001-00000123)
Paso 3: Probar importación Excel

# Si tenés un Excel de prueba, importarlo

# Debería extraer códigos ARCA del formato "11 - Factura C"

Paso 4: Rollback si algo falla

# Si algo sale mal:

rm server/database/invoices.db
cp server/database/invoices.db.backup server/database/invoices.db
