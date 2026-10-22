# Comandos que en macOS (BSD) funcionan distinto que en Linux (GNU)

Si un comando copiado de internet falla con `illegal option`, `invalid command code` o hace algo raro, casi siempre es esto. Alternativa segura: hacer el cambio con editar_archivo o con un script corto de Node/Python, que funcionan igual en todos los sistemas.

| Tarea | Linux (GNU) | macOS (BSD) |
|---|---|---|
| Editar archivo en el sitio | `sed -i 's/a/b/' f` | `sed -i '' 's/a/b/' f` (el `''` es obligatorio) |
| Sed con salto de línea / `\n` en el reemplazo | `sed 's/a/\n/'` | no lo interpreta: usa `perl -pi -e 's/a/\n/' f` |
| Regex de Perl en grep | `grep -P '\d+'` | no existe `-P`: `grep -E '[0-9]+'` o `perl -ne 'print if /\d+/'` |
| Fecha de hace 1 día | `date -d '1 day ago'` | `date -v-1d` |
| Convertir texto a fecha | `date -d '2026-01-02'` | `date -j -f '%Y-%m-%d' '2026-01-02' +%s` |
| Tamaño / fecha de un archivo | `stat -c %s f` | `stat -f %z f` (fecha: `stat -f %m f`) |
| `find -printf` | `find . -printf '%p\n'` | no existe: `find . -exec stat -f '%N %z' {} +` |
| Ruta absoluta | `readlink -f f` | `realpath f` (o `readlink -f` en macOS 12.3+) |
| Límite de tiempo | `timeout 10 cmd` | no viene: `brew install coreutils` → `gtimeout`, o en Node/Python |
| `xargs` sin entrada | `xargs -r` | BSD no ejecuta el comando si no hay entrada; `-r` se acepta en macOS recientes pero no hace falta |
| Base64 decodificar | `base64 -d` | `base64 -d` (en macOS antiguos `-D`) |
| Contar CPUs | `nproc` | `sysctl -n hw.ncpu` |
| Memoria | `free -h` | `vm_stat` y `sysctl hw.memsize` |
| Copiar contenido de carpeta | `cp -r a/ b` (copia la carpeta `a` dentro de `b`) | `cp -R a/ b` copia el **contenido** de `a` en `b` (con la barra final cambia el resultado) |
| Abrir archivo | `xdg-open f` | `open f` |
| Portapapeles | `xclip` | `pbcopy` / `pbpaste` |
| Puertos en uso | `ss -ltnp` / `netstat -tlnp` | `lsof -nP -iTCP -sTCP:LISTEN` |
| Servicios | `systemctl` | `launchctl` y `brew services` |
| Paquetes | `apt install` | `brew install` |
| Hash | `md5sum` / `sha256sum` | `md5` / `shasum -a 256` |
| `ls --color` | sí | `ls -G` |

Si hace falta la versión GNU de verdad: `brew install coreutils gnu-sed grep findutils` y usar `gsed`, `ggrep`, `gfind`, `gdate`, `gstat`…
