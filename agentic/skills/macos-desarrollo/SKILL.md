---
name: macos-desarrollo
description: Úsala al programar, instalar o ejecutar cosas en macOS, y SIEMPRE ante errores típicos del Mac: EPERM / Operation not permitted, permisos de privacidad, "app dañada", xcrun / Command Line Tools, Homebrew, Apple Silicon (arm64) vs Intel, python externally-managed, puertos ocupados, discos externos, diferencias de sed/grep/date de macOS.
cargar-si: eperm|operation not permitted|xcrun|xcode-select|command line tools|homebrew|\bbrew\b|externally.managed|\barm64\b|x86_64|rosetta|incompatible architecture|wrong architecture|\.dylib|gatekeeper|quarantine|dañad|damaged|developer cannot be verified|codesign|notari|invalid command code|illegal option|address already in use|eaddrinuse|airplay|command not found|launchctl|\.plist|/volumes/|exfat|enospc|no space left
sistema: darwin
---

# Programar en macOS sin pelearse con el sistema

> **Notas para Agentic**: skill escrita para Agentic (macOS en Mac con Apple Silicon). Los archivos de apoyo se leen con `usar_skill` + `archivo`:
> - `herramientas-bsd.md`: comandos que en el Mac funcionan distinto que en Linux (sed, grep, date, stat, find…).
> - `diagnostico.md`: comandos para averiguar el estado del Mac antes de arreglar nada.

## Regla de oro

Antes de arreglar un error "raro", **confirma en qué Mac estás** y no supongas Linux:

```bash
sw_vers; uname -m; echo $SHELL; which -a node python3 brew; node -p process.arch 2>/dev/null
```

`uname -m` = `arm64` es Apple Silicon (M1–M4). Si `node -p process.arch` dice `x64` en un Mac arm64, Node está corriendo bajo Rosetta y compilará módulos para Intel (fuente de errores de arquitectura).

## Errores típicos: causa → arreglo

| Error | Causa real en Mac | Qué hacer |
|---|---|---|
| `EPERM` / `Operation not permitted` en `~/Documents`, `~/Desktop`, `~/Downloads` o un disco externo, aunque los permisos (`ls -l`) estén bien | Privacidad de macOS (TCC): la app Terminal no tiene acceso a esa carpeta | No cambies permisos con chmod/sudo (no sirve). Di al usuario: **Ajustes del Sistema → Privacidad y seguridad → Acceso total al disco → activar Terminal** (y cerrar y abrir Terminal). Después repite el comando |
| `xcrun: error: invalid active developer path` o `gyp ERR!` / `make: not found` / `clang: not found` | Faltan las Command Line Tools de Xcode (pasa también tras actualizar macOS) | `xcode-select --install` (abre una ventana; el usuario pulsa Instalar). Comprueba con `xcode-select -p` |
| `zsh: command not found: brew` en Apple Silicon | Homebrew está en `/opt/homebrew` y no en el PATH | `eval "$(/opt/homebrew/bin/brew shellenv)"` y añadir esa línea a `~/.zprofile` |
| `error: externally-managed-environment` al hacer `pip install` | Python de Homebrew (PEP 668) no deja instalar paquetes globales | Usa un entorno virtual en el proyecto: `python3 -m venv .venv && .venv/bin/pip install paquete`; ejecuta con `.venv/bin/python`. No uses `--break-system-packages` |
| `python: command not found` | En macOS solo existe `python3` | Usa `python3` y `python3 -m pip` |
| `incompatible architecture (have 'x86_64', need 'arm64')` o `wrong architecture` | Mezcla Intel/Apple Silicon (módulo nativo compilado con un Node o Python de Rosetta) | Usa Node/Python arm64 (`node -p process.arch` → `arm64`), borra `node_modules` y reinstala; para Electron, recompila (skill electron-mac) |
| `"X" está dañado y no se puede abrir` / `cannot be opened because the developer cannot be verified` | Gatekeeper: la app o binario viene de internet sin firmar ni notarizar (atributo de cuarentena) | Si es del usuario y confía en ella: `xattr -dr com.apple.quarantine "/ruta/App.app"`; si además es una app propia sin firma: `codesign --force --deep --sign - "/ruta/App.app"` (firma local ad-hoc) |
| `EADDRINUSE` / `address already in use` en el puerto 5000 o 7000 | En macOS esos puertos los usa el **Receptor AirPlay** | Usa otro puerto (p. ej. 5050, 8000). Para ver quién usa un puerto: `lsof -nP -iTCP:PUERTO -sTCP:LISTEN` |
| `sed: 1: "...": invalid command code` / `illegal option` en grep/date/stat/find | Las herramientas del Mac son BSD, no GNU | Usa la forma de macOS (ver `herramientas-bsd.md`) o mejor escribe el cambio con editar_archivo / un script de Node o Python |
| `EPERM ... symlink` o `npm ERR! code ENOTSUP` en un disco externo; archivos raros `._algo` | Disco externo en exFAT/FAT: no admite enlaces simbólicos ni permisos Unix y macOS crea archivos `._*` | Para npm: `npm install --no-bin-links` (o el proyecto en el disco interno). Limpia `._*` con `dot_clean -m carpeta`; excluye `._*` de builds y de lecturas de archivos |
| `ENOSPC` / `No space left on device` | Disco lleno (cachés de npm, Electron, Homebrew) | Mira `df -h /` y libera: `npm cache clean --force`, `brew cleanup`, `rm -rf ~/Library/Caches/electron ~/Library/Caches/electron-builder` (pide permiso antes de borrar). Para no volver a llenar el disco interno: `export npm_config_cache=/Volumes/DISCO/.npm` y `export ELECTRON_CACHE=/Volumes/DISCO/.electron` |

