#!/bin/bash
# Instalador de Agentic para macOS: un agente en la terminal para modelos
# locales de Ollama, con MCPs y Skills.
# Instala Ollama, descarga el modelo Qwen3-Coder-REAP 25B (Q3_K_M) si falta, Node.js,
# el programa y sus MCPs por defecto, y deja "Agentic.app" y el comando "agentic" listos.
# Todo va al SSD interno del Mac: Aplicaciones, ~/.agentic y ~/.ollama/models
# (los discos externos que se desconectan dejaban Agentic colgado al arrancar).
# Uso: doble clic en este archivo (debe estar junto a la carpeta "agentic").

set -euo pipefail

APP_NAME="Agentic"
DIR_NAME="Agentic UI"   # carpeta en el disco elegido (se mantiene para reutilizar los modelos ya descargados)
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
TMP_DIR=""
trap '[ -n "$TMP_DIR" ] && rm -rf "$TMP_DIR"' EXIT

say()  { echo ""; echo "▶ $*"; }
fail() {
  echo ""; echo "❌ $*"
  osascript -e "display alert \"No se pudo instalar ${APP_NAME}\" message \"$*\" as critical" >/dev/null 2>&1 || true
  exit 1
}
free_gb() { df -k "$1" | awk 'NR==2 {print int($4/1048576)}'; }
# Una copia de Ollama.app es válida si su firma está intacta (descarta copias a medias)
# (en discos exFAT la firma no se puede comprobar; ahí basta con que el binario funcione)
ollama_ok() {
  [ -x "$1/Contents/Resources/ollama" ] || return 1
  codesign -v "$1" >/dev/null 2>&1 && return 0
  [ "$1" != "/Applications/Ollama.app" ] && "$1/Contents/Resources/ollama" -v >/dev/null 2>&1
}

clear
echo "==============================================="
echo "   Instalador de ${APP_NAME}"
echo "==============================================="

[ "$(uname)" = "Darwin" ] || fail "Este instalador es solo para macOS."
[ -f "$SRC_DIR/agentic/cli.js" ] || fail "No encuentro la carpeta agentic junto al instalador ($SRC_DIR)."

case "$(uname -m)" in
  arm64)  NODE_ARCH="arm64" ;;
  x86_64) NODE_ARCH="x64" ;;
  *) fail "Arquitectura no soportada: $(uname -m)" ;;
esac

# Limpiar una copia de Ollama a medias de un intento anterior (libera espacio)
if [ -d /Applications/Ollama.app ] && ! ollama_ok /Applications/Ollama.app; then
  echo "   Borrando una copia incompleta de Ollama en Aplicaciones…"
  rm -rf /Applications/Ollama.app || true
fi

# ---------------------------------------------------------------------------
# 1. Modelo único: Qwen3-Coder 30B (Q4_K_M, unos 18.6 GB).
# ---------------------------------------------------------------------------
MODEL="qwen3-coder:30b"
MODEL_GB=19
echo ""
echo "   Modelo: $MODEL"
NEED_GB=$((MODEL_GB + 2))   # modelo + Ollama, Node.js y dependencias

# ---------------------------------------------------------------------------
# 2. Siempre en el SSD interno del Mac
# ---------------------------------------------------------------------------
BASE="/Applications"
APP_PATH="/Applications/${APP_NAME}.app"
OLLAMA_APP="/Applications/Ollama.app"
MODELS_DIR=""                      # carpeta por defecto de Ollama (~/.ollama/models)
DATA_DIR="$HOME/.agentic"          # configuración, MCPs y Skills
[ -w /Applications ] || fail "Tu usuario no puede escribir en Aplicaciones. Usa una cuenta de administrador."
echo "   Instalando en: $BASE"

