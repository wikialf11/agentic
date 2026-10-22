# Agentic: guía rápida

Agentic es un agente de programación en español que funciona en la terminal de tu Mac con un modelo local de Ollama (`qwen3-coder:30b`, unos 18,6 GB). Lee y escribe archivos, ejecuta comandos, busca en internet y genera proyectos completos a partir de una descripción. Antes de hacer algo delicado te pide permiso.

## Cómo se abre

- Haz doble clic en **Agentic.app**, que está en `/Volumes/disco/MODELOS/Agentic UI`.
- Desde la terminal, escribe `agentic` para trabajar en la carpeta en la que estés.
- Para abrir un proyecto concreto, escribe `agentic --proyecto "/ruta/a/mi proyecto"`.

Si Ollama no está en marcha, Agentic lo arranca. Todo se instala en el SSD interno del Mac (Aplicaciones, `~/.agentic` y `~/.ollama/models`), así que no depende de ningún disco externo.

## Cómo funciona

1. Escribes lo que quieres en español normal: "arregla el build.json", "explícame este código", "haz un buscador de archivos para Mac".
2. Agentic piensa, hace un plan y trabaja con sus herramientas: leer y guardar archivos, ejecutar comandos, abrir aplicaciones, buscar en internet, descargar y usar su memoria.
3. Por defecto está en **modo autónomo**: sigue trabajando hasta acabar y solo se detiene para pedirte permisos. Puedes escribirle en cualquier momento para corregirlo.
4. Antes de modificar un archivo guarda una copia en `.agentic/copias`.
5. Las **skills** son guías que carga automáticamente según el tema, por ejemplo `electron-mac`, `generar-codigo` o `systematic-debugging`.

### Crear un programa a partir de una descripción

- **`/crear <descripción>`**: el agente piensa el proyecto y te enseña un plan: los archivos, para qué sirve cada uno y cómo se arranca. Mientras lo piensa ves en directo su **💭 Razonamiento del arquitecto** en español; si el modelo piensa en inglés, se traduce. Así ves en qué se equivoca y lo puedes corregir. Luego eliges:
  - `[s]` lo hace.
  - `[v]` ves qué hará cada archivo.
  - `[r]` vuelves a ver el razonamiento.
  - `[c]` cambias el plan.
  - `[n]` lo cancelas.
- Cuando dices que sí, el agente escribe él mismo cada archivo, como siempre, con su pensamiento visible. Si el programa usa librerías (por ejemplo `bs4` en Python), las instala antes de probar. Después lo ejecuta y arregla lo que falle.
- El plan se guarda en `.agentic/proyecto.json`.
- No hace falta usar `/crear`: también puedes pedírselo con tus palabras.

### Corrector de sintaxis antes de guardar

Cada vez que el agente va a guardar un archivo de código, Agentic lo comprueba antes con el analizador oficial de su lenguaje. Esto no usa la IA.

| Lenguaje | Cómo se comprueba |
|---|---|
| JavaScript (.js .mjs .cjs) | `node --check` |
| TypeScript (.ts) | Node quita los tipos y comprueba el resto |
| Python (.py) | `python3 -m py_compile` |
| JSON | `JSON.parse`, con la línea exacta del error |
| bash / zsh (.sh .zsh) | `bash -n` / `zsh -n` |
| HTML | Los `<script>` de la página |
| CSS | Llaves y paréntesis equilibrados |
| YAML (.yml .yaml) | Ruby (incluido en el Mac) |
| XML, plist, SVG | `xmllint` |
| Ruby, PHP | `ruby -c`, `php -l` (si está instalado) |

Si hay un error, Agentic intenta antes unos **arreglos mecánicos y seguros**, y solo se queda con uno si el analizador lo da por bueno:
- Quita el bloque Markdown de tres comillas invertidas que a veces envuelve el código.
- Cambia las comillas tipográficas (“ ” ‘ ’) por comillas normales.
- Añade la coma que falta entre dos elementos.
- Cierra las comillas que faltan en una línea, por ejemplo `"hola;` → `"hola";`.
- Cierra los paréntesis o corchetes que faltan en una línea, por ejemplo `print("hola"` → `print("hola")` o `if (a > 1 {` → `if (a > 1) {`.
- Añade los `:` que faltan en Python.
- Cambia los tabuladores de la sangría por espacios.
- En JSON, quita comentarios y comas finales y cambia `True`/`None` por `true`/`null`.
- Cierra al final los `)]}`, `fi`, `done` o `esac` que falten.