## Rutas y nombres en Mac

- **Las rutas con espacios son lo normal** (`~/Documents/MI PROYECTO`, `Application Support`): pon SIEMPRE comillas `"…"` en los comandos. Un error de "No such file" con una ruta con espacios suele ser falta de comillas.
- El sistema de archivos no distingue mayúsculas: `App.js` y `app.js` son el mismo archivo. Un `import './App'` mal escrito funciona en el Mac y falla en Linux; escribe los nombres exactamente. Para renombrar solo mayúsculas en git: `git mv app.js App.js`.
- Datos de una app del usuario: `~/Library/Application Support/<App>`; cachés: `~/Library/Caches`; logs: `~/Library/Logs`. Nunca guardes datos dentro de un `.app`.
- Un `.app` es una carpeta: el ejecutable está en `App.app/Contents/MacOS/`. Para ver los errores de una app que "no abre", ejecútalo desde la terminal: `"/ruta/App.app/Contents/MacOS/App"`.

## Shell

- La shell es **zsh**: configuración en `~/.zshrc` (terminales) y `~/.zprofile` (PATH al iniciar). `/bin/bash` es la versión 3.2 de 2007: sin arrays asociativos ni `${var,,}`; en scripts usa `#!/usr/bin/env bash` con sintaxis simple o `#!/bin/zsh`.
- Tras cambiar `~/.zshrc`, la terminal abierta no lo ve: `source ~/.zshrc` o abrir una nueva.
- `sudo` pide la contraseña del usuario en la terminal; no la pidas por el chat ni la escribas tú.

## Herramientas útiles del Mac

`open archivo|carpeta|URL` (abrir con la app por defecto), `open -a "App" archivo`, `pbcopy`/`pbpaste` (portapapeles), `osascript -e '…'` (AppleScript: notificaciones, diálogos), `mdfind` (buscar con Spotlight), `caffeinate -i comando` (que no se duerma en tareas largas), `say`, `defaults read/write`, `plutil -lint archivo.plist`, `log show --last 5m --predicate 'process == "App"'` (logs del sistema), `sysctl hw.memsize` y `vm_stat` (memoria).

## Antes de dar algo por arreglado en el Mac

1. Repite el comando exacto que fallaba y lee la salida (no supongas).
2. Si el arreglo depende de algo que solo el usuario puede hacer (Acceso total al disco, instalar Command Line Tools, contraseña de sudo), díselo en una línea clara con los pasos exactos y sigue con lo que no dependa de eso.
