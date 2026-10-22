#!/usr/bin/env python3
# Corrector determinista de Agentic para Python (lo llama corrector.mjs).
# Entrada (stdin, JSON): {"file", "text", "cwd", "modo": "guardar"|"final"}
# Salida (stdout, JSON): {"text", "cambios": [...], "pendientes": [...]}
# Con --nombres: lee código por stdin y escribe los nombres de nivel superior.
# Solo cambia algo cuando hay UNA corrección clara; si duda, no toca nada.
import ast
import builtins
import importlib
import importlib.util
import json
import os
import re
import sys

# ---------------------------------------------------------------- parecido entre nombres
def distancia(a, b):
    if a == b:
        return 0
    m, n = len(a), len(b)
    if abs(m - n) > 3:
        return 99
    d = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        d[i][0] = i
    for j in range(n + 1):
        d[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            c = 0 if a[i - 1] == b[j - 1] else 1
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c)
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                d[i][j] = min(d[i][j], d[i - 2][j - 2] + 1)
    return d[m][n]


def normal(s):
    # mayúsculas y _ del medio no cuentan (cargarDatos = cargar_datos), pero el _ inicial sí (_replace ≠ replace)
    cuerpo = s.lstrip('_')
    return s[:len(s) - len(cuerpo)] + cuerpo.lower().replace('_', '').replace('-', '')


def tope(s):
    return 2 if len(s) >= 8 else 1 if len(s) >= 4 else 0


def mas_parecido(nombre, candidatos, solo_mayusculas=False, max_dist=None):
    cands = set(c for c in candidatos if c != nombre)
    n = normal(nombre)
    if solo_mayusculas:  # solo mayúsculas/minúsculas (tobytes ≠ to_bytes)
        exactos = [c for c in cands if c.lower() == nombre.lower()]
        return exactos[0] if len(exactos) == 1 else None
    exactos = [c for c in cands if normal(c) == n]
    if len(exactos) == 1 and len(nombre) >= 4:
        return exactos[0]
    if exactos or solo_mayusculas:
        return None
    lim = tope(nombre) if max_dist is None else max_dist
    if not lim:
        return None
    mejor, mejor_d, empate = None, 99, False
    for c in cands:
        if abs(len(c) - len(nombre)) > lim:
            continue
        dd = distancia(nombre, c)
        if dd < mejor_d:
            mejor, mejor_d, empate = c, dd, False
        elif dd == mejor_d:
            empate = True
    if mejor and mejor_d <= lim and not empate and tope(mejor) >= 1:
        return mejor
    return None


# ---------------------------------------------------------------- datos fijos
BUILTINS = set(dir(builtins)) | {'__file__', '__name__', '__doc__', '__builtins__', '__spec__', '__loader__', '__package__', '__path__', '__annotations__', '__all__'}
STDLIB = set(getattr(sys, 'stdlib_module_names', ())) or set('os sys re json math random time datetime subprocess shutil glob csv sqlite3 argparse logging threading hashlib base64 uuid tempfile functools itertools collections string copy pickle statistics platform getpass signal queue asyncio traceback textwrap io inspect operator heapq bisect secrets zipfile tarfile gzip webbrowser socket struct decimal fractions unicodedata pprint pathlib typing dataclasses enum abc urllib http html email tkinter unittest calendar locale configparser concurrent multiprocessing'.split())
NO_IMPORTAR = {'antigravity', 'this', 'idlelib', 'turtledemo', '__main__'}
# Módulos que se importan enteros
MODULOS = {m: 'import %s' % m for m in 'os sys re json math random time subprocess shutil glob csv sqlite3 argparse logging threading hashlib base64 uuid tempfile functools itertools collections string copy pickle statistics platform getpass signal queue asyncio traceback textwrap io inspect operator heapq bisect secrets zipfile webbrowser socket struct decimal fractions unicodedata pprint calendar locale configparser pathlib typing'.split()}
MODULOS.update({'np': 'import numpy as np', 'pd': 'import pandas as pd', 'plt': 'import matplotlib.pyplot as plt', 'tk': 'import tkinter as tk', 'requests': 'import requests'})
# Nombres sueltos que vienen de un módulo (solo en la revisión final)
NOMBRES = {}
for mod, nombres in {
    'pathlib': 'Path', 'collections': 'defaultdict Counter deque OrderedDict namedtuple', 'dataclasses': 'dataclass field asdict',
    'typing': 'List Dict Optional Tuple Any Union Set Callable Iterable Iterator Generator Sequence Mapping Type TypeVar Literal',
    'functools': 'partial reduce wraps lru_cache', 'enum': 'Enum auto', 'abc': 'ABC abstractmethod', 'copy': 'deepcopy',
    'tkinter': 'ttk messagebox filedialog simpledialog', 'threading': 'Thread Lock', 'concurrent.futures': 'ThreadPoolExecutor ProcessPoolExecutor',
    'datetime': 'timedelta date timezone', 'time': 'sleep', 'math': 'sqrt pi floor ceil', 'random': 'randint choice shuffle', 'pprint': 'pprint',
}.items():
    for n in nombres.split():
        NOMBRES[n] = mod
