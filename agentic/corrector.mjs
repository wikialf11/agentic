// ---------------------------------------------------------------------------
// Corrector determinista de Agentic (v7.0): arregla, sin IA, los fallos típicos de un modelo pequeño
// en JavaScript y Python:
//   · nombres mal escritos (una variable o función que no existe y se parece a una sola que sí)
//   · imports que faltan (fs, path, os, json, re…) y nombres que faltan en un import que ya existe
//   · métodos inventados de módulos conocidos (fs.readFileAsync → fs.readFileSync, os.path.joinn → os.path.join)
//   · métodos mal escritos de tipos básicos (lista.apend → append, texto.toUppercase → toUpperCase)
//   · nombres que no cuadran entre archivos del proyecto (importa cargarDato y el otro archivo exporta cargarDatos)
// Regla de oro: solo se cambia algo cuando hay UNA corrección clara. Si hay dudas, no se toca y se avisa.
// Dos modos: 'guardar' (al guardar cada archivo: solo lo que no depende de código que aún no existe)
// y 'final' (al terminar la tarea, con todo el proyecto escrito: también nombres y cruces entre archivos).
// ---------------------------------------------------------------------------
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import * as acorn from './vendor/acorn.mjs';

const require = createRequire(import.meta.url);
const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const EXT_JS = ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts'];
export const EXT_PY = ['.py'];
const IGNORAR_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'release', 'venv', '.venv', 'env', '__pycache__', '.agentic', 'descargas', 'coverage', '.next']);

// ---------------------------------------------------------------------------
// Parecido entre nombres
// ---------------------------------------------------------------------------
// Distancia de edición con trasposiciones (pirnt → print cuenta como 1)
export function distancia(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 3) return 99;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    const c = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[m][n];
}
// mayúsculas y _ del medio no cuentan (cargarDatos = cargar_datos), pero el _ inicial sí (_replace ≠ replace)
const normal = (s) => { const c = s.replace(/^_+/, ''); return s.slice(0, s.length - c.length) + c.toLowerCase().replace(/[_-]/g, ''); };
// Cuánto se permite equivocarse según la longitud del nombre (los nombres cortos no se tocan)
const tope = (s) => (s.length >= 8 ? 2 : s.length >= 4 ? 1 : 0);
// El candidato más parecido, solo si es único y claramente parecido; si no, null
export function masParecido(nombre, candidatos, { soloMayusculas = false, maxDist = null } = {}) {
  if (soloMayusculas) { const e = [...new Set(candidatos)].filter(c => c !== nombre && c.toLowerCase() === nombre.toLowerCase()); return e.length === 1 ? e[0] : null; }
  const n = normal(nombre);
  const exactos = [...new Set([...candidatos].filter(c => c !== nombre && normal(c) === n))];
  if (exactos.length === 1 && nombre.length >= 4) return exactos[0];
  if (exactos.length > 1 || soloMayusculas) return null;
  const lim = maxDist ?? tope(nombre);
  if (!lim) return null;
  let mejor = null, mejorD = 99, empate = false;
  for (const c of new Set(candidatos)) {
    if (c === nombre || Math.abs(c.length - nombre.length) > lim) continue;
    const d = distancia(nombre, c);
    if (d < mejorD) { mejor = c; mejorD = d; empate = false; }
    else if (d === mejorD && c !== mejor) empate = true;
  }
  return mejor && mejorD <= lim && !empate && tope(mejor) >= 1 ? mejor : null;
}

// ---------------------------------------------------------------------------
// Proyecto: archivos de código (sin node_modules ni carpetas de compilación)
// ---------------------------------------------------------------------------
export function archivosProyecto(cwd, exts = [...EXT_JS, ...EXT_PY], max = 400) {
  const out = [];
  const rec = (d, depth) => {
    if (out.length >= max || depth > 6) return;
    let es = [];
    try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      if (e.name.startsWith('.') && e.name !== '.') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!IGNORAR_DIRS.has(e.name)) rec(p, depth + 1); }
      else if (exts.includes(path.extname(e.name).toLowerCase()) && !/\.agentic-\d+\./.test(e.name)) out.push(p);
      if (out.length >= max) return;
    }
  };
  rec(cwd, 0);
  return out;
}
const leer = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
const lineaDe = (text, pos) => text.slice(0, pos).split('\n').length;

