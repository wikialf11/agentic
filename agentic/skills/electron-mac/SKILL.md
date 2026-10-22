---
name: electron-mac
description: Úsala al crear, ejecutar, empaquetar (.app / .dmg) o arreglar apps Electron en macOS: electron-builder, módulos nativos (sqlite3, better-sqlite3), NODE_MODULE_VERSION, Cannot find module en la app empaquetada, app que no abre o "dañada", firma y notarización, permisos de archivos, menús y ventanas del Mac.
cargar-si: electron|\.dmg\b|empaquet|install-app-deps|node_module_version|node-gyp|gyp err|asar|better-sqlite3|sqlite3|notarytool|electron-builder
sistema: darwin
---

# Apps Electron en macOS

> **Notas para Agentic**: skill escrita para Agentic. Archivo de apoyo (léelo con `usar_skill` + `archivo`): `package-json-ejemplo.md` (package.json completo para empaquetar en Mac). Para errores generales del Mac (permisos, Command Line Tools, Homebrew, arm64) usa también la skill macos-desarrollo.

## Antes de tocar nada

```bash
cat package.json; ls; node -v; node -p process.arch; npx electron --version
```

Comprueba: `main` apunta a un archivo que existe; `electron` y `electron-builder` están en **devDependencies**; todo lo que usa la app al ejecutarse (sqlite3, etc.) está en **dependencies** (lo de devDependencies NO se mete en la app empaquetada).

## Errores típicos: causa → arreglo

| Error | Causa | Arreglo |
|---|---|---|
| `Cannot find module 'X'` al ejecutar `npm start` | No está instalado, o la instalación falló a medias (mira si hubo `gyp ERR!` antes) | `npm install X --save`; si sale `gyp ERR!`, faltan las Command Line Tools: `xcode-select --install` |
| `Cannot find module 'X'` solo en la **app empaquetada** | `X` está en devDependencies, o `build.files` no incluye su carpeta/archivo | Muévelo a dependencies (`npm install X --save`); revisa `build.files`; vuelve a empaquetar |
| `was compiled against a different Node.js version using NODE_MODULE_VERSION N` | Módulo nativo compilado para el Node del sistema y no para el de Electron (típico con better-sqlite3) | `npx electron-builder install-app-deps` (o `npx @electron/rebuild`). Añade `"postinstall": "electron-builder install-app-deps"` a scripts para que no vuelva a pasar |
| `incompatible architecture` / `wrong architecture` con un `.node` | Módulo compilado para x64 y la app es arm64 (o al revés) | Comprueba `node -p process.arch` = arm64; borra `node_modules`, `npm install`, `npx electron-builder install-app-deps`; empaqueta con `--arm64` (o `--universal` solo si todos los módulos nativos lo soportan) |
| `Package "electron" is only allowed in "devDependencies"` / `Cannot compute electron version` | electron mal colocado o sin instalar | `npm install electron --save-dev` |
| La app empaquetada se abre y se cierra, o pantalla en blanco | Error en el proceso principal o ruta de archivo mal resuelta | Ejecútala desde la terminal para ver el error: `"dist/mac-arm64/NOMBRE.app/Contents/MacOS/NOMBRE"`; para la ventana, abre DevTools (`win.webContents.openDevTools()`) |
| `EROFS` / no guarda datos / la base de datos se pierde | Escribe dentro de la app (`__dirname` está dentro de `app.asar`, solo lectura) | Guarda datos en `app.getPath('userData')` (`~/Library/Application Support/NOMBRE`): p. ej. `path.join(app.getPath('userData'), 'datos.db')` |
| `"NOMBRE" está dañado y no se puede abrir` | App sin firmar descargada o copiada con cuarentena, o firma rota tras modificar el .app | `xattr -dr com.apple.quarantine "NOMBRE.app"` y si sigue: `codesign --force --deep --sign - "NOMBRE.app"` (firma local). Para repartirla a otros Macs sin este aviso hace falta Developer ID y notarización (cuenta de Apple Developer de pago) |
| Empaquetar falla buscando certificados / `skipped macOS application code signing` | No hay certificado de Developer ID (lo normal en uso personal) | No es un error si solo es para este Mac. Para que no lo busque: `"mac": { "identity": null }` o `CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist` |
| `ENOSPC` / sin espacio al empaquetar | Las cachés de Electron (~100 MB por versión) y de electron-builder llenan el disco interno | `export ELECTRON_CACHE=/Volumes/DISCO/cache/electron ELECTRON_BUILDER_CACHE=/Volumes/DISCO/cache/electron-builder` antes de `npm install` / `npm run dist` |