Verás `🔧 Sintaxis corregida automáticamente…` y debajo el cambio exacto: la línea antes (`-`) y después (`+`). Si no se puede arreglar así, **no se guarda**, y el agente recibe el error con la línea exacta para corregirlo. Si editas un archivo que ya estaba roto, Agentic sí te deja guardar, para que puedas arreglarlo poco a poco.

## Una conversación distinta por cada carpeta de proyecto

Cada carpeta de proyecto tiene su propia conversación, así que los proyectos no se mezclan. Dentro de la carpeta se crea una carpeta oculta `.agentic/` con esto:

| Archivo | Qué contiene |
|---|---|
| `.agentic/estado.json` | Los últimos 40 mensajes de la conversación, el plan y las notas de internet |
| `.agentic/memoria.jsonl` | La memoria de este proyecto (el MCP "memoria") |
| `.agentic/copias/` | Las copias de seguridad de los archivos que se han modificado |
| `.agentic/proyecto.json` | El último plan aprobado con `/crear` |

- Con **`/proyecto <ruta>`** se guarda la conversación de la carpeta actual y se carga la de la carpeta nueva, todo automáticamente. Si esa carpeta ya tenía una conversación, verás *"↺ Recuperada la conversación anterior…"*; di "continúa" para seguir con ella. Si no tenía, empieza de cero.
- Agentic recuerda la última carpeta que usaste y la vuelve a abrir la próxima vez.
- La **memoria a largo plazo** (`~/.agentic/experiencia`) es la única que comparten todos los proyectos. Así lo que aprendió en un proyecto le sirve en los demás: errores ya resueltos, recetas que funcionan…
- **`/limpiar`** (o `/resetear`) borra solo la conversación de la carpeta actual. No toca tus archivos ni la conversación de otros proyectos.

## Comandos

### Proyecto y conversación
| Comando | Qué hace |
|---|---|
| `/proyecto` | Muestra la carpeta de proyecto actual |
| `/proyecto <ruta>` | Cambia a otra carpeta y carga su conversación; si no existe, te ofrece crearla |
| `/proyecto elegir` | Elige la carpeta en una ventana del Finder |
| `/proyecto quitar` | Deja de usar una carpeta fija y vuelve a usar la carpeta desde la que abras `agentic` |
| `/limpiar`, `/resetear`, `/reset`, `/nuevo` | Empieza de cero la conversación de este proyecto |
| `/salir` (o Ctrl+D) | Guarda y sale |
| `"""` | Abre y cierra un mensaje de varias líneas, por ejemplo para pegar código |

### Crear programas
| Comando | Qué hace |
|---|---|
| `/crear <descripción>` | Piensa el plan (con el razonamiento visible), te lo enseña y, si lo apruebas, escribe el proyecto |

### Permisos y forma de trabajar
| Comando | Qué hace |
|---|---|
| `/permisos` | Muestra lo que ya has aprobado |
| `/permisos borrar` | Olvida esas aprobaciones |
| `/auto` on/off | Aprueba todo sin preguntarte (úsalo con cuidado) |
| `/autonomo` on/off | Trabaja solo hasta terminar (activado por defecto) |
| `/pensamiento español` o `original` | Muestra el razonamiento traducido o tal cual |
| `/modelo` | Muestra el modelo activo y la lista de instalados |
| `/modelo usar <nombre>` | Cambia el modelo activo (activa modo swap si supera los 24 GB) |
| `/modelo descargar <nombre>` | Descarga cualquier modelo de Ollama (ej. `/modelo descargar llama3.3:70b`) |
| `/modelo grande` | Alterna el modo swap SSD (contexto a 4096 para modelos gigantes) |

### Memoria
| Comando | Qué hace |
|---|---|
| `/memoria` | Muestra la memoria a largo plazo (experiencia de todos los proyectos) |
| `/memoria abrir` | La abre en el Finder |
| `/memoria aprender` | Guarda ahora lo aprendido en esta conversación |
| `/memoria on` o `off` | Activa o desactiva la memoria |

### Internet y descargas
| Comando | Qué hace |
|---|---|
| `/web` | Muestra qué buscador está configurado |
| `/web searxng <url>` · `/web brave <clave>` · `/web google <clave> <cx>` | Usa ese buscador |
| `/web quitar` | Vuelve a buscar con el navegador, sin clave |
| `/web navegador` | Instala Chromium |
| `/web navegador oculto` o `visible` | Oculta o muestra la ventana del navegador |
| `/descargas [subcarpeta]` | Muestra o cambia dónde se guardan las descargas (dentro del proyecto) |