// ---------------------------------------------------------------------------
// JavaScript: análisis con acorn
// ---------------------------------------------------------------------------
// stripTypeScriptTypes (Node 22.6+) avisa de que es experimental al usarlo: solo se pide para archivos TypeScript
let stripTS;
function parsearJS(text, ext) {
  let src = text;
  if (['.ts', '.mts', '.cts'].includes(ext)) {
    if (stripTS === undefined) { const w = process.emitWarning; process.emitWarning = () => {}; try { stripTS = require('module').stripTypeScriptTypes || null; } catch { stripTS = null; } finally { process.emitWarning = w; } }
    if (!stripTS) return null;
    const w = process.emitWarning; process.emitWarning = () => {};
    try { src = stripTS(text); } catch { return null; } finally { process.emitWarning = w; } // quita los tipos dejando espacios: las posiciones no cambian
    if (src.length !== text.length) return null;
  }
  const base = { ecmaVersion: 'latest', allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, allowImportExportEverywhere: true, allowSuperOutsideMethod: true };
  const prefiereModulo = ext === '.mjs' || ext === '.mts' || /^\s*(import\s|export\s)/m.test(src);
  for (const sourceType of prefiereModulo ? ['module', 'script'] : ['script', 'module']) {
    try { return { ast: acorn.parse(src, { ...base, sourceType }), sourceType }; } catch {}
  }
  return null;
}
const SALTAR = new Set(['type', 'start', 'end', 'loc', 'range', 'raw', 'value', 'regex', 'bigint', 'sourceType']);
// Recorre el árbol y apunta declaraciones, usos, accesos a miembros, requires e imports
function analizarJS(ast) {
  const A = { declarados: new Set(), usos: [], miembros: [], propsDefinidas: new Set(), requires: [], imports: [], asignadosGlobal: new Set(), cuerpo: ast.body, exportsCJS: null, exportsLista: new Set(), exportaTodo: false, nivelSuperior: new Set() };
  const declararPatron = (p, top) => {
    if (!p) return;
    if (p.type === 'Identifier') { A.declarados.add(p.name); if (top) A.nivelSuperior.add(p.name); }
    else if (p.type === 'ObjectPattern') for (const pr of p.properties) {
      if (pr.type === 'RestElement') declararPatron(pr.argument, top);
      else { if (!pr.computed && pr.key.type === 'Identifier') A.propsDefinidas.add(pr.key.name); else visitar(pr.key); declararPatron(pr.value, top); }
    }
    else if (p.type === 'ArrayPattern') p.elements.forEach(e => declararPatron(e, top));
    else if (p.type === 'AssignmentPattern') { declararPatron(p.left, top); visitar(p.right); }
    else if (p.type === 'RestElement') declararPatron(p.argument, top);
    else visitar(p); // MemberExpression en una asignación por desestructuración
  };
  const funcion = (n, top) => {
    if (n.id) { A.declarados.add(n.id.name); if (top) A.nivelSuperior.add(n.id.name); }
    n.params.forEach(p => declararPatron(p, false));
    visitar(n.body);
  };
  const esRequire = (n) => n && n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'require' && n.arguments.length === 1 && n.arguments[0].type === 'Literal' && typeof n.arguments[0].value === 'string';
  function visitar(n, padre = null, clave = null, top = false) {
    if (!n || typeof n.type !== 'string') return;
    switch (n.type) {
      case 'Identifier':
        A.usos.push({ nombre: n.name, start: n.start, end: n.end, abreviado: padre?.type === 'Property' && padre.shorthand && clave === 'value' });
        return;
      case 'VariableDeclaration':
        for (const d of n.declarations) {
          declararPatron(d.id, top);
          if (esRequire(d.init)) A.requires.push({ modulo: d.init.arguments[0].value, id: d.id, decl: n, litStart: d.init.arguments[0].start, litEnd: d.init.arguments[0].end });
          visitar(d.init);
        }
        return;
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression': funcion(n, top && n.type === 'FunctionDeclaration'); return;
      case 'ClassDeclaration': case 'ClassExpression':
        if (n.id) { A.declarados.add(n.id.name); if (top && n.type === 'ClassDeclaration') A.nivelSuperior.add(n.id.name); }
        visitar(n.superClass); visitar(n.body); return;
      case 'CatchClause': declararPatron(n.param, false); visitar(n.body); return;
      case 'MethodDefinition': case 'PropertyDefinition':
        if (!n.computed && (n.key.type === 'Identifier' || n.key.type === 'PrivateIdentifier')) A.propsDefinidas.add(n.key.name); else visitar(n.key);
        visitar(n.value); return;
      case 'Property':
        if (!n.computed) { if (n.key.type === 'Identifier') A.propsDefinidas.add(n.key.name); else if (n.key.type === 'Literal') A.propsDefinidas.add(String(n.key.value)); }
        else visitar(n.key);
        visitar(n.value, n, 'value'); return;
      case 'MemberExpression':
        visitar(n.object);
        if (n.computed) visitar(n.property);
        else if (n.property.type === 'Identifier') {
          const llamado = padre?.type === 'CallExpression' && clave === 'callee';
          A.miembros.push({ obj: n.object, objNombre: n.object.type === 'Identifier' ? n.object.name : null, prop: n.property.name, start: n.property.start, end: n.property.end, llamado, nodo: n });
        }
        return;
      case 'AssignmentExpression':
        if (n.left.type === 'Identifier' && n.operator === '=') A.asignadosGlobal.add(n.left.name);
        if (n.left.type === 'MemberExpression' && n.left.computed && n.left.object.type === 'Identifier' && n.left.object.name === 'exports') A.exportsDinamicos = true;
        if (n.left.type === 'MemberExpression' && !n.left.computed && n.left.property.type === 'Identifier') {
          A.propsDefinidas.add(n.left.property.name);
          // module.exports = {…} / exports.x = … / module.exports.x = …
          const L = n.left;
          if (L.object.type === 'Identifier' && L.object.name === 'module' && L.property.name === 'exports') { A.exportsCJSveces = (A.exportsCJSveces || 0) + 1; A.exportsCJS = n.right; }
          else if ((L.object.type === 'Identifier' && L.object.name === 'exports') || (L.object.type === 'MemberExpression' && L.object.object.type === 'Identifier' && L.object.object.name === 'module' && L.object.property.name === 'exports')) A.exportsLista.add(L.property.name);
        }
        if (n.left.type === 'ObjectPattern' || n.left.type === 'ArrayPattern') declararPatronAsignacion(n.left); else visitar(n.left, n, 'left');
        visitar(n.right); return;
      case 'CallExpression': {
        // Object.defineProperty(exports, …) / Object.assign(module.exports, …): exports que no se pueden listar
        const c = n.callee, a0 = n.arguments[0];
        const esExports = (x) => x && ((x.type === 'Identifier' && x.name === 'exports') || (x.type === 'MemberExpression' && x.object.type === 'Identifier' && x.object.name === 'module' && !x.computed && x.property.name === 'exports'));
        if (c.type === 'MemberExpression' && c.object.type === 'Identifier' && c.object.name === 'Object' && esExports(a0)) A.exportsDinamicos = true;
        break;
      }
      case 'LabeledStatement': visitar(n.body); return;
      case 'BreakStatement': case 'ContinueStatement': case 'MetaProperty': return;
      case 'ImportDeclaration':
        A.imports.push({ modulo: n.source.value, nodo: n });
        for (const s of n.specifiers) { A.declarados.add(s.local.name); A.nivelSuperior.add(s.local.name); }
        return;
      case 'ExportNamedDeclaration':
        if (n.declaration) {
          visitar(n.declaration, n, 'declaration', true);
          const d = n.declaration;
          if (d.id) A.exportsLista.add(d.id.name);
          if (d.declarations) for (const x of d.declarations) for (const nm of nombresPatron(x.id)) A.exportsLista.add(nm);
        }
        for (const s of n.specifiers) { A.exportsLista.add(s.exported.name ?? s.exported.value); if (!n.source) visitar(s.local); }
        if (n.source) A.imports.push({ modulo: n.source.value, nodo: n, reexporta: true });
        return;
      case 'ExportDefaultDeclaration': A.exportsLista.add('default'); visitar(n.declaration, n, 'declaration', true); return;
      case 'ExportAllDeclaration': A.exportaTodo = true; return;
    }
    for (const k of Object.keys(n)) {
      if (SALTAR.has(k)) continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach(x => x && typeof x.type === 'string' && visitar(x, n, k));
      else if (v && typeof v.type === 'string') visitar(v, n, k);
    }
  }
  // [a, b] = … / ({ a } = …): son usos (asignan a variables que ya existen)
  function declararPatronAsignacion(p) {
    if (!p) return;
    if (p.type === 'Identifier') { A.usos.push({ nombre: p.name, start: p.start, end: p.end }); return; }
    if (p.type === 'ObjectPattern') for (const pr of p.properties) { if (pr.type === 'RestElement') declararPatronAsignacion(pr.argument); else { if (pr.computed) visitar(pr.key); declararPatronAsignacion(pr.value); } }
    else if (p.type === 'ArrayPattern') p.elements.forEach(declararPatronAsignacion);
    else if (p.type === 'AssignmentPattern') { declararPatronAsignacion(p.left); visitar(p.right); }
    else if (p.type === 'RestElement') declararPatronAsignacion(p.argument);
    else visitar(p);
  }
  for (const s of ast.body) visitar(s, ast, 'body', true);
  return A;
}
function nombresPatron(p) {
  if (!p) return [];
  if (p.type === 'Identifier') return [p.name];
  if (p.type === 'ObjectPattern') return p.properties.flatMap(pr => nombresPatron(pr.type === 'RestElement' ? pr.argument : pr.value));
  if (p.type === 'ArrayPattern') return p.elements.flatMap(nombresPatron);
  if (p.type === 'AssignmentPattern') return nombresPatron(p.left);
  if (p.type === 'RestElement') return nombresPatron(p.argument);
  return [];
}

