#!/bin/bash
# Script para copiar archivos del backend a la estructura correcta
# Ejecutar: bash copiar-archivos-backend.sh

echo "╔════════════════════════════════════════════════════╗"
echo "║  📦 COPIANDO ARCHIVOS BACKEND                     ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""

# Verificar que estamos en el directorio correcto
if [ ! -d "backend" ]; then
  echo "❌ Error: No se encuentra la carpeta 'backend'"
  echo "   Ejecuta este script desde la raíz de tu proyecto"
  exit 1
fi

echo "📁 Creando estructura de directorios..."

# Crear directorios si no existen
mkdir -p backend/providers/gipuzkoa
mkdir -p backend/providers/bizkaia
mkdir -p backend/providers/alava
mkdir -p backend/services
mkdir -p backend/tests

echo "✅ Estructura creada"
echo ""

# Aquí es donde debes pegar los archivos descargados
# Por ahora, verificamos que existan

FILES_TO_CHECK=(
  "backend/providers/gipuzkoa/scraper.js"
  "backend/providers/gipuzkoa/parser.js"
  "backend/providers/bizkaia/scraper.js"
  "backend/providers/bizkaia/parser.js"
  "backend/providers/alava/scraper.js"
  "backend/providers/alava/parser.js"
  "backend/services/aggregator.js"
  "backend/services/geocoder.js"
  "backend/test-scrapers.js"
  "backend/package.json"
)

echo "🔍 Verificando archivos..."
echo ""

MISSING=0
for file in "${FILES_TO_CHECK[@]}"; do
  if [ -f "$file" ]; then
    echo "✅ $file"
  else
    echo "❌ $file FALTA"
    ((MISSING++))
  fi
done

echo ""

if [ $MISSING -eq 0 ]; then
  echo "🎉 ¡Todos los archivos están en su lugar!"
  echo ""
  echo "📝 Próximo paso:"
  echo "   cd backend"
  echo "   npm install"
  echo "   node test-scrapers.js"
else
  echo "⚠️  Faltan $MISSING archivos"
  echo ""
  echo "📝 Copia los archivos descargados a las ubicaciones indicadas"
fi
