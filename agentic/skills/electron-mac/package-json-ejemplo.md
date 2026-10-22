# package.json para una app Electron empaquetada en Mac

Ajusta `name`, `productName`, `appId`, `main` y `files` al proyecto real (mira qué carpetas y archivos usa de verdad). JSON no admite comentarios: no los copies dentro del archivo.

```json
{
  "name": "busqueda-de-archivos",
  "productName": "Búsqueda de Archivos",
  "version": "1.0.0",
  "description": "Buscador de archivos",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "dist": "electron-builder --mac --arm64",
    "postinstall": "electron-builder install-app-deps"
  },
  "dependencies": {
    "sqlite3": "^6.0.1"
  },
  "devDependencies": {
    "electron": "^44.7.0",
    "electron-builder": "^26.15.3"
  },
  "build": {
    "appId": "com.usuario.busquedadearchivos",
    "productName": "Búsqueda de Archivos",
    "directories": { "output": "dist" },
    "files": [
      "main.js",
      "preload.js",
      "src/**/*",
      "index.html",
      "package.json",
      "!**/._*"
    ],
    "mac": {
      "target": ["dmg"],
      "category": "public.app-category.utilities",
      "identity": null,
      "extendInfo": {
        "NSDocumentsFolderUsageDescription": "Para buscar archivos en tu carpeta Documentos.",
        "NSDesktopFolderUsageDescription": "Para buscar archivos en tu Escritorio.",
        "NSDownloadsFolderUsageDescription": "Para buscar archivos en Descargas.",
        "NSRemovableVolumesUsageDescription": "Para buscar archivos en discos externos."
      }
    }
  }
}
```

Notas:
- Las versiones son de ejemplo: comprueba las actuales con `npm view electron version` y `npm view electron-builder version` (o deja que `npm install --save-dev electron electron-builder` ponga las últimas).
- `files`: si no lo pones, electron-builder incluye casi todo el proyecto (menos devDependencies). Si lo pones, cualquier archivo que falte dará `Cannot find module` o pantalla en blanco SOLO en la app empaquetada.
- `"identity": null` = sin firma de Developer ID (uso personal). Para repartirla: certificado Developer ID, `"hardenedRuntime": true`, `"notarize": true` y las variables `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.
- `--arm64` para Apple Silicon; `--x64` para Intel; `--universal` para ambos (todos los módulos nativos deben poder compilarse para ambos).
- Después de `npm run dist`: `open dist` y prueba la app de `dist/mac-arm64/`.