// Lo que existe sin declararlo: JavaScript, Node, el navegador, Electron (renderer) y los tests
const GLOBALES_NAVEGADOR = 'window document navigator location history screen localStorage sessionStorage fetch alert confirm prompt console setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame requestIdleCallback HTMLElement HTMLCanvasElement HTMLInputElement HTMLImageElement HTMLAudioElement HTMLVideoElement Element Node NodeList Event CustomEvent KeyboardEvent MouseEvent PointerEvent TouchEvent FocusEvent InputEvent DragEvent WheelEvent Image Audio FileReader Blob File FormData URL URLSearchParams WebSocket Worker getComputedStyle matchMedia MutationObserver IntersectionObserver ResizeObserver performance crypto indexedDB Notification XMLHttpRequest DOMParser CanvasRenderingContext2D Path2D devicePixelRatio innerWidth innerHeight outerWidth outerHeight scrollX scrollY pageXOffset pageYOffset self globalThis open close print structuredClone queueMicrotask atob btoa caches customElements speechSynthesis SpeechSynthesisUtterance AudioContext OffscreenCanvas ImageData createImageBitmap BroadcastChannel EventSource Headers Request Response AbortController TextEncoder TextDecoder ShadowRoot DocumentFragment Range Selection getSelection frames parent top opener name status scrollTo scrollBy visualViewport electronAPI chrome'.split(' ');
const GLOBALES_NODE = 'require module exports __dirname __filename process Buffer global setImmediate clearImmediate arguments undefined NaN Infinity'.split(' ');
const GLOBALES_TEST = 'describe it test expect beforeEach afterEach beforeAll afterAll jest vi suite'.split(' ');
const GLOBALES_JS = new Set([...Object.getOwnPropertyNames(globalThis), ...GLOBALES_NAVEGADOR, ...GLOBALES_NODE, ...GLOBALES_TEST]);

