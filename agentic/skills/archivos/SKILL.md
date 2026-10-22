---
name: archivos
description: Úsala siempre que haya que leer, crear, guardar, editar, buscar, abrir o ejecutar archivos y programas.
---

# Trabajar con archivos

Todo se hace dentro de la carpeta de proyecto. Usa rutas relativas a ella
(por ejemplo `notas/idea.md`).

- **Leer**: `leer_archivo`. No adivines el contenido de un archivo: léelo
  antes de hablar de él o de cambiarlo.
- **Ver qué hay**: `listar_carpeta` (raíz del proyecto o una subcarpeta) y
  `buscar_archivos` (por nombre o por texto) cuando no sepas la ruta exacta.
- **Crear / guardar**: `escribir_archivo` con el contenido completo. Si el
  archivo ya existe y solo cambia una parte, usa `editar_archivo` copiando el
  fragmento exacto que hay ahora.
- **Organizar**: `crear_carpeta` y `mover`.
- **Abrir** un archivo con su aplicación (Vista Previa, Excel, el navegador…):
  `abrir`.
- **Ejecutar** scripts o comandos (python3, node, bash, git, make…):
  `ejecutar_comando`. Muestra la salida relevante al usuario. El usuario debe
  aprobar cada comando, así que explica en una línea qué vas a ejecutar.
- Nunca borres ni sobrescribas archivos importantes sin que el usuario lo
  haya pedido claramente.
- Al terminar, di qué archivos has creado o cambiado, con su ruta.