TIPOS = [str, list, dict, set, int, float, bytes, tuple, frozenset]
ERRATAS_PY = {'apend': 'append', 'appned': 'append', 'apped': 'append', 'appen': 'append', 'uper': 'upper', 'lowe': 'lower', 'lowr': 'lower', 'spilt': 'split', 'splt': 'split', 'stirp': 'strip', 'strp': 'strip', 'extned': 'extend', 'extnd': 'extend', 'repalce': 'replace', 'replce': 'replace', 'startwith': 'startswith', 'endwith': 'endswith', 'iteritems': 'items', 'has_key': '__contains__', 'itmes': 'items', 'vaules': 'values', 'valeus': 'values', 'kyes': 'keys', 'fromat': 'format', 'formt': 'format', 'jion': 'join', 'joni': 'join', 'isdigt': 'isdigit', 'isalpah': 'isalpha', 'cout': 'count', 'indx': 'index', 'remvoe': 'remove', 'insrt': 'insert', 'popp': 'pop', 'sotr': 'sort', 'srot': 'sort'}
del ERRATAS_PY['has_key']
METODOS_TIPOS = set(a for t in TIPOS for a in dir(t) if not a.startswith('_'))


# ---------------------------------------------------------------- análisis
class Analisis(ast.NodeVisitor):
    def __init__(self):
        self.declarados = set()
        self.usos = []           # (nombre, linea, col, fin)
        self.atributos = []      # nodos Attribute en lectura
        self.attrs_definidos = set()
        self.estrella = False
        self.imports = []        # nodos Import / ImportFrom
        self.llamados = set()    # id() de los Attribute que se llaman
        self.guardados = set()   # nombres a los que se asigna algo (una variable que tapa un módulo)
        self.protegidos = set()  # id() de nodos dentro de try/except (pueden no existir a propósito)
        self._try = 0

    def visit_Name(self, n):
        if isinstance(n.ctx, ast.Load):
            self.usos.append((n.id, n.lineno, n.col_offset, n.end_col_offset))
        else:
            self.declarados.add(n.id)
            self.guardados.add(n.id)

    def visit_Try(self, n):
        captura = any(h.type is None or any(isinstance(x, ast.Name) and x.id in ('AttributeError', 'ImportError', 'ModuleNotFoundError', 'Exception', 'NameError') for x in ast.walk(h.type)) for h in n.handlers)
        if captura:
            for x in n.body:
                for y in ast.walk(x):
                    self.protegidos.add(id(y))
        self.generic_visit(n)
    visit_TryStar = visit_Try

    def _func(self, n):
        self.declarados.add(n.name)
        self.attrs_definidos.add(n.name)
        self.generic_visit(n)
    visit_FunctionDef = visit_AsyncFunctionDef = _func

    def visit_ClassDef(self, n):
        self.declarados.add(n.name)
        self.generic_visit(n)

    def visit_arg(self, n):
        self.declarados.add(n.arg)
        self.guardados.add(n.arg)
        self.generic_visit(n)

    def visit_Import(self, n):
        self.imports.append(n)
        for a in n.names:
            self.declarados.add(a.asname or a.name.split('.')[0])

    def visit_ImportFrom(self, n):
        self.imports.append(n)
        for a in n.names:
            if a.name == '*':
                self.estrella = True
            else:
                self.declarados.add(a.asname or a.name)

    def visit_ExceptHandler(self, n):
        if n.name:
            self.declarados.add(n.name)
        self.generic_visit(n)

    def visit_Global(self, n):
        self.declarados.update(n.names)
    visit_Nonlocal = visit_Global

    def visit_Attribute(self, n):
        if isinstance(n.ctx, ast.Load):
            self.atributos.append(n)
        else:
            self.attrs_definidos.add(n.attr)
        self.generic_visit(n)

    def visit_Call(self, n):
        if isinstance(n.func, ast.Attribute):
            self.llamados.add(id(n.func))
        for k in n.keywords:
            if k.arg:
                self.attrs_definidos.add(k.arg)
        self.generic_visit(n)

    def generic_visit(self, n):
        # match/case (3.10+): nombres capturados
        for campo in ('name', 'rest'):
            v = getattr(n, campo, None)
            if type(n).__name__ in ('MatchAs', 'MatchStar', 'MatchMapping') and isinstance(v, str):
                self.declarados.add(v)
        super().generic_visit(n)