# Si el modelo ya está descargado en esa carpeta de modelos, no cuenta su tamaño
[ -f "$HOME/.ollama/models/manifests/registry.ollama.ai/library/qwen3-coder/30b" ] && NEED_GB=2
FREE=$(free_gb "$BASE")
[ "$FREE" -ge "$NEED_GB" ] || fail "No hay espacio suficiente en $BASE: hay ${FREE} GB libres y hacen falta unos ${NEED_GB} GB. Libera espacio o elige otro disco."

# Archivos temporales en el mismo disco de destino
TMP_DIR="$BASE/.agentic-ui-tmp"
rm -rf "$TMP_DIR"; mkdir -p "$TMP_DIR"

# ---------------------------------------------------------------------------
# 3. Ollama
# ---------------------------------------------------------------------------
say "Comprobando Ollama…"
if ollama_ok "$OLLAMA_APP"; then
  echo "   Ollama ya está instalado."
else
  rm -rf "$OLLAMA_APP"
  echo "   Descargando Ollama…"
  curl -fL --progress-bar -o "$TMP_DIR/Ollama.zip" "https://ollama.com/download/Ollama-darwin.zip" \
    || curl -fL --progress-bar -o "$TMP_DIR/Ollama.zip" "https://github.com/ollama/ollama/releases/latest/download/Ollama-darwin.zip" \
    || fail "No se pudo descargar Ollama. Revisa tu conexión a internet."
  mkdir -p "$TMP_DIR/ollama"
  ditto -x -k "$TMP_DIR/Ollama.zip" "$TMP_DIR/ollama" || fail "No se pudo descomprimir Ollama (¿falta espacio?)."
  mv "$TMP_DIR/ollama/Ollama.app" "$OLLAMA_APP" || fail "No se pudo copiar Ollama a $(dirname "$OLLAMA_APP")."
  ollama_ok "$OLLAMA_APP" || fail "La copia de Ollama ha quedado incompleta."
  echo "   Ollama instalado en $(dirname "$OLLAMA_APP")."
fi
OLLAMA_BIN="$OLLAMA_APP/Contents/Resources/ollama"

# ---------------------------------------------------------------------------
# 4. Crear la app (abre Agentic en Terminal)
# ---------------------------------------------------------------------------
say "Creando ${APP_NAME}.app…"
# Quitar la versión anterior con interfaz web (Agentic UI.app)
pkill -f "Agentic UI.app/Contents/" 2>/dev/null || true
rm -rf "/Applications/Agentic UI.app" "$BASE/Agentic UI.app" 2>/dev/null || true
rm -rf "$APP_PATH"
[ "$APP_PATH" != "/Applications/${APP_NAME}.app" ] && rm -rf "/Applications/${APP_NAME}.app" 2>/dev/null || true

# El lanzador abre un .command con "open -a Terminal": no necesita el permiso
# de Automatización (enviar eventos Apple a Terminal).
cat > "$TMP_DIR/launcher.applescript" <<'OSA'
on run
  set cmdFile to (POSIX path of (path to me)) & "Contents/Resources/Agentic.command"
  do shell script "open -a Terminal " & quoted form of cmdFile
end run
OSA
osacompile -o "$APP_PATH" "$TMP_DIR/launcher.applescript" || fail "No se pudo crear la app."
/usr/libexec/PlistBuddy -c "Set :CFBundleName ${APP_NAME}" "$APP_PATH/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string com.llmfantasy.agentic" "$APP_PATH/Contents/Info.plist" 2>/dev/null || true

RES="$APP_PATH/Contents/Resources"
mkdir -p "$RES/bin"
cat > "$RES/Agentic.command" <<'SH'
#!/bin/bash
cd ~/Documents 2>/dev/null || cd ~
clear
exec "$(dirname "$0")/bin/agentic"
SH
chmod +x "$RES/Agentic.command"

