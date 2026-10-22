#!/bin/bash
# Abre Agentic directamente en esta ventana de Terminal, sin reinstalar ni
# reparar nada (si hay una versión nueva del programa al lado, la copia). Si no encuentra la instalación, te dice qué hacer.
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

# Buscar la app: Aplicaciones (o su acceso directo), discos externos y Spotlight
find_app() {
  local c
  for c in /Applications/Agentic.app "$HOME/Applications/Agentic.app" \
           /Volumes/*/"Agentic UI"/Agentic.app /Volumes/*/*/"Agentic UI"/Agentic.app \
           "$HOME"/*/"Agentic UI"/Agentic.app; do
    [ -e "$c" ] || continue
    c="$(cd "$c" 2>/dev/null && pwd -P)" || continue
    [ -d "$c/Contents/Resources/bin" ] && { echo "$c"; return; }
  done
  mdfind "kMDItemCFBundleIdentifier == 'com.llmfantasy.agentic'" 2>/dev/null | while read -r c; do
    [ -d "$c/Contents/Resources/bin" ] && { echo "$c"; break; }
  done
}
APP="$(find_app || true)"
if [ -z "$APP" ]; then
  echo "❌ No encuentro Agentic instalado."
  if [ -L /Applications/Agentic.app ]; then
    echo "   Aplicaciones apunta a: $(readlink /Applications/Agentic.app)"
    echo "   Si está en un disco externo, conéctalo y vuelve a abrir este archivo."
  else
    echo "   Ejecuta \"Instalar Agentic UI.command\" (está en $SRC_DIR)."
  fi
  exit 1
fi

# Si hay una versión más nueva del programa junto a este archivo, usarla
RES="$APP/Contents/Resources"
# (cli.js, las skills y, desde la v7.0, el corrector determinista: corrector.mjs, corrector.py y vendor/acorn)
distinto() { [ -f "$SRC_DIR/agentic/$1" ] && ! cmp -s "$SRC_DIR/agentic/$1" "$RES/app/$1"; }
if [ -f "$SRC_DIR/agentic/cli.js" ] && { distinto cli.js || distinto corrector.mjs || distinto corrector.py || distinto vendor/acorn.mjs; }; then
  if cp "$SRC_DIR/agentic/cli.js" "$RES/app/cli.js" && cp -R "$SRC_DIR/agentic/skills/." "$RES/app/skills/" && \
     { [ ! -f "$SRC_DIR/agentic/corrector.mjs" ] || { cp "$SRC_DIR/agentic/corrector.mjs" "$SRC_DIR/agentic/corrector.py" "$RES/app/" && mkdir -p "$RES/app/vendor" && cp -R "$SRC_DIR/agentic/vendor/." "$RES/app/vendor/"; }; }; then
    echo "  ✓ Agentic actualizado a la última versión"
  else
    echo "  ⚠ No pude actualizar Agentic en $RES/app (¿disco en solo lectura?)"
  fi
  sleep 1
fi

# Algunos discos externos pierden el permiso de ejecución: llamar a los scripts con bash
# y poner al día el arranque de Ollama (progreso de carga en el registro, sin límite corto)
chmod +x "$RES/start-ollama.sh" "$RES/bin/agentic" 2>/dev/null
if [ -f "$RES/start-ollama.sh" ] && ! grep -q OLLAMA_KV_CACHE_TYPE "$RES/start-ollama.sh"; then
  sed -i '' -e 's/ollama-config-v[0-9]*/ollama-config-v5/g' \
    -e 's/OLLAMA_LOAD_TIMEOUT=[0-9a-z]* OLLAMA_KEEP_ALIVE=[0-9a-z]*\( OLLAMA_DEBUG=1\)*/OLLAMA_LOAD_TIMEOUT=40m OLLAMA_KEEP_ALIVE=4h OLLAMA_DEBUG=1 OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0/' \
    "$RES/start-ollama.sh" 2>/dev/null
fi
# v6.9 (Qwen3-Coder-REAP 25B, 15 GB): un solo modelo y una sola conversación a la vez en Ollama,
# para que toda la memoria vaya al modelo (y reiniciarlo una vez con estos ajustes)
if [ -f "$RES/start-ollama.sh" ] && ! grep -q OLLAMA_NUM_PARALLEL "$RES/start-ollama.sh"; then
  sed -i '' -e 's/ollama-config-v[0-9]*/ollama-config-v6/g' \
    -e 's/OLLAMA_KV_CACHE_TYPE=q8_0/OLLAMA_KV_CACHE_TYPE=q8_0 OLLAMA_NUM_PARALLEL=1 OLLAMA_MAX_LOADED_MODELS=1/' \
    "$RES/start-ollama.sh" 2>/dev/null
fi

# Memoria de la GPU: macOS deja a la GPU unos 2/3 de la RAM (16 GB en un Mac de 24 GB) y el modelo
# con su contexto necesita unos 17-18 GB; si no cabe, parte va a la CPU y responde mucho más lento.
# Subirlo pide la contraseña de administrador y se deshace solo al reiniciar el Mac.
RAM_MB=$(( $(sysctl -n hw.memsize 2>/dev/null || echo 0) / 1048576 ))
LIM_MB=$(sysctl -n iogpu.wired_limit_mb 2>/dev/null || echo "")
QUIERO_MB=$(( RAM_MB - 4096 ))
PREF="$RES/.gpu-memoria"
if grep -q "^const MODEL = 'qwen3-coder" "$RES/app/cli.js" 2>/dev/null && [ -n "$LIM_MB" ] && [ "$RAM_MB" -ge 20000 ] && [ "$LIM_MB" -lt "$QUIERO_MB" ] && [ "$(cat "$PREF" 2>/dev/null)" != "no" ]; then
  if [ ! -f "$PREF" ]; then
    echo "  El modelo Qwen3-Coder necesita más memoria de GPU de la que macOS le da por defecto."
    echo "  Puedo dejar que la GPU use hasta $((QUIERO_MB / 1024)) GB de tus $((RAM_MB / 1024)) GB (responde bastante más rápido)."
    echo "  Pide tu contraseña de administrador y se deshace solo al reiniciar el Mac."
    read -r -p "  ¿Subirlo ahora y cada vez que haga falta? [s/n]: " R
    case "$R" in [sSyY]*) echo si > "$PREF" ;; *) echo no > "$PREF" ;; esac
  fi
  if [ "$(cat "$PREF" 2>/dev/null)" = "si" ]; then
    echo "  🔑 Subiendo el límite de memoria de la GPU a $((QUIERO_MB / 1024)) GB (contraseña del Mac):"
    if sudo sysctl iogpu.wired_limit_mb=$QUIERO_MB >/dev/null; then
      echo "  ✓ Límite subido"
      # Ollama lee el límite al arrancar: reiniciarlo si ya estaba en marcha
      curl -fs -o /dev/null http://localhost:11434/api/version && bash "$RES/start-ollama.sh" reiniciar >/dev/null 2>&1
    else
      echo "  ⚠ No se pudo subir (se usará el límite normal)."
    fi
  fi