// Módulos de Node que se pueden importar solos
const MODULOS_NODE = { fs: 'fs', path: 'path', os: 'os', http: 'http', https: 'https', crypto: 'crypto', url: 'url', util: 'util', events: 'events', readline: 'readline', zlib: 'zlib', stream: 'stream', net: 'net', assert: 'assert', child_process: 'child_process', childProcess: 'child_process', querystring: 'querystring', dns: 'dns' };
// Funciones sueltas que solo existen en un módulo (solo en la revisión final)
const NOMBRES_NODE = {
  fs: 'readFileSync writeFileSync existsSync mkdirSync readdirSync statSync unlinkSync appendFileSync copyFileSync renameSync rmSync createReadStream createWriteStream',
  path: 'basename dirname extname',
  child_process: 'exec execSync spawn spawnSync execFile execFileSync fork',
  util: 'promisify inspect',
  events: 'EventEmitter',
  crypto: 'randomUUID createHash randomBytes createHmac',
  url: 'fileURLToPath pathToFileURL',
  readline: 'createInterface',
  os: 'homedir tmpdir',
};
const NOMBRE_A_MODULO = {};
for (const [m, s] of Object.entries(NOMBRES_NODE)) for (const n of s.split(' ')) NOMBRE_A_MODULO[n] = m;
const ELECTRON = new Set('app BrowserWindow ipcMain ipcRenderer dialog Menu MenuItem shell contextBridge Tray nativeImage globalShortcut clipboard session webContents protocol powerMonitor nativeTheme systemPreferences autoUpdater crashReporter'.split(' '));

// Claves reales de un módulo de Node o de un objeto global conocido
const cacheClaves = new Map();
function clavesDe(obj) {
  const s = new Set();
  for (let o = obj, i = 0; o && i < 4; o = Object.getPrototypeOf(o), i++) for (const k of Object.getOwnPropertyNames(o)) s.add(k);
  for (const k in obj) s.add(k);
  return s;
}
function clavesModulo(m) {
  if (cacheClaves.has(m)) return cacheClaves.get(m);
  let s = null;
  try { s = clavesDe(require(m)); } catch {}
  cacheClaves.set(m, s);
  return s;
}
const NAMESPACES = { Math, JSON, Object, Array, Number, String, Promise, console, Reflect, Date, Symbol, process, Buffer, Intl };
// Métodos y propiedades muy usados de tipos básicos y del DOM: los únicos que se corrigen en objetos cualquiera
const COMUNES_JS = new Set(('push pop shift unshift forEach map filter reduce reduceRight includes indexOf lastIndexOf length slice splice join split replace replaceAll trim trimStart trimEnd toUpperCase toLowerCase startsWith endsWith padStart padEnd find findIndex findLast some every sort reverse concat keys values entries flat flatMap fill at charAt charCodeAt substring toFixed toString toLocaleString then catch finally log error warn info stringify parse ' +
  'addEventListener removeEventListener querySelector querySelectorAll getElementById getElementsByClassName getElementsByTagName appendChild removeChild replaceChild insertBefore createElement createTextNode setAttribute getAttribute removeAttribute hasAttribute textContent innerHTML innerText outerHTML className classList style value checked disabled preventDefault stopPropagation dispatchEvent getContext fillRect strokeRect clearRect fillText beginPath closePath moveTo lineTo arc stroke fill drawImage getBoundingClientRect scrollIntoView focus blur click remove append prepend closest matches dataset parentElement parentNode children firstChild lastChild nextSibling previousSibling getItem setItem removeItem clear has get set delete add size json text blob arrayBuffer ok status headers send sendFile listen use static render redirect').split(' '));
const PROPS_DOM = new Set('innerHTML textContent className classList innerText outerHTML length value checked style dataset parentElement parentNode children'.split(' '));
const ERRATAS_JS = { lenght: 'length', lengh: 'length', legnth: 'length', lentgh: 'length', heigth: 'height', widht: 'width' };
const PROTOS_JS = new Set([Array.prototype, String.prototype, Object.prototype, Map.prototype, Set.prototype, Promise.prototype, Number.prototype, Date.prototype, RegExp.prototype, Function.prototype].flatMap(p => Object.getOwnPropertyNames(p)));