def nivel_superior(arbol):
    s = set()
    for n in arbol.body:
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            s.add(n.name)
        elif isinstance(n, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
            for t in (n.targets if isinstance(n, ast.Assign) else [n.target]):
                for x in ast.walk(t):
                    if isinstance(x, ast.Name):
                        s.add(x.id)
        elif isinstance(n, ast.Import):
            for a in n.names:
                s.add(a.asname or a.name.split('.')[0])
        elif isinstance(n, ast.ImportFrom):
            for a in n.names:
                s.add(a.asname or a.name)
        elif isinstance(n, (ast.If, ast.Try, ast.With, ast.For, ast.While)):
            for x in ast.walk(n):
                if isinstance(x, (ast.FunctionDef, ast.ClassDef)):
                    s.add(x.name)
                elif isinstance(x, ast.Name) and isinstance(x.ctx, ast.Store):
                    s.add(x.id)
    return s


# ---------------------------------------------------------------- cambios por posición (col en bytes UTF-8)
class Editor:
    def __init__(self, text):
        self.lineas = text.split('\n')
        self.cambios = []   # (linea, col, fin, nuevo)
        self.inserciones = []  # (indice_linea, texto)
        self.usados = set()

    def cambiar(self, linea, col, fin, nuevo):
        if (linea, col) in self.usados:
            return False
        self.usados.add((linea, col))
        self.cambios.append((linea, col, fin, nuevo))
        return True

    def resultado(self):
        lineas = [l.encode('utf-8') for l in self.lineas]
        for linea, col, fin, nuevo in sorted(self.cambios, key=lambda c: (c[0], -c[1])):
            pass
        por_linea = {}
        for c in self.cambios:
            por_linea.setdefault(c[0], []).append(c)
        for linea, cs in por_linea.items():
            b = lineas[linea - 1]
            ultimo = len(b) + 1
            for _, col, fin, nuevo in sorted(cs, key=lambda c: -c[1]):
                if fin > ultimo:
                    continue
                b = b[:col] + nuevo.encode('utf-8') + b[fin:]
                ultimo = col
            lineas[linea - 1] = b
        out = [l.decode('utf-8') for l in lineas]
        for idx, txt in sorted(self.inserciones, key=lambda x: -x[0]):
            nuevas = txt.split('\n')
            # línea en blanco entre los imports y el código que sigue
            if idx < len(out) and out[idx].strip() and not re.match(r'\s*(import|from)\s', out[idx]):
                nuevas.append('')
            out[idx:idx] = nuevas
        return '\n'.join(out)


def punto_import(arbol, lineas):
    """Índice de línea (0-based) donde insertar un import nuevo."""
    idx = 0
    for n in arbol.body:
        es_doc = isinstance(n, ast.Expr) and isinstance(getattr(n, 'value', None), ast.Constant) and isinstance(n.value.value, str)
        if isinstance(n, (ast.Import, ast.ImportFrom)) or (es_doc and idx == 0):
            idx = n.end_lineno
        else:
            break
    if idx == 0:
        while idx < len(lineas) and (lineas[idx].startswith('#!') or re.match(r'#.*coding[:=]', lineas[idx])):
            idx += 1
    return idx


# ---------------------------------------------------------------- módulos de la biblioteca estándar
_cache = {}


def modulo_std(nombre):
    raiz = nombre.split('.')[0]
    if raiz not in STDLIB or raiz in NO_IMPORTAR or raiz.startswith('_'):
        return None
    if nombre not in _cache:
        try:
            _cache[nombre] = importlib.import_module(nombre)
        except Exception:
            _cache[nombre] = None
    return _cache[nombre]


def publicos(obj):
    try:
        return set(dir(obj))
    except Exception:
        return set()


# ---------------------------------------------------------------- módulos del propio proyecto
def modulo_local(nombre, archivo, cwd, nivel=0):
    partes = nombre.split('.') if nombre else []
    bases = [os.path.dirname(archivo)] if nivel else [os.path.dirname(archivo), cwd]
    for base in bases:
        b = base
        for _ in range(max(0, nivel - 1)):
            b = os.path.dirname(b)
        p = os.path.join(b, *partes)
        for cand in (p + '.py', os.path.join(p, '__init__.py')):
            if partes and os.path.isfile(cand):
                return cand
    return None


def nombres_de_archivo(f):
    try:
        with open(f, encoding='utf-8') as fh:
            return nivel_superior(ast.parse(fh.read()))
    except Exception:
        return None


def hermanos_py(archivo, cwd):
    s = set()
    for d in {os.path.dirname(archivo), cwd}:
        try:
            for x in os.listdir(d):
                if x.endswith('.py'):
                    s.add(x[:-3])
                elif os.path.isfile(os.path.join(d, x, '__init__.py')):
                    s.add(x)
        except Exception:
            pass
    return s


# ---------------------------------------------------------------- corrector
def corregir(file, text, cwd, modo):
    res = {'text': text, 'cambios': [], 'pendientes': []}
    try:
        arbol = ast.parse(text)
    except SyntaxError:
        return res
    A = Analisis()
    A.visit(arbol)
    final = modo == 'final'
    base = os.path.basename(file)
    rel = os.path.relpath(file, cwd)
    E = Editor(text)
    lineas = text.split('\n')

    def anota(linea, msg):
        res['cambios'].append('%s:%d: %s' % (base, linea, msg))

    # Variables que son un módulo: import os / import numpy as np
    enlaces = {}
    for n in A.imports:
        if isinstance(n, ast.Import):
            for a in n.names:
                enlaces[a.asname or a.name.split('.')[0]] = a.name if a.asname else a.name.split('.')[0]

    # 1) Nombres sin definir: import que falta o nombre mal escrito
    sin_definir = {}
    if not A.estrella:
        for nombre, l, c, e in A.usos:
            if nombre not in A.declarados and nombre not in BUILTINS:
                sin_definir.setdefault(nombre, []).append((l, c, e))
    nuevos = []
    from_existentes = {}
    for n in A.imports:
        if isinstance(n, ast.ImportFrom) and n.level == 0 and n.module and n.col_offset == 0:
            from_existentes.setdefault(n.module, n)
    atributos_de = {}
    for at in A.atributos:
        if isinstance(at.value, ast.Name):
            atributos_de.setdefault(at.value.id, set()).add(at.attr)
    for nombre, usos in sin_definir.items():
        if nombre == 'datetime':
            nuevos.append('import datetime' if atributos_de.get('datetime', set()) & {'datetime', 'date', 'timedelta', 'timezone', 'time'} else 'from datetime import datetime')
            anota(usos[0][0], 'añadido el import que faltaba de datetime')
            continue
        if nombre in MODULOS:
            nuevos.append(MODULOS[nombre])
            enlaces[nombre] = MODULOS[nombre].split()[1]
            anota(usos[0][0], 'añadido el import que faltaba: %s' % MODULOS[nombre])
            continue
        if final and nombre in NOMBRES:
            mod = NOMBRES[nombre]
            ex = from_existentes.get(mod)
            if ex is not None and ex.end_lineno == ex.lineno and not lineas[ex.lineno - 1].rstrip().endswith(')'):
                l = ex.lineno
                linea = lineas[l - 1]
                sin_com = linea.split('#')[0].rstrip()
                E.cambiar(l, len(sin_com.encode('utf-8')), len(sin_com.encode('utf-8')), ', %s' % nombre)
            else:
                nuevos.append('from %s import %s' % (mod, nombre))
            anota(usos[0][0], 'añadido %s al import de %s' % (nombre, mod))
            continue
        if not final:
            continue
        cand = mas_parecido(nombre, A.declarados) or mas_parecido(nombre, BUILTINS, max_dist=1)
        # Una clase (Options) no se cambia por una variable (options): suele venir de fuera
        if cand and nombre[:1].isupper() and cand[:1].islower():
            cand = None
        if cand:
            for l, c, e in usos:
                E.cambiar(l, c, e, cand)
            anota(usos[0][0], '`%s` no existe → `%s`' % (nombre, cand))
        else:
            res['pendientes'].append('%s:%d: se usa `%s`, pero no está definido en ningún sitio. Defínelo, impórtalo o corrige el nombre.' % (rel, usos[0][0], nombre))
    if nuevos:
        E.inserciones.append((punto_import(arbol, lineas), '\n'.join(dict.fromkeys(nuevos))))

    # 2) Atributos inventados de módulos estándar (os.path.joinn, json.lods) y de módulos del proyecto
    def cadena(at):
        partes = []
        x = at
        while isinstance(x, ast.Attribute):
            partes.append(x)
            x = x.value
        return (x.id if isinstance(x, ast.Name) else None), list(reversed(partes))

    vistos = set()
    for at in A.atributos:
        raiz, partes = cadena(at)
        if raiz is None or raiz not in enlaces or raiz in A.guardados or id(partes[-1]) in vistos or id(at) in A.protegidos:
            continue
        for p in partes:
            vistos.add(id(p))
        mod = enlaces[raiz]
        obj = modulo_std(mod)
        local = None if obj is not None else modulo_local(mod, file, cwd)
        if obj is None and not (final and local):
            continue
        if local:
            nombres = nombres_de_archivo(local)
            if nombres is None:
                continue
            p = partes[0]
            if p.attr not in nombres:
                cand = mas_parecido(p.attr, nombres)
                if cand:
                    if E.cambiar(p.end_lineno, p.end_col_offset - len(p.attr.encode('utf-8')), p.end_col_offset, cand):
                        anota(p.lineno, '%s.%s no existe en %s → %s.%s' % (raiz, p.attr, os.path.relpath(local, cwd), raiz, cand))
                else:
                    res['pendientes'].append('%s:%d: %s.%s no existe en %s (define: %s).' % (rel, p.lineno, raiz, p.attr, os.path.relpath(local, cwd), ', '.join(sorted(nombres))[:300]))
            continue
        for p in partes:
            if p.attr.startswith('__'):
                break
            claves = publicos(obj)
            if p.attr in claves:
                try:
                    obj = getattr(obj, p.attr)
                except Exception:
                    break
                continue
            cand = mas_parecido(p.attr, claves)
            if cand and p.attr[:1].islower() != cand[:1].islower():
                cand = None  # token.string ≠ token.STRING: constantes y funciones no se confunden
            if cand and E.cambiar(p.end_lineno, p.end_col_offset - len(p.attr.encode('utf-8')), p.end_col_offset, cand):
                anota(p.lineno, '%s no existe en %s → %s' % (p.attr, mod, cand))
            elif final and not cand:
                res['pendientes'].append('%s:%d: `%s` no existe en %s.' % (rel, p.lineno, p.attr, mod))
            break

    # from os import pathh / from mimodulo import funcon
    for n in A.imports:
        if not isinstance(n, ast.ImportFrom) or not n.module and not n.level:
            continue
        obj = modulo_std(n.module) if n.module and not n.level else None
        local = None
        nombres = publicos(obj) if obj is not None else None
        if obj is None:
            local = modulo_local(n.module or '', file, cwd, n.level)
            if not final:
                continue
            if not local and n.module and not n.level and importlib.util.find_spec(n.module.split('.')[0]) is None:
                # ¿módulo del proyecto mal escrito? (from utlis import x → utils)
                cand = mas_parecido(n.module, hermanos_py(file, cwd))
                linea = lineas[n.lineno - 1]
                m = re.search(r'\bfrom\s+(%s)\b' % re.escape(n.module), linea)
                if cand and m and n.lineno == n.end_lineno:
                    col = len(linea[:m.start(1)].encode('utf-8'))
                    E.cambiar(n.lineno, col, col + len(n.module.encode('utf-8')), cand)
                    anota(n.lineno, "el módulo '%s' no existe → '%s'" % (n.module, cand))
                    local = modulo_local(cand, file, cwd)
                elif not cand:
                    res['pendientes'].append("%s:%d: importa '%s', que no está instalado ni es un archivo del proyecto." % (rel, n.lineno, n.module))
            if not local:
                continue
            nombres = nombres_de_archivo(local)
            if nombres is None:
                continue
        for a in n.names:
            if a.name == '*' or a.name in nombres:
                continue
            if local is None and modulo_std('%s.%s' % (n.module, a.name)) is not None:
                continue  # from os import path / from concurrent import futures
            cand = mas_parecido(a.name, nombres)
            linea = lineas[n.lineno - 1] if n.lineno == n.end_lineno else None
            m = re.search(r'\b%s\b' % re.escape(a.name), linea[linea.index('import'):]) if linea and 'import' in linea else None
            if cand and m:
                col = len(linea[:linea.index('import') + m.start()].encode('utf-8'))
                # Sin "as": se cambia también cada uso en el archivo (si el nombre bueno no está ya ocupado)
                renombrar = not a.asname and cand not in A.declarados and a.name not in A.guardados
                E.cambiar(n.lineno, col, col + len(a.name.encode('utf-8')), cand if (a.asname or renombrar) else '%s as %s' % (cand, a.name))
                if renombrar:
                    for nombre_u, l_u, c_u, e_u in A.usos:
                        if nombre_u == a.name:
                            E.cambiar(l_u, c_u, e_u, cand)
                anota(n.lineno, '`%s` no existe en %s → `%s`' % (a.name, n.module or '.', cand))
            elif final:
                donde = os.path.relpath(local, cwd) if local else n.module
                res['pendientes'].append('%s:%d: %s no tiene `%s`%s.' % (rel, n.lineno, donde, a.name, (' (define: %s)' % ', '.join(sorted(nombres))[:300]) if local else ''))

    # 3) Métodos mal escritos de tipos básicos (lista.apend(), texto.uper())
    proyecto_attrs = set(A.attrs_definidos)
    for at in A.atributos:
        if id(at) not in A.llamados or at.attr in METODOS_TIPOS or at.attr in proyecto_attrs:
            continue
        raiz, _ = cadena(at)
        if raiz in enlaces:
            continue
        # Solo mayúsculas cambiadas o erratas conocidas: hay miles de métodos de otras clases (.read, .bind…)
        cand = ERRATAS_PY.get(at.attr) or mas_parecido(at.attr, METODOS_TIPOS, solo_mayusculas=True)
        if cand and E.cambiar(at.end_lineno, at.end_col_offset - len(at.attr.encode('utf-8')), at.end_col_offset, cand):
            anota(at.lineno, '.%s() → .%s()' % (at.attr, cand))

    res['text'] = E.resultado()
    return res


def main():
    if '--definidos' in sys.argv:
        try:
            arbol = ast.parse(sys.stdin.read())
            imps = set()
            for n in arbol.body:
                if isinstance(n, (ast.Import, ast.ImportFrom)):
                    for a in n.names:
                        imps.add(a.asname or a.name.split('.')[0])
            print(', '.join(sorted(nivel_superior(arbol) - imps)))
        except Exception:
            pass
        return
    if '--nombres' in sys.argv:
        try:
            print(', '.join(sorted(nivel_superior(ast.parse(sys.stdin.read())))[:60]))
        except Exception:
            pass
        return
    j = json.loads(sys.stdin.read())
    print(json.dumps(corregir(j['file'], j['text'], j['cwd'], j.get('modo', 'guardar')), ensure_ascii=False))


if __name__ == '__main__':
    main()
