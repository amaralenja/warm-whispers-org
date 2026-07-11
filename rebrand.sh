#!/usr/bin/env bash
# Rebrand Meetily -> Multium Meet
# Uso: bash rebrand.sh /c/caminho/logo-multium.png
set -euo pipefail

ROOT_DIR="$(pwd)"
LOGO_INPUT="${1:-}"

to_unix_path() {
  local value="$1"
  if [ -f "$value" ]; then
    printf '%s\n' "$value"
    return 0
  fi

  if command -v cygpath >/dev/null 2>&1; then
    local converted
    converted="$(cygpath -u "$value" 2>/dev/null || true)"
    if [ -n "$converted" ] && [ -f "$converted" ]; then
      printf '%s\n' "$converted"
      return 0
    fi
  fi

  printf '%s\n' "$value"
}

if [ -z "$LOGO_INPUT" ]; then
  echo "Uso: bash rebrand.sh /c/caminho/para/logo-multium.png"
  echo "Logo tem que ser PNG quadrado, min 1024x1024, fundo transparente."
  exit 1
fi

LOGO="$(to_unix_path "$LOGO_INPUT")"
if [ ! -f "$LOGO" ]; then
  echo "Logo não encontrado: $LOGO_INPUT"
  echo "No Git Bash, prefira passar assim: /c/Users/amara/Downloads/multium-logo.png"
  exit 1
fi

find_magick() {
  if [ -n "${MAGICK_EXE:-}" ] && [ -x "${MAGICK_EXE:-}" ]; then
    printf '%s\n' "$MAGICK_EXE"
    return 0
  fi

  if command -v magick >/dev/null 2>&1; then
    command -v magick
    return 0
  fi

  local candidate
  for candidate in \
    /c/Program\ Files/ImageMagick-*/magick.exe \
    /c/Program\ Files\ \(x86\)/ImageMagick-*/magick.exe; do
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

IM="$(find_magick || true)"
if [ -z "$IM" ]; then
  echo "!! ImageMagick não encontrado no Git Bash."
  echo "   Rode assim no PowerShell, na mesma linha:"
  echo '   $env:MAGICK_EXE="C:\Program Files\ImageMagick-7.1.2-Q16-HDRI\magick.exe"; & "C:\Program Files\Git\bin\bash.exe" rebrand.sh /c/Users/amara/Downloads/multium-logo.png'
  exit 1
fi

echo "==> Usando ImageMagick: $IM"
"$IM" -version >/dev/null

echo "==> Trocando strings Meetily/meetily -> Multium Meet/multium-meet"
grep -rl --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=target \
  --exclude-dir=whisper.cpp --exclude-dir=whisper-custom \
  -e "Meetily" -e "meetily" . 2>/dev/null | while read -r file; do
  case "$file" in
    *README*|*CONTRIBUTING*|*LICENSE*|*CLAUDE.md) continue ;;
  esac

  sed -i.bak \
    -e 's/Meetily/Multium Meet/g' \
    -e 's/meetily/multium-meet/g' \
    "$file" && rm -f "$file.bak"
done

if [ -f frontend/tailwind.config.ts ]; then
  echo "==> Cores da marca"
  sed -i.bak "s/#[0-9a-fA-F]\{6\}/#0F172A/1" frontend/tailwind.config.ts && rm -f frontend/tailwind.config.ts.bak
fi

ICON_DIR="frontend/src-tauri/icons"
if [ ! -d "$ICON_DIR" ]; then
  echo "Pasta de ícones não encontrada: $ICON_DIR"
  echo "Rode este script na raiz do repositório, onde existe a pasta frontend/."
  exit 1
fi

echo "==> Gerando ícones a partir de $LOGO"
cd "$ICON_DIR"

for size in 16 32 128 256 512 1024; do
  "$IM" "$LOGO" -background none -resize "${size}x${size}" -gravity center -extent "${size}x${size}" "${size}x${size}.png"
done
cp 512x512.png icon.png
cp 256x256.png 128x128@2x.png
"$IM" "$LOGO" -define icon:auto-resize=256,128,64,48,32,16 icon.ico

if command -v png2icns >/dev/null 2>&1; then
  png2icns icon.icns 16x16.png 32x32.png 128x128.png 256x256.png 512x512.png 1024x1024.png 2>/dev/null || \
    png2icns icon.icns 32x32.png 128x128.png 256x256.png 512x512.png
else
  echo "   (dica: instala 'libicns' pra gerar .icns fora do mac)"
fi

cd "$ROOT_DIR"

CONF="frontend/src-tauri/tauri.conf.json"
if [ -f "$CONF" ]; then
  echo "==> Ajustando tauri.conf.json"
  sed -i.bak \
    -e 's/"productName": *"[^"]*"/"productName": "Multium Meet"/' \
    -e 's/"identifier": *"[^"]*"/"identifier": "com.multium.meet"/' \
    "$CONF" && rm -f "$CONF.bak"
fi

if [ -f frontend/package.json ]; then
  echo "==> package.json"
  sed -i.bak 's/"name": *"meetily"/"name": "multium-meet"/' frontend/package.json && rm -f frontend/package.json.bak
fi

echo ""
echo "OK. Revisa os diffs com: git diff --stat"
echo "Testa local: cd frontend && pnpm install && pnpm tauri:dev"