// Datos del proyecto que hacen falta para no corregir de más: nombres globales de los <script> del navegador,
// propiedades que el propio proyecto define y lo que exporta cada archivo
function datosProyectoJS(cwd, archivoActual, textoActual) {
  const props = new Set(), globalesScripts = new Set(), porArchivo = new Map();
  for (const f of archivosProyecto(cwd, EXT_JS)) {
    const t = f === archivoActual ? textoActual : leer(f);
    if (t == null || t.length > 400000) continue;
    const p = parsearJS(t, path.extname(f).toLowerCase());
    if (!p) continue;
    const A = analizarJS(p.ast);
    porArchivo.set(f, { A, texto: t, sourceType: p.sourceType });
    A.propsDefinidas.forEach(x => props.add(x));
    // Un script sin require/import comparte sus nombres de nivel superior con los demás de la página
    if (f !== archivoActual && p.sourceType === 'script' && !A.requires.length && !A.imports.length) A.nivelSuperior.forEach(x => globalesScripts.add(x));
  }
  return { props, globalesScripts, porArchivo };
}
function resolverRelativo(desde, spec) {
  const base = path.resolve(path.dirname(desde), spec);
  for (const e of ['', '.js', '.mjs', '.cjs', '.ts', '/index.js', '/index.mjs', '/index.ts']) {
    const p = base + e;
    try { if (fs.statSync(p).isFile()) return p; } catch {}
  }
  return null;
}
// Lo que exporta un archivo JS: { nombres:Set|null (null = no se sabe), nivelSuperior:Set, objeto:nodo ObjectExpression|null }
function exportsDe(info) {
  if (!info) return null;
  const A = info.A;
  if (A.exportaTodo || A.exportsCJSveces > 1 || A.exportsDinamicos) return null; // varias asignaciones (código generado): no se sabe
  const nombres = new Set(A.exportsLista);
  let objeto = null;
  if (A.exportsCJS) {
    const r = A.exportsCJS;
    if (r.type === 'ObjectExpression') { objeto = r; for (const p of r.properties) if (p.type === 'Property' && !p.computed && p.key.type === 'Identifier') nombres.add(p.key.name); else if (p.type === 'SpreadElement') return null; }
    else if (r.type === 'Identifier' || r.type === 'FunctionExpression' || r.type === 'ArrowFunctionExpression' || r.type === 'ClassExpression' || r.type === 'NewExpression' || r.type === 'CallExpression') return { nombres: null, nivelSuperior: A.nivelSuperior, objeto: null, unico: true };
    else return null;
  }
  if (!nombres.size && !A.exportsCJS) return info.sourceType === 'module' || A.exportsLista.size ? { nombres, nivelSuperior: A.nivelSuperior, objeto } : null;
  return { nombres, nivelSuperior: A.nivelSuperior, objeto };
}

// Aplica cambios [{start,end,texto}] de atrás adelante (sin solaparse)
function aplicar(text, cambios) {
  const cs = [...cambios].sort((a, b) => b.start - a.start);
  let out = text, ultimo = Infinity;
  for (const c of cs) { if (c.end > ultimo) continue; out = out.slice(0, c.start) + c.texto + out.slice(c.end); ultimo = c.start; }
  return out;
}

// Dónde va un import nuevo: detrás del último require/import de nivel superior, o al principio
function puntoImport(text, A) {
  let pos = 0;
  for (const s of A.cuerpo) {
    const esImp = s.type === 'ImportDeclaration' || (s.type === 'VariableDeclaration' && s.declarations.some(d => d.init && d.init.type === 'CallExpression' && d.init.callee.type === 'Identifier' && d.init.callee.name === 'require'));
    const esDirectiva = s.type === 'ExpressionStatement' && s.directive;
    if (esImp || esDirectiva) pos = s.end; else break;
  }
  if (pos) { const nl = text.indexOf('\n', pos); return nl < 0 ? text.length : nl + 1; }
  if (text.startsWith('#!')) { const nl = text.indexOf('\n'); return nl < 0 ? text.length : nl + 1; }
  return 0;
}
// (con una línea en blanco detrás si lo siguiente es código y no otro import)
const lineaImport = (text, pos, linea) => (pos > 0 && text[pos - 1] !== '\n' ? '\n' : '') + linea + '\n' + (/^[ \t]*(\n|$|import\s|const\s+\w+\s*=\s*require|const\s*\{[^}]*\}\s*=\s*require|\/\/)/.test(text.slice(pos, pos + 120)) ? '' : '\n');

// Añade un nombre dentro de un patrón { a, b } ya escrito
function anadirAPatron(text, nodoPatron, nombre) {
  const cierre = nodoPatron.end - 1; // posición de '}'
  let i = cierre - 1; while (i > nodoPatron.start && /\s/.test(text[i])) i--;
  if (text[i] === ',') return { start: i + 1, end: i + 1, texto: ` ${nombre}` };
  if (text[i] === '{') return { start: i + 1, end: i + 1, texto: ` ${nombre} ` };
  return { start: i + 1, end: i + 1, texto: `, ${nombre}` };
}