# start-ollama.sh: arranca Ollama con la carpeta de modelos elegida.
#   start-ollama.sh reiniciar -> reinicia Ollama aunque ya esté en marcha
{
  echo '#!/bin/bash'
  printf 'OLLAMA_APP=%q\nMODELS_DIR=%q\nMODEL=%q\n' "$OLLAMA_APP" "$MODELS_DIR" "$MODEL"
  cat <<'SH'
RES="$(cd "$(dirname "$0")" && pwd)"
OLLAMA_BIN="$OLLAMA_APP/Contents/Resources/ollama"
ollama_up() { curl -fs -o /dev/null http://localhost:11434/api/version; }
has_model() { curl -fs http://localhost:11434/api/tags | grep -q "\"name\":\"$MODEL"; }

[ -x "$OLLAMA_BIN" ] || { echo "ERROR: No encuentro Ollama en $OLLAMA_APP. ¿Está conectado el disco?"; exit 0; }
if [ -n "$MODELS_DIR" ]; then
  [ -d "$MODELS_DIR" ] || { echo "ERROR: No encuentro la carpeta de modelos $MODELS_DIR. ¿Está conectado el disco?"; exit 0; }
  # Si hay un Ollama corriendo con otra carpeta de modelos, reiniciarlo con la nuestra
  if ollama_up && { [ "${1:-}" = "reiniciar" ] || ! has_model || [ ! -f "$RES/.ollama-config-v5" ]; }; then
    osascript -e 'quit app "Ollama"' >/dev/null 2>&1; pkill -x ollama; sleep 2
  fi
  if ! ollama_up; then
    touch "$RES/.ollama-config-v5"
    OLLAMA_MODELS="$MODELS_DIR" OLLAMA_LOAD_TIMEOUT=40m OLLAMA_KEEP_ALIVE=4h OLLAMA_DEBUG=1 OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 nohup "$OLLAMA_BIN" serve > "$RES/ollama.log" 2>&1 < /dev/null &
  fi
else
  # Ollama con su carpeta normal (~/.ollama/models) y ajustes para un solo modelo grande;
  # si había uno en marcha de otra instalación (p. ej. con los modelos en un disco externo), se reinicia
  if ollama_up && { [ "${1:-}" = "reiniciar" ] || [ ! -f "$RES/.ollama-config-v7" ]; }; then
    osascript -e 'quit app "Ollama"' >/dev/null 2>&1; pkill -x ollama; sleep 2
  fi
  if ! ollama_up; then
    touch "$RES/.ollama-config-v7"
    OLLAMA_LOAD_TIMEOUT=40m OLLAMA_KEEP_ALIVE=4h OLLAMA_DEBUG=1 OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 OLLAMA_NUM_PARALLEL=1 OLLAMA_MAX_LOADED_MODELS=1 nohup "$OLLAMA_BIN" serve > "$RES/ollama.log" 2>&1 < /dev/null &
  fi
fi
for _ in $(seq 1 60); do ollama_up && break; sleep 0.5; done
ollama_up || echo "ERROR: Ollama no ha arrancado."
exit 0
SH
} > "$RES/start-ollama.sh"
chmod +x "$RES/start-ollama.sh"

# Comando "agentic"
{
  echo '#!/bin/bash'
  printf 'export AGENTIC_HOME=%q\nexport MODEL=%q\n' "$DATA_DIR" "$MODEL"
  cat <<'SH'
SELF="$0"; while [ -L "$SELF" ]; do SELF="$(readlink "$SELF")"; done
RES="$(cd "$(dirname "$SELF")/.." && pwd)"
OUT="$(bash "$RES/start-ollama.sh")"
[ -n "$OUT" ] && echo "  ${OUT#ERROR: }"
exec "$RES/node/bin/node" "$RES/app/cli.js" "$@"
SH
} > "$RES/bin/agentic"
chmod +x "$RES/bin/agentic"

# ---------------------------------------------------------------------------
# 5. Arrancar Ollama y descargar el modelo
# ---------------------------------------------------------------------------
say "Arrancando Ollama…"
OUT=$(bash "$RES/start-ollama.sh" reiniciar)
case "$OUT" in ERROR:*) fail "${OUT#ERROR: }" ;; esac
echo "   Ollama funcionando."

if curl -fs http://localhost:11434/api/tags | grep -qF "\"name\":\"$MODEL\""; then
  say "El modelo $MODEL ya está descargado."
else
  say "Descargando el modelo $MODEL de Ollama (unos 19 GB, puede tardar un rato)…"
  "$OLLAMA_BIN" pull "$MODEL" || fail "No se pudo descargar el modelo $MODEL."
fi

# ---------------------------------------------------------------------------
# 6. Node.js, el programa y los MCPs por defecto dentro de la app
# ---------------------------------------------------------------------------
say "Descargando Node.js (incluido dentro de la app)…"
NODE_FILE=$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | awk -v a="darwin-${NODE_ARCH}.tar.gz" '$2 ~ a"$" {print $2}')
[ -n "$NODE_FILE" ] || fail "No se pudo encontrar Node.js para descargar."
curl -fL --progress-bar -o "$TMP_DIR/node.tar.gz" "https://nodejs.org/dist/latest-v22.x/$NODE_FILE" \
  || fail "No se pudo descargar Node.js."
