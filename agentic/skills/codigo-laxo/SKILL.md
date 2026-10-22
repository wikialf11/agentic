---
name: codigo-laxo
description: Úsala con archivos .laxo (código escrito a mano alzada: pseudocódigo, español, erratas) o cuando el usuario pida compilar, regenerar, cambiar, ver o ejecutar código laxo. Lista las únicas órdenes que se usan para trabajar con él.
cargar-si: \.laxo\b|c[oó]digo laxo|compilar_laxo|/compilar|semilla
---

# Código laxo

> **Notas para Agentic**: skill escrita para Agentic. Funciona como un generador de imágenes (ComfyUI): la fuente es el "prompt", cada compilación genera varias candidatas con semillas distintas, un filtro determinista (sintaxis + pruebas) descarta las malas y el usuario elige una. La receta elegida (semilla, modelo, temperatura, modo) queda guardada y repetirla da exactamente el mismo código.

## Regla principal

La **fuente** es el archivo `<destino>.laxo` (p. ej. `app.js.laxo` → genera `app.js`; `datos.py.laxo` → `datos.py`). El archivo generado **no se edita nunca a mano**: cualquier cambio va a la fuente y se vuelve a compilar. Para trabajar con código laxo usa **solo** estas órdenes, con esta sintaxis exacta. No improvises comandos (ni `node app.js`, ni editar_archivo sobre el generado).

## Órdenes

| Qué | Herramienta (agente) | Comando (usuario) |
|---|---|---|
| Ver qué fuentes hay y su estado | `ver_laxo` con cada ruta, o pide al usuario `/laxo` | `/laxo` |
| Generar candidatas y que el usuario elija | `compilar_laxo {ruta, semillas?}` | `/compilar <archivo.laxo> [semillas N]` |
| Repetir exactamente una versión | `compilar_laxo {ruta, semilla}` | `/compilar <archivo.laxo> semilla S` |
| Pedir un cambio | `reescribir_laxo {ruta, cambio}` | `/reescribir <archivo.laxo> <cambio en una frase>` |
| Ver fuente, receta elegida y código | `ver_laxo {ruta}` | `/ver <archivo.laxo>` |
| Ejecutar la versión elegida | `ejecutar_laxo {ruta, argumentos?}` | `/ejecutar <archivo.laxo> [args]` |
| Ajustes | — | `/laxo modo estructurado\|texto` · `/laxo semillas N` · `/laxo temperatura T` |

## Cómo se escribe una fuente

Libre: pseudocódigo, español, mezcla de lenguajes. Tres tipos de línea tienen significado fijo:

- `prueba: media([2,4,6]) == 4` → prueba obligatoria. Pon al menos una por función importante: es lo que decide qué candidatas valen.
- `cambio: …` → un cambio pedido después (lo añade `reescribir_laxo`).
- `programa: …` → qué hace al ejecutarse.

## Qué hacer según el resultado

- **Ninguna candidata pasa**: la fuente es ambigua. Añade o aclara líneas `prueba:` (con el resultado exacto esperado) y vuelve a compilar; no edites el generado.
- **`ejecutar_laxo` dice que la fuente o el código han cambiado**: compila otra vez (o con la misma `semilla` para restaurar el código elegido).
- **El usuario no elige ninguna**: no insistas; pregúntale qué quiere distinto y usa `reescribir_laxo`.
- **Modo estructurado** (JS y Python, por defecto): el modelo rellena un esquema y Agentic escribe el código, así que no hay errores de sintaxis; solo admite lo que el esquema puede expresar (funciones, listas, objetos, bucles, condiciones y las funciones integradas). Para programas que necesitan módulos (fs, red, Electron…) el usuario puede usar `/laxo modo texto`, donde el modelo escribe el código y la comprobación de sintaxis y las pruebas siguen filtrando.