fi

grep -q 'bash "$RES/start-ollama.sh"' "$RES/bin/agentic" 2>/dev/null || \
  sed -i '' 's|OUT="$("$RES/start-ollama.sh")"|OUT="$(bash "$RES/start-ollama.sh")"|' "$RES/bin/agentic" 2>/dev/null

# Comando "agentic" en cualquier Terminal: abre Agentic igual que este archivo
# (con actualización automática). Se escribe una sola línea en ~/.zshrc y ~/.bash_profile.
SELF="$SRC_DIR/$(basename "$0")"
LINE="agentic() { if [ -f \"$SELF\" ]; then bash \"$SELF\" \"\$@\"; else bash \"$RES/bin/agentic\" \"\$@\"; fi; }  # agentic"
ADDED=""
for RC in "$HOME/.zshrc" "$HOME/.bash_profile"; do
  [ -f "$RC" ] || [ "$RC" = "$HOME/.zshrc" ] || continue
  grep -qxF "$LINE" "$RC" 2>/dev/null && continue
  { grep -v '# agentic$' "$RC" 2>/dev/null; echo "$LINE"; } > "$RC.agentic-tmp" && cat "$RC.agentic-tmp" > "$RC" && rm -f "$RC.agentic-tmp" && ADDED=1
done
if [ -n "$ADDED" ]; then
  echo "  ✓ Listo: a partir de ahora abre Agentic escribiendo  agentic  en cualquier ventana de Terminal nueva"
  sleep 2
fi

cd ~/Documents 2>/dev/null || cd ~
clear
exec bash "$RES/bin/agentic" "$@"