## build.json / bloque "build": errores que ya han pasado

En el Buscador de Archivos de Alfonso, el único archivo que hubo que corregir a mano fue `build.json`:
- El mismo bloque `dmg` pegado varias veces (JSON roto): escribe el archivo **entero** y válido de una vez; nunca añadas bloques con ediciones sueltas.
- `"files"` con carpetas que no existían (`public`): pon solo los archivos reales que usa la app (o quita `files`).
- `"dmg.license": "build/license.rtf"` sin que existiera el archivo: no pongas licencia, icono ni fondo si no existen.
- `"directories.output": "dist/mac-arm64"`: usa `"dist"`; electron-builder crea `mac-arm64/` dentro.
- Bloques que no hacen falta en Mac (`"linux"`), `"filesystem": "HFS+"` o `iconSize`: déjalos fuera. Cuanto más corto, menos falla.

Uno que funciona (el que se usó al final):
```json
{
  "appId": "com.usuario.miapp",
  "productName": "Mi App",
  "directories": { "output": "dist" },
  "files": ["index.js", "preload.js", "index.html", "renderer.js", "package.json", "!**/._*"],
  "mac": { "target": [{ "target": "dmg", "arch": ["arm64"] }], "category": "public.app-category.utilities", "identity": null },
  "dmg": { "title": "Mi App", "contents": [{ "x": 130, "y": 220, "type": "file" }, { "x": 410, "y": 220, "type": "link", "path": "/Applications" }] }
}
```

## sqlite en Electron

- **sqlite3** (paquete `sqlite3` 5.x y 6.x) usa N-API y binarios precompilados: normalmente funciona sin recompilar. Si falla al instalar → Command Line Tools; si falla al abrir → `npx electron-builder install-app-deps`.
- **better-sqlite3** es más rápido y síncrono pero **siempre** hay que recompilarlo para Electron (`install-app-deps` en postinstall).
- La base de datos va en `app.getPath('userData')`, nunca junto al código. Crea la carpeta si no existe.
- Úsala desde el proceso principal y pásale los datos a la ventana por IPC (`ipcMain.handle` / `ipcRenderer.invoke` con preload y `contextBridge`); con `contextIsolation: true` la ventana no puede hacer `require`.

## Empaquetar (.app / .dmg) paso a paso

1. `package.json` con `main`, `scripts.start = "electron ."`, `scripts.dist = "electron-builder --mac"` y bloque `build` (ver `package-json-ejemplo.md`).
2. `npm install --save-dev electron electron-builder` y `npm install` del resto.
3. `npm start` funciona → luego `npm run dist`.
4. Resultado en `dist/` (o en `build.directories.output`): `mac-arm64/NOMBRE.app` y `NOMBRE-x.y.z-arm64.dmg`.
5. **Comprueba** abriendo la app empaquetada desde la terminal (paso de la tabla) y probando la función principal, no solo que se generó el archivo.

## Comportamiento de Mac que hay que respetar

- Cerrar la última ventana no cierra la app en Mac:
  ```js
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  ```
- **Sin menú de aplicación no funcionan Cmd+C / Cmd+V / Cmd+Q** en los campos de texto. No pongas `Menu.setApplicationMenu(null)`; si haces menú propio, incluye `{ role: 'appMenu' }` y `{ role: 'editMenu' }`.
- Acceso a archivos del usuario: macOS pide permiso para Documentos, Escritorio, Descargas y discos externos. Lo más fiable es que el usuario elija la carpeta con `dialog.showOpenDialog({ properties: ['openDirectory'] })` (eso da acceso). Explica el porqué con `build.mac.extendInfo` (`NSDocumentsFolderUsageDescription`, `NSDesktopFolderUsageDescription`, `NSDownloadsFolderUsageDescription`, `NSRemovableVolumesUsageDescription`). Con firma local (ad-hoc), macOS puede volver a pedir los permisos tras cada nuevo empaquetado.
- Para buscar archivos muy rápido en Mac puedes usar Spotlight desde el proceso principal: `execFile('mdfind', ['-onlyin', carpeta, '-name', texto])`; si Spotlight no indexa esa carpeta (p. ej. discos externos excluidos), recorre la carpeta con `fs.promises.readdir` y omite `node_modules`, `.git` y `._*`.
- Icono: `build/icon.icns` (o un `icon.png` de 1024×1024 y electron-builder lo convierte).