### MCP y skills
| Comando | Qué hace |
|---|---|
| `/mcp` | Muestra los MCP y sus herramientas |
| `/mcp instalar <paquete-npm> [nombre]` | Instala un MCP de npm |
| `/mcp añadir <nombre> <comando> [args…]` | Añade un MCP local |
| `/mcp url <nombre> <https://…>` | Añade un MCP remoto |
| `/mcp quitar <nombre>` · `/mcp importar` · `/mcp sincronizar` | Quita un MCP, copia los de Claude Desktop o recarga `mcp.json` |
| `/skills` | Muestra las skills |
| `/skills instalar <carpeta, git o URL>` · `/skills importar` · `/skills quitar <nombre>` · `/skills sincronizar` | Instala, importa, quita o recarga skills |
| `/ayuda` | Muestra esta lista dentro de Agentic |

En los argumentos de un MCP, `{cwd}` se sustituye por la carpeta del proyecto actual.

## Dónde guarda cada cosa

- **En cada proyecto**, en `<proyecto>/.agentic/`: la conversación, la memoria del proyecto, las copias de seguridad y el plan de `/crear`.
- **Global**, en `~/.agentic/`:
  - `config.json` con los ajustes y la última carpeta.
  - `mcp.json`.
  - `skills/`.
  - `experiencia/`, la memoria a largo plazo.
  - `historial.txt`, con lo que has escrito y que puedes recuperar con la flecha ↑.

## Modelo Qwen3-Coder 30B (desde la v8.0)

- Modelo oficial de Ollama (`qwen3-coder:30b`, en Q4_K_M, unos 18,6 GB).
- Compatible con herramientas y seguimiento de instrucciones en Agentic.
- Para que vaya rápido: Ollama carga un solo modelo y atiende una conversación a la vez, lee el prompt en lotes de 1024 y mantiene el modelo en memoria 4 horas.
- Memoria de la GPU: macOS solo deja a la GPU unos 16 GB en un Mac de 24 GB y el modelo con su contexto necesita unos 14-15 GB, así que suele caber, pero justo; `Abrir Agentic.command` ofrece subir ese límite para ir más holgado (pide la contraseña y se deshace al reiniciar). Tu respuesta se guarda en `Agentic.app/Contents/Resources/.gpu-memoria`; bórralo para que vuelva a preguntarte.

## Corrector automático de código (v7.0)

Para que un modelo local se equivoque menos, Agentic revisa el código JavaScript y Python sin IA (de forma determinista) y solo cambia algo cuando hay **una única corrección clara**. Si duda, no toca nada y se lo dice al modelo.

**Al guardar cada archivo** (además de la sintaxis, como desde la v6.8):
- Añade los imports que faltan: `fs`, `path`, `os`… en JavaScript; `os`, `json`, `re`, `datetime`, `np`, `pd`… en Python. También añade un nombre que falta a un import que ya existe (por ejemplo `BrowserWindow` a `require('electron')`).
- Corrige métodos inventados de módulos conocidos: `fs.readFileAsync` → `fs.readFileSync`, `Math.flor` → `Math.floor`, `json.lods` → `json.loads`, `os.path.joinn` → `os.path.join`.
- Corrige erratas típicas en métodos de tipos básicos: `.lenght` → `.length`, `.toUppercase()` → `.toUpperCase()`, `.apend()` → `.append()`, `.uper()` → `.upper()`.

**Al terminar cada tarea** (revisión final, con todo el proyecto ya escrito):
- Nombres mal escritos: si se usa `resultdo` y solo existe `resultado`, lo cambia.
- Nombres entre archivos: si `main.py` importa `cargar_dato` y `datos.py` define `cargar_datos`, lo arregla. Si una función existe pero no se exportaba (`module.exports`), la añade. Si un import apunta a `./utlis` y existe `./utils`, lo corrige.
- Lo que no puede arreglar con seguridad se lo pasa al modelo como "sin arreglar" para que lo corrija él.

**Código por partes**: los archivos de código largos se escriben con la herramienta `escribir_seccion`, una parte por llamada (imports, cada función, el programa principal). Así el modelo escribe trozos pequeños y Agentic revisa cada uno. Si intenta añadir una función que ya existe, no la duplica.

**Nombres explícitos**: al guardar un archivo, Agentic le devuelve al modelo la lista de nombres que define y exporta, para que use siempre los mismos.

Lo que **no** arregla: la lógica equivocada o malinterpretar lo que pides. Eso solo lo resuelven las pruebas y un modelo mejor.

Se apaga con `/corrector off`. Archivos: `corrector.mjs` (JavaScript, con el analizador acorn en `vendor/`, licencia MIT) y `corrector.py` (Python, con el analizador oficial de Python).
