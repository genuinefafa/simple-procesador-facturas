#!/bin/bash
# Script para instalar git hooks personalizados

HOOKS_DIR="$(cd "$(dirname "$0")" && pwd)"
GIT_HOOKS_DIR="$(git rev-parse --git-dir)/hooks"

echo "📦 Instalando git hooks..."
echo "   Origen: $HOOKS_DIR"
echo "   Destino: $GIT_HOOKS_DIR"
echo ""

# Copiar todos los hooks
for hook in "$HOOKS_DIR"/*; do
  filename=$(basename "$hook")

  # Ignorar el script de instalación y README
  if [[ "$filename" == "install.sh" || "$filename" == "README.md" ]]; then
    continue
  fi

  target="$GIT_HOOKS_DIR/$filename"

  # Backup si ya existe
  if [ -f "$target" ] && [ ! -L "$target" ]; then
    echo "⚠️  Backup: $filename → $filename.backup"
    mv "$target" "$target.backup"
  fi

  # Crear symlink
  ln -sf "$hook" "$target"
  echo "✅ Instalado: $filename"
done

echo ""
echo "🎉 Hooks instalados correctamente"
echo ""
echo "Los hooks se ejecutarán automáticamente en cada commit."
echo "Para desinstalar, eliminá los symlinks en: $GIT_HOOKS_DIR"
