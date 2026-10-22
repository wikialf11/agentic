# Diagnóstico rápido del Mac (antes de arreglar)

Ejecuta lo que haga falta y lee la salida; no supongas.

```bash
# Sistema y arquitectura
sw_vers                        # versión de macOS
uname -m                       # arm64 = Apple Silicon, x86_64 = Intel (o Rosetta)
sysctl -n machdep.cpu.brand_string

# Herramientas y de dónde salen (si hay varias, la primera es la que se usa)
which -a node npm python3 pip3 brew git
node -v; node -p process.arch  # x64 en un Mac arm64 = Node de Rosetta (mal para módulos nativos)
python3 -c "import sys, platform; print(sys.executable, platform.machine())"
xcode-select -p                # error = faltan las Command Line Tools
echo $PATH | tr ':' '\n'

# Disco y memoria
df -h / /Volumes/* 2>/dev/null
diskutil info "/Volumes/NOMBRE" | grep -E "File System|Type"   # exFAT/APFS/HFS
vm_stat | head -5; sysctl -n hw.memsize

# Permisos y privacidad
ls -le "ruta"                  # permisos + ACL
xattr -l "archivo"             # com.apple.quarantine = descargado de internet
codesign -dv --verbose=2 "App.app" 2>&1 | head    # firma de una app
spctl -a -vv "App.app"         # si Gatekeeper la deja abrir

# Procesos y puertos
lsof -nP -iTCP:3000 -sTCP:LISTEN
ps aux | grep -i "[n]ombre"

# Logs de una app o del sistema
log show --last 10m --predicate 'process == "NombreApp"' | tail -50
ls ~/Library/Logs/DiagnosticReports | tail    # informes de cuelgues (.ips)
```

## Cómo leer los resultados

- **EPERM en Documentos/Escritorio/Descargas con permisos correctos** → privacidad (TCC). Solo lo arregla el usuario en Ajustes del Sistema → Privacidad y seguridad → Acceso total al disco → Terminal.
- **Disco externo en exFAT** → sin enlaces simbólicos ni permisos Unix: `npm install --no-bin-links`, cuidado con `._*`.
- **`node -p process.arch` = x64 en Mac arm64** → instalar Node arm64 (nvm o el instalador oficial) y reinstalar `node_modules`.
- **Un `.ips` reciente en DiagnosticReports** → la app se cerró de golpe; el archivo dice qué hilo y librería fallaron.
