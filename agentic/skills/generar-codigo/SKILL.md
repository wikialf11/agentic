---
name: generar-codigo
description: Úsala al crear un programa o proyecto nuevo, o al crear o cambiar archivos de código (.js, .py, .sh, .html, .json) o cuando el usuario pida generar un programa, otra semilla, más candidatas, ver o ejecutar un archivo generado. Lista las únicas órdenes que se usan para ello.
cargar-si: /crear|crear_proyecto|/generar|generar_archivo|semilla|candidata|crea (un|una) (programa|script|funci[oó]n|app)|genera
---

# Generar código como una imagen

> **Notas para Agentic**: skill escrita para Agentic. Idea del usuario, al estilo ComfyUI: la **instrucción** es el prompt; cada generación saca varias **candidatas** con **semillas** distintas; un filtro (sintaxis + pruebas) descarta las malas; el usuario elige una. Se guardan la instrucción, la semilla y el resultado, así que se puede reutilizar y comprobar sin volver a generar, y la misma instrucción con la misma semilla da exactamente el mismo archivo.

## Regla principal

Si el usuario describe un programa o app **nuevo**, llama a `crear_proyecto` con su descripción completa: Agentic piensa el plan (archivos, instrucción detallada de cada uno, pruebas), el usuario lo aprueba y se genera archivo a archivo. Para un archivo suelto de código **nuevo**, escribe tú la instrucción (es tu razonamiento hecho orden) y llama a `generar_archivo`. No lo escribas con `escribir_archivo`. Un archivo generado **no se edita a mano**: los cambios van con `cambiar_generado`. Usa solo estas órdenes, con esta sintaxis exacta.

## Órdenes

| Qué | Herramienta (agente) | Comando (usuario) |
|---|---|---|
| Proyecto completo desde una descripción | `crear_proyecto {descripcion}` | `/crear <descripción>` (y `/crear seguir` si se paró) |
| Generar un archivo: candidatas y que el usuario elija | `generar_archivo {ruta, instruccion, semillas?}` | `/generar <archivo> <instrucción> [semillas N]` |
| Repetir exactamente un resultado | `generar_archivo {ruta, instruccion, semilla}` | `/generar <archivo> semilla S` (usa la instrucción guardada) |
| Pedir un cambio | `cambiar_generado {ruta, cambio}` | `/cambiar <archivo> <cambio>` |
| Ver instrucción, receta y repasar pruebas | `ver_generado {ruta}` | `/ver <archivo>` |
| Ejecutar el resultado elegido | `ejecutar_generado {ruta, argumentos?}` | `/ejecutar <archivo> [args]` |
| Lista y ajustes | — | `/generados` · `/generados semillas N` · `/generados temperatura T` |

## Cómo escribir una buena instrucción

- Qué hace el archivo, nombres de funciones, qué reciben y qué devuelven, qué imprime al ejecutarse.
- Al menos una línea `prueba: expresión == resultado` por función importante (p. ej. `prueba: media([2,4,6]) == 4`). Las pruebas son el filtro: sin ellas, cualquier candidata con sintaxis correcta pasa.
- Un archivo por instrucción. Si el programa tiene varios archivos, genera primero los que no dependen de otros.

## Según el resultado

- **Ninguna candidata pasa**: la instrucción es ambigua o una prueba está mal. Concrétala o corrige la prueba y genera otra vez; no escribas el archivo a mano.
- **El usuario no elige ninguna**: pregúntale qué quiere distinto y usa `cambiar_generado`.
- **`ejecutar_generado` dice que el archivo ha cambiado**: `generar_archivo` con la misma `semilla` lo restaura sin volver a generar.