mkdir -p "$RES/node"
tar -xzf "$TMP_DIR/node.tar.gz" -C "$RES/node" --strip-components=1 || fail "No se pudo descomprimir Node.js (¿falta espacio?)."

say "Instalando Agentic y sus MCPs (archivos, razonamiento y memoria)…"
mkdir -p "$RES/app"
cp -R "$SRC_DIR/agentic/." "$RES/app/"
rm -rf "$RES/app/node_modules"
(
  cd "$RES/app"
  export PATH="$RES/node/bin:$PATH"
  npm install --omit=dev --no-fund --no-audit
) || fail "Falló la instalación de las dependencias."

# Primera puesta en marcha: crea la configuración, MCPs y Skills por defecto
mkdir -p "$DATA_DIR"
if [ -f "$DATA_DIR/config.json" ]; then
  "$RES/node/bin/node" -e 'const f=process.argv[1];const c=JSON.parse(require("fs").readFileSync(f));c.model=process.argv[2];require("fs").writeFileSync(f,JSON.stringify(c,null,2)+"\n")' "$DATA_DIR/config.json" "$MODEL"
fi

# Comando "agentic" disponible en cualquier terminal
LINE="agentic() { bash \"$RES/bin/agentic\" \"\$@\"; }  # agentic"
for RC in "$HOME/.zshrc" "$HOME/.bash_profile"; do
  [ -f "$RC" ] || [ "$RC" = "$HOME/.zshrc" ] || continue
  touch "$RC"
  grep -v '# agentic$' "$RC" > "$TMP_DIR/rc" || true
  echo "$LINE" >> "$TMP_DIR/rc"
  cat "$TMP_DIR/rc" > "$RC"
done

touch "$APP_PATH"

echo ""
echo "==============================================="
echo "✅ ¡Listo! ${APP_NAME} está instalado."
echo "   App:     $APP_PATH"
[ -n "$MODELS_DIR" ] && echo "   Modelos: $MODELS_DIR"
echo "   Datos:   $DATA_DIR (config, MCPs y Skills)"
echo "   Modelo:  $MODEL"
echo ""
echo "   Ábrelo desde Aplicaciones, o escribe 'agentic' en una"
echo "   terminal nueva dentro de la carpeta en la que quieras trabajar."
echo "==============================================="

osascript -e "display dialog \"${APP_NAME} se ha instalado con el modelo ${MODEL}. ¿Abrirlo ahora?\" buttons {\"Más tarde\", \"Abrir\"} default button \"Abrir\" with title \"${APP_NAME}\"" -e 'button returned of result' 2>/dev/null | grep -q Abrir \
  && open "$APP_PATH"
exit 0