export function corregirJS(file, text, cwd, modo = 'guardar', proyecto = null) {
  const ext = path.extname(file).toLowerCase();
  const res = { text, cambios: [], pendientes: [], otros: new Map() };
  const p = parsearJS(text, ext);
  if (!p) return res;
  const A = analizarJS(p.ast);
  const P = proyecto || datosProyectoJS(cwd, file, text);
  const final = modo === 'final';
  const cambios = [];
  const usado = new Set(); // posiciones ya cambiadas
  const cambiar = (start, end, texto, msg) => { if (usado.has(start)) return; usado.add(start); cambios.push({ start, end, texto }); res.cambios.push(`${path.basename(file)}:${lineaDe(text, start)}: ${msg}`); };

  const esModulo = p.sourceType === 'module' && (A.imports.length || A.exportsLista.size || ext === '.mjs');
  const usaDOM = A.usos.some(u => u.nombre === 'document' || u.nombre === 'window');
  let pkg = null;
  try { pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')); } catch {}
  const esNode = !usaDOM && (A.requires.length > 0 || A.usos.some(u => GLOBALES_NODE.includes(u.nombre) && u.nombre !== 'arguments' && u.nombre !== 'undefined') || ext === '.cjs' || esModulo || !!pkg);
  const declarados = new Set([...A.declarados, ...A.asignadosGlobal]);
  const conocidos = (n) => declarados.has(n) || GLOBALES_JS.has(n) || P.globalesScripts.has(n);

  // Variables que son un módulo: const fs = require('fs') / import fs from 'fs' / import * as fs from 'fs'
  const enlaces = new Map(); // nombre → módulo
  for (const r of A.requires) if (r.id.type === 'Identifier') enlaces.set(r.id.name, r.modulo);
  for (const im of A.imports) if (!im.reexporta) for (const s of im.nodo.specifiers) if (s.type !== 'ImportSpecifier') enlaces.set(s.local.name, im.modulo);
  const patronDe = (mod) => {
    const r = A.requires.find(x => x.modulo === mod && x.id.type === 'ObjectPattern');
    if (r) return { tipo: 'cjs', nodo: r.id };
    const im = A.imports.find(x => !x.reexporta && x.modulo === mod && x.nodo.specifiers.some(s => s.type === 'ImportSpecifier'));
    if (im) { const specs = im.nodo.specifiers.filter(s => s.type === 'ImportSpecifier'); return { tipo: 'esm', ultimo: specs[specs.length - 1] }; }
    return null;
  };

  // 1) Nombres sin declarar: import que falta, o nombre mal escrito
  const sinDeclarar = new Map();
  for (const u of A.usos) if (!conocidos(u.nombre)) { if (!sinDeclarar.has(u.nombre)) sinDeclarar.set(u.nombre, []); sinDeclarar.get(u.nombre).push(u); }
  const nuevosImports = [];
  const pos = puntoImport(text, A);
  for (const [nombre, usos] of sinDeclarar) {
    // a) módulo de Node entero (fs, path…)
    if (esNode && MODULOS_NODE[nombre]) {
      const mod = MODULOS_NODE[nombre];
      nuevosImports.push(esModulo ? `import ${nombre} from '${mod}';` : `const ${nombre} = require('${mod}');`);
      enlaces.set(nombre, mod);
      res.cambios.push(`${path.basename(file)}: añadido el import que faltaba de '${mod}' (se usa ${nombre} en la línea ${lineaDe(text, usos[0].start)})`);
      continue;
    }
    // b) una función suelta de un módulo (readFileSync, exec…) o de Electron
    const modNombre = esNode ? NOMBRE_A_MODULO[nombre] : null;
    const patElectron = ELECTRON.has(nombre) ? patronDe('electron') : null;
    if (patElectron || (final && modNombre)) {
      const mod = patElectron ? 'electron' : modNombre;
      const pat = patElectron || patronDe(mod);
      if (pat?.tipo === 'cjs') cambios.push(anadirAPatron(text, pat.nodo, nombre));
      else if (pat?.tipo === 'esm') cambios.push({ start: pat.ultimo.end, end: pat.ultimo.end, texto: `, ${nombre}` });
      else nuevosImports.push(esModulo ? `import { ${nombre} } from '${mod}';` : `const { ${nombre} } = require('${mod}');`);
      res.cambios.push(`${path.basename(file)}: añadido ${nombre} al import de '${mod}' (se usa en la línea ${lineaDe(text, usos[0].start)})`);
      continue;
    }
    // c) nombre mal escrito: solo en la revisión final (al guardar puede que se defina en una parte que aún no está escrita)
    if (!final) continue;
    let cand = masParecido(nombre, [...declarados, ...P.globalesScripts]) || masParecido(nombre, GLOBALES_JS, { maxDist: 1 });
    // Una clase (WebSocketPair) no se cambia por una variable (webSocketPair): suele ser algo global del entorno
    if (cand && /^[A-Z]/.test(nombre) && /^[a-z]/.test(cand)) cand = null;
    if (cand) {
      for (const u of usos) cambiar(u.start, u.end, u.abreviado ? `${nombre}: ${cand}` : cand, `\`${nombre}\` no existe → \`${cand}\``);
    } else {
      res.pendientes.push(`${path.relative(cwd, file)}:${lineaDe(text, usos[0].start)}: se usa \`${nombre}\`, pero no está definido en ningún sitio${final ? '' : ''}. Defínelo, impórtalo o corrige el nombre.`);
    }
  }
  if (nuevosImports.length) cambios.push({ start: pos, end: pos, texto: lineaImport(text, pos, [...new Set(nuevosImports)].join('\n')) });

  // 2) Métodos inventados de módulos conocidos y de objetos globales (fs.readFileAsync, Math.flor, JSON.parce)
  for (const m of A.miembros) {
    let claves = null, origen = '';
    if (m.objNombre && enlaces.has(m.objNombre) && !enlaces.get(m.objNombre).startsWith('.')) {
      const mod = enlaces.get(m.objNombre);
      if (/^(node:)?[a-z_]+$/.test(mod) && require('module').builtinModules.includes(mod.replace(/^node:/, ''))) { claves = clavesModulo(mod.replace(/^node:/, '')); origen = `'${mod}'`; }
    } else if (m.objNombre && NAMESPACES[m.objNombre] && !declarados.has(m.objNombre)) { claves = clavesDe(NAMESPACES[m.objNombre]); origen = m.objNombre; }
    if (!claves) continue;
    if (claves.has(m.prop)) continue;
    const cand = masParecido(m.prop, claves);
    if (cand) cambiar(m.start, m.end, cand, `${m.objNombre}.${m.prop} no existe en ${origen} → ${m.objNombre}.${cand}`);
    else if (final) res.pendientes.push(`${path.relative(cwd, file)}:${lineaDe(text, m.start)}: ${m.objNombre}.${m.prop} no existe en ${origen}.`);
  }

  // 3) Métodos mal escritos de tipos básicos y del DOM (texto.toUppercase(), lista.lenght)
  for (const m of A.miembros) {
    if (usado.has(m.start) || (m.objNombre && (enlaces.has(m.objNombre) || NAMESPACES[m.objNombre]))) continue;
    if (P.props.has(m.prop) || PROTOS_JS.has(m.prop) || COMUNES_JS.has(m.prop)) continue;
    // En propiedades solo se corrigen mayúsculas y erratas conocidas; en métodos llamados, también una letra
    // (pero nunca singular/plural: .errors y .error pueden ser dos cosas distintas)
    let mayus = masParecido(m.prop, COMUNES_JS, { soloMayusculas: true });
    if (mayus && !m.llamado && !PROPS_DOM.has(mayus)) mayus = null; // Enum.Stringify puede ser de verdad así
    let cand = mayus || ERRATAS_JS[m.prop] || (m.llamado && m.prop.length >= 6 ? masParecido(m.prop, COMUNES_JS, { maxDist: 1 }) : null);
    if (cand && !mayus && (cand + 's' === m.prop || m.prop + 's' === cand)) cand = null;
    if (cand) cambiar(m.start, m.end, cand, `.${m.prop} → .${cand}`);
  }

  // 4) Revisión final: nombres entre archivos del proyecto
  if (final) cruzarJS(file, text, A, P, cwd, cambiar, res);

  if (cambios.length) res.text = aplicar(text, cambios);
  return res;
}

function cruzarJS(file, text, A, P, cwd, cambiar, res) {
  const rel = (f) => path.relative(cwd, f);
  const locales = [
    ...A.requires.filter(r => r.modulo.startsWith('.')).map(r => ({ modulo: r.modulo, litStart: r.litStart, litEnd: r.litEnd, patron: r.id.type === 'ObjectPattern' ? r.id : null, nombre: r.id.type === 'Identifier' ? r.id.name : null, esm: false })),
    ...A.imports.filter(i => i.modulo.startsWith('.')).map(i => ({ modulo: i.modulo, litStart: i.nodo.source.start, litEnd: i.nodo.source.end, specs: i.nodo.specifiers, esm: true, reexporta: i.reexporta })),
  ];
  for (const L of locales) {
    let destino = resolverRelativo(file, L.modulo);
    if (!destino) {
      // ¿Ruta mal escrita? (./utlis → ./utils)
      const dir = path.resolve(path.dirname(file), path.dirname(L.modulo));
      const base = path.basename(L.modulo).replace(/\.(m?js|cjs|ts)$/, '');
      let hermanos = [];
      try { hermanos = fs.readdirSync(dir).filter(x => /\.(m?js|cjs|ts)$/.test(x)).map(x => x.replace(/\.(m?js|cjs|ts)$/, '')); } catch {}
      const cand = masParecido(base, hermanos);
      if (cand) {
        const nuevo = L.modulo.slice(0, L.modulo.length - path.basename(L.modulo).length) + path.basename(L.modulo).replace(base, cand);
        const q = text[L.litStart];
        cambiar(L.litStart, L.litEnd, q + nuevo + q, `'${L.modulo}' no existe → '${nuevo}'`);
        destino = resolverRelativo(file, nuevo);
      } else { res.pendientes.push(`${rel(file)}:${lineaDe(text, L.litStart)}: importa '${L.modulo}', que no existe.`); continue; }
    }
    if (!destino || !/\.(m?js|cjs|ts|mts|cts)$/.test(destino)) continue;
    const info = P.porArchivo.get(destino);
    const ex = exportsDe(info);
    if (!ex || !ex.nombres) continue;
    const lista = [...ex.nombres].filter(x => x !== 'default');
    // Si existe en el otro archivo pero no se exporta, se añade a su module.exports = { … } (o export { … })
    const exportar = (nombre) => {
      if (!ex.nivelSuperior.has(nombre)) return false;
      const otro = res.otros.get(destino) ?? info.texto;
      let nuevo = null;
      if (ex.objeto && info.texto === otro) {
        const c = anadirAPatron(otro, ex.objeto, nombre);
        nuevo = otro.slice(0, c.start) + c.texto + otro.slice(c.end);
      } else if (info.sourceType === 'module' || info.A.exportsLista.size) nuevo = otro.replace(/\s*$/, '') + `\nexport { ${nombre} };\n`;
      if (nuevo == null) return false;
      res.otros.set(destino, nuevo);
      ex.nombres.add(nombre);
      res.cambios.push(`${rel(destino)}: ${nombre} existía pero no se exportaba → añadido a lo que exporta (lo usa ${rel(file)})`);
      return true;
    };
    const comprobar = (nombre, start, reescribir) => {
      if (ex.nombres.has(nombre)) return;
      if (exportar(nombre)) return;
      const cand = masParecido(nombre, lista);
      if (cand) reescribir(cand);
      else res.pendientes.push(`${rel(file)}:${lineaDe(text, start)}: ${rel(destino)} no exporta \`${nombre}\`. Exporta: ${lista.join(', ') || '(nada)'}.`);
    };
    if (L.patron) for (const pr of L.patron.properties) {
      if (pr.type !== 'Property' || pr.computed || pr.key.type !== 'Identifier') continue;
      comprobar(pr.key.name, pr.key.start, (cand) => cambiar(pr.key.start, pr.shorthand ? pr.value.end : pr.key.end, pr.shorthand ? `${cand}: ${pr.key.name}` : cand, `${rel(destino)} no exporta \`${pr.key.name}\` → \`${cand}\``));
    }
    if (L.specs) for (const s of L.specs) {
      if (s.type !== 'ImportSpecifier' || L.reexporta) continue;
      const imp = s.imported.name ?? s.imported.value;
      comprobar(imp, s.start, (cand) => cambiar(s.imported.start, s.imported.end, s.local.start === s.imported.start ? `${cand} as ${imp}` : cand, `${rel(destino)} no exporta \`${imp}\` → \`${cand}\``));
    }
    // const m = require('./x'); m.funcion()  /  import * as m from './x'
    const ns = L.nombre || (L.specs || []).find(s => s.type === 'ImportNamespaceSpecifier')?.local.name;
    if (ns) for (const m of A.miembros) {
      if (m.objNombre !== ns) continue;
      comprobar(m.prop, m.start, (cand) => cambiar(m.start, m.end, cand, `${rel(destino)} no exporta \`${m.prop}\` → \`${cand}\``));
    }
  }
}

// ---------------------------------------------------------------------------
// Python: lo hace corrector.py (con el analizador oficial de Python)
// ---------------------------------------------------------------------------
export function corregirPY(file, text, cwd, modo = 'guardar') {
  const res = { text, cambios: [], pendientes: [], otros: new Map() };
  try {
    const out = execFileSync('python3', [path.join(AQUI, 'corrector.py')], { input: JSON.stringify({ file, text, cwd, modo }), encoding: 'utf8', timeout: 20000, maxBuffer: 20 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
    const j = JSON.parse(out);
    if (typeof j.text === 'string') res.text = j.text;
    res.cambios = j.cambios || [];
    res.pendientes = j.pendientes || [];
  } catch {}
  return res;
}

// Un archivo (al guardarlo o en la revisión final)
export function corregirArchivo(file, text, cwd, modo = 'guardar', proyecto = null) {
  const ext = path.extname(file).toLowerCase();
  try {
    if (EXT_JS.includes(ext)) return corregirJS(file, text, cwd, modo, proyecto);
    if (EXT_PY.includes(ext)) return corregirPY(file, text, cwd, modo);
  } catch (e) { return { text, cambios: [], pendientes: [], otros: new Map(), error: e.message }; }
  return { text, cambios: [], pendientes: [], otros: new Map() };
}

// Revisión final de los archivos tocados: devuelve los textos nuevos de cada archivo cambiado (incluidos
// los otros archivos a los que hubo que añadir un export), la lista de cambios y lo que no se pudo arreglar
export function revisarProyecto(cwd, archivos) {
  const textos = new Map(), cambios = [], pendientes = [];
  const lista = [...new Set(archivos)].filter(f => [...EXT_JS, ...EXT_PY].includes(path.extname(f).toLowerCase()) && fs.existsSync(f));
  const actual = (f) => textos.get(f) ?? leer(f);
  for (const f of lista) {
    const t = actual(f);
    if (t == null) continue;
    const r = corregirArchivo(f, t, cwd, 'final');
    if (r.text !== t) textos.set(f, r.text);
    for (const [o, ot] of r.otros || []) textos.set(o, ot);
    cambios.push(...r.cambios);
    pendientes.push(...r.pendientes);
  }
  return { textos, cambios: [...new Set(cambios)], pendientes: [...new Set(pendientes)] };
}

// Nombres que define un trozo de código en su nivel superior (sin contar los imports)
export function nombresDefinidos(file, text) {
  const ext = path.extname(file).toLowerCase();
  try {
    if (EXT_JS.includes(ext)) {
      const p = parsearJS(text, ext); if (!p) return new Set();
      const A = analizarJS(p.ast);
      const imp = new Set([...A.requires.flatMap(r => nombresPatron(r.id)), ...A.imports.flatMap(i => (i.nodo.specifiers || []).map(s => s.local.name))]);
      return new Set([...A.nivelSuperior].filter(n => !imp.has(n)));
    }
    if (EXT_PY.includes(ext)) {
      const out = execFileSync('python3', [path.join(AQUI, 'corrector.py'), '--definidos'], { input: text, encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      return new Set(out ? out.split(', ') : []);
    }
  } catch {}
  return new Set();
}

// Resumen corto de los nombres de un archivo, para que el modelo use siempre los mismos
export function resumenNombres(file, text) {
  const ext = path.extname(file).toLowerCase();
  try {
    if (EXT_JS.includes(ext)) {
      const p = parsearJS(text, ext); if (!p) return '';
      const A = analizarJS(p.ast);
      const ex = exportsDe({ A, texto: text, sourceType: p.sourceType });
      const top = [...A.nivelSuperior].filter(n => !A.requires.some(r => nombresPatron(r.id).includes(n)) && !A.imports.some(i => i.nodo.specifiers?.some(s => s.local.name === n)));
      const partes = [];
      if (top.length) partes.push(`define: ${top.slice(0, 40).join(', ')}`);
      if (ex?.nombres?.size) partes.push(`exporta: ${[...ex.nombres].slice(0, 40).join(', ')}`);
      return partes.length ? `\nNombres en ${path.basename(file)} (úsalos exactamente así): ${partes.join(' · ')}` : '';
    }
    if (EXT_PY.includes(ext)) {
      const out = execFileSync('python3', [path.join(AQUI, 'corrector.py'), '--definidos'], { input: text, encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      return out ? `\nNombres en ${path.basename(file)} (úsalos exactamente así): define: ${out}` : '';
    }
  } catch {}
  return '';
}
