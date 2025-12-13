#!/usr/bin/env bash
set -e

echo "🔄 Reseteando entorno de desarrollo..."
echo ""

# Get current timestamp
TIMESTAMP=$(date +"%Y%m%d.%H%M%S")

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$PROJECT_ROOT/data"
DB_FILE="$DATA_DIR/database.sqlite"

echo "📂 Proyecto: $PROJECT_ROOT"
echo "⏰ Timestamp: $TIMESTAMP"
echo ""

# 1. Clean and reset database
echo "🗄️  Reseteando base de datos..."
if [ -f "$DB_FILE" ]; then
  rm -f "$DB_FILE"
  echo "   ✅ Base de datos eliminada"
else
  echo "   ℹ️  Base de datos no existía"
fi

# Remove WAL files if they exist
rm -f "${DB_FILE}-shm" "${DB_FILE}-wal"

# Run migrations
echo "   🔧 Aplicando migraciones..."
cd "$PROJECT_ROOT"
npm run db:migrate -w server
echo ""

# 2. Rename input directory
INPUT_DIR="$DATA_DIR/input"
if [ -d "$INPUT_DIR" ]; then
  NEW_INPUT_DIR="$DATA_DIR/input.$TIMESTAMP"
  mv "$INPUT_DIR" "$NEW_INPUT_DIR"
  echo "📥 input/ → input.$TIMESTAMP"
else
  echo "📥 input/ no existía"
fi

# Create fresh input directory
mkdir -p "$INPUT_DIR"
echo "   ✅ input/ creado limpio"
echo ""

# 3. Rename processed directory
PROCESSED_DIR="$DATA_DIR/processed"
if [ -d "$PROCESSED_DIR" ]; then
  NEW_PROCESSED_DIR="$DATA_DIR/processed.$TIMESTAMP"
  mv "$PROCESSED_DIR" "$NEW_PROCESSED_DIR"
  echo "📤 processed/ → processed.$TIMESTAMP"
else
  echo "📤 processed/ no existía"
fi

# Create fresh processed directory
mkdir -p "$PROCESSED_DIR"
echo "   ✅ processed/ creado limpio"
echo ""

echo "✅ Entorno reseteado exitosamente!"
echo ""
echo "💡 Pasos siguientes:"
echo "   1. Opcional: npm run db:seed -w server -- --force"
echo "   2. Copiar facturas a data/input/"
echo "   3. npm run dev"
