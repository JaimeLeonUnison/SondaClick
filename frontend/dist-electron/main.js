import { app as c, dialog as w, ipcMain as q, BrowserWindow as R, screen as F, nativeImage as Q, Tray as z, Notification as B, Menu as H } from "electron";
import * as f from "path";
import G from "path";
import { spawn as J, exec as X } from "child_process";
import * as k from "fs";
import Z from "fs";
import ee from "os";
import oe from "crypto";
import { fileURLToPath as ne } from "node:url";
var y = { exports: {} };
const re = "16.5.0", ae = {
  version: re
}, D = Z, V = G, te = ee, se = oe, ce = ae, j = ce.version, ie = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/mg;
function le(e) {
  const o = {};
  let n = e.toString();
  n = n.replace(/\r\n?/mg, `
`);
  let a;
  for (; (a = ie.exec(n)) != null; ) {
    const i = a[1];
    let r = a[2] || "";
    r = r.trim();
    const t = r[0];
    r = r.replace(/^(['"`])([\s\S]*)\1$/mg, "$2"), t === '"' && (r = r.replace(/\\n/g, `
`), r = r.replace(/\\r/g, "\r")), o[i] = r;
  }
  return o;
}
function de(e) {
  const o = K(e), n = p.configDotenv({ path: o });
  if (!n.parsed) {
    const t = new Error(`MISSING_DATA: Cannot parse ${o} for an unknown reason`);
    throw t.code = "MISSING_DATA", t;
  }
  const a = U(e).split(","), i = a.length;
  let r;
  for (let t = 0; t < i; t++)
    try {
      const l = a[t].trim(), d = fe(n, l);
      r = p.decrypt(d.ciphertext, d.key);
      break;
    } catch (l) {
      if (t + 1 >= i)
        throw l;
    }
  return p.parse(r);
}
function ue(e) {
  console.log(`[dotenv@${j}][WARN] ${e}`);
}
function b(e) {
  console.log(`[dotenv@${j}][DEBUG] ${e}`);
}
function U(e) {
  return e && e.DOTENV_KEY && e.DOTENV_KEY.length > 0 ? e.DOTENV_KEY : process.env.DOTENV_KEY && process.env.DOTENV_KEY.length > 0 ? process.env.DOTENV_KEY : "";
}
function fe(e, o) {
  let n;
  try {
    n = new URL(o);
  } catch (l) {
    if (l.code === "ERR_INVALID_URL") {
      const d = new Error("INVALID_DOTENV_KEY: Wrong format. Must be in valid uri format like dotenv://:key_1234@dotenvx.com/vault/.env.vault?environment=development");
      throw d.code = "INVALID_DOTENV_KEY", d;
    }
    throw l;
  }
  const a = n.password;
  if (!a) {
    const l = new Error("INVALID_DOTENV_KEY: Missing key part");
    throw l.code = "INVALID_DOTENV_KEY", l;
  }
  const i = n.searchParams.get("environment");
  if (!i) {
    const l = new Error("INVALID_DOTENV_KEY: Missing environment part");
    throw l.code = "INVALID_DOTENV_KEY", l;
  }
  const r = `DOTENV_VAULT_${i.toUpperCase()}`, t = e.parsed[r];
  if (!t) {
    const l = new Error(`NOT_FOUND_DOTENV_ENVIRONMENT: Cannot locate environment ${r} in your .env.vault file.`);
    throw l.code = "NOT_FOUND_DOTENV_ENVIRONMENT", l;
  }
  return { ciphertext: t, key: a };
}
function K(e) {
  let o = null;
  if (e && e.path && e.path.length > 0)
    if (Array.isArray(e.path))
      for (const n of e.path)
        D.existsSync(n) && (o = n.endsWith(".vault") ? n : `${n}.vault`);
    else
      o = e.path.endsWith(".vault") ? e.path : `${e.path}.vault`;
  else
    o = V.resolve(process.cwd(), ".env.vault");
  return D.existsSync(o) ? o : null;
}
function A(e) {
  return e[0] === "~" ? V.join(te.homedir(), e.slice(1)) : e;
}
function pe(e) {
  !!(e && e.debug) && b("Loading env from encrypted .env.vault");
  const n = p._parseVault(e);
  let a = process.env;
  return e && e.processEnv != null && (a = e.processEnv), p.populate(a, n, e), { parsed: n };
}
function ge(e) {
  const o = V.resolve(process.cwd(), ".env");
  let n = "utf8";
  const a = !!(e && e.debug);
  e && e.encoding ? n = e.encoding : a && b("No encoding is specified. UTF-8 is used by default");
  let i = [o];
  if (e && e.path)
    if (!Array.isArray(e.path))
      i = [A(e.path)];
    else {
      i = [];
      for (const d of e.path)
        i.push(A(d));
    }
  let r;
  const t = {};
  for (const d of i)
    try {
      const u = p.parse(D.readFileSync(d, { encoding: n }));
      p.populate(t, u, e);
    } catch (u) {
      a && b(`Failed to load ${d} ${u.message}`), r = u;
    }
  let l = process.env;
  return e && e.processEnv != null && (l = e.processEnv), p.populate(l, t, e), r ? { parsed: t, error: r } : { parsed: t };
}
function he(e) {
  if (U(e).length === 0)
    return p.configDotenv(e);
  const o = K(e);
  return o ? p._configVault(e) : (ue(`You set DOTENV_KEY but you are missing a .env.vault file at ${o}. Did you forget to build it?`), p.configDotenv(e));
}
function me(e, o) {
  const n = Buffer.from(o.slice(-64), "hex");
  let a = Buffer.from(e, "base64");
  const i = a.subarray(0, 12), r = a.subarray(-16);
  a = a.subarray(12, -16);
  try {
    const t = se.createDecipheriv("aes-256-gcm", n, i);
    return t.setAuthTag(r), `${t.update(a)}${t.final()}`;
  } catch (t) {
    const l = t instanceof RangeError, d = t.message === "Invalid key length", u = t.message === "Unsupported state or unable to authenticate data";
    if (l || d) {
      const h = new Error("INVALID_DOTENV_KEY: It must be 64 characters long (or more)");
      throw h.code = "INVALID_DOTENV_KEY", h;
    } else if (u) {
      const h = new Error("DECRYPTION_FAILED: Please check your DOTENV_KEY");
      throw h.code = "DECRYPTION_FAILED", h;
    } else
      throw t;
  }
}
function Ee(e, o, n = {}) {
  const a = !!(n && n.debug), i = !!(n && n.override);
  if (typeof o != "object") {
    const r = new Error("OBJECT_REQUIRED: Please check the processEnv argument being passed to populate");
    throw r.code = "OBJECT_REQUIRED", r;
  }
  for (const r of Object.keys(o))
    Object.prototype.hasOwnProperty.call(e, r) ? (i === !0 && (e[r] = o[r]), a && b(i === !0 ? `"${r}" is already defined and WAS overwritten` : `"${r}" is already defined and was NOT overwritten`)) : e[r] = o[r];
}
const p = {
  configDotenv: ge,
  _configVault: pe,
  _parseVault: de,
  config: he,
  decrypt: me,
  parse: le,
  populate: Ee
};
y.exports.configDotenv = p.configDotenv;
y.exports._configVault = p._configVault;
y.exports._parseVault = p._parseVault;
var ve = y.exports.config = p.config;
y.exports.decrypt = p.decrypt;
y.exports.parse = p.parse;
y.exports.populate = p.populate;
y.exports = p;
const Pe = ne(import.meta.url), Y = f.dirname(Pe), _ = f.join(Y, ".."), $ = process.env.VITE_DEV_SERVER_URL, T = f.join(_, "dist");
process.env.VITE_PUBLIC = $ ? f.join(_, "public") : T;
let s = null, v = null;
const x = 5e3;
let m = null, E = !1;
c.isQuitting = !1;
function ke() {
  const e = f.join(_, ".."), o = c.isPackaged ? f.join(c.getAppPath(), "packaged-resources", ".env") : f.join(e, ".env");
  console.log(`[Main Process] Intentando cargar .env desde: ${o}`), k.existsSync(o) || console.warn(`[Main Process] Advertencia: Archivo .env no encontrado en ${o}`);
  const n = ve({ path: o });
  return n.error ? (console.error("[Main Process] Error cargando el archivo .env:", n.error), w.showErrorBox("Error de Configuración", `No se pudo cargar el archivo .env desde ${o}. La aplicación podría no funcionar correctamente.`)) : Object.keys(n.parsed || {}).length > 0 ? console.log("[Main Process] .env cargado exitosamente.") : k.existsSync(o) && console.warn("[Main Process] .env encontrado pero vacío o con error de parseo no capturado."), n.parsed || {};
}
function O() {
  return new Promise((e, o) => {
    const n = ke(), a = f.join(_, ".."), i = "SondaClickBackend.exe", r = c.isPackaged ? f.join(c.getAppPath(), "packaged-backend", i) : f.join(a, "backend", "dist", i);
    if (console.log(`[Main Process - startBackend] Intentando iniciar backend desde: ${r}`), !k.existsSync(r)) {
      const g = `[Main Process - startBackend] Error: El ejecutable del backend no se encontró en ${r}`;
      console.error(g), c.isPackaged && w.showErrorBox("Error Crítico de Backend", `El archivo del backend no se encontró en la ruta esperada: ${r}. La aplicación no puede continuar.`), o(new Error(g));
      return;
    }
    const t = {
      ...process.env,
      ...n
    }, l = f.dirname(r);
    v = J(r, [], {
      shell: !1,
      cwd: l,
      env: t,
      stdio: "inherit"
      // Cambiar a ['ignore', out, err] si quieres redirigir a archivos de log
    }), console.log("[Main Process - startBackend] Proceso backend invocado."), v.on("error", (g) => {
      console.error("[Main Process - startBackend] Fallo al iniciar el proceso del backend:", g), c.isPackaged && w.showErrorBox("Error de Backend", "No se pudo iniciar el proceso del backend: " + g.message), v = null, o(g);
    }), v.on("exit", (g, M) => {
      console.log(`[Main Process - startBackend] Proceso del backend terminó con código ${g} y señal ${M}`), g !== 0 && c.isPackaged && !c.isQuitting && w.showErrorBox("Error de Backend", `El proceso del backend terminó inesperadamente. Código: ${g}, Señal: ${M}. Por favor, reinicie la aplicación.`), v = null;
    });
    let d = 0;
    const u = 20, h = 1500, W = 3e3, S = () => {
      fetch(`http://localhost:${x}/api/check-domain`).then((g) => {
        if (g.ok)
          console.log("[Main Process] ¡Backend listo!"), e();
        else
          throw new Error(`[Main Process] Backend respondió con ${g.status}`);
      }).catch((g) => {
        d++, d < u ? (console.log(`[Main Process] Backend no listo, reintentando (${d}/${u}). Error: ${g.message}`), setTimeout(S, h)) : (console.error("[Main Process] Backend falló al iniciar después de múltiples reintentos."), o(new Error("Timeout del backend: No se pudo conectar después de varios intentos.")));
      });
    };
    setTimeout(S, W);
  });
}
function L(e, o) {
  if (B.isSupported()) {
    console.log("[Main Process] showMainProcessNotification: Mostrando notificación - Título:", e);
    const n = "icon.ico", a = process.env.VITE_PUBLIC ? f.join(process.env.VITE_PUBLIC, n) : f.join(T, n);
    k.existsSync(a) || console.warn(`[Main Process] Icono de notificación no encontrado en ${a}`);
    const i = new B({
      title: e,
      body: o,
      icon: k.existsSync(a) ? a : void 0
      // Solo pasar el ícono si existe
    });
    i.show(), i.on("click", () => {
      console.log("[Main Process] Notificación del proceso principal clickeada:", e), s == null || s.show(), s == null || s.focus();
    }), i.on("close", () => console.log("[Main Process] Notificación del proceso principal cerrada:", e));
  } else
    console.log("[Main Process] Las notificaciones no son compatibles en este sistema.");
}
function P() {
  if (!m) return;
  const e = C.find((n) => n.id === "toggleWindow");
  e && (e.label = E ? "Mostrar SondaClick" : "Ocultar SondaClick");
  const o = H.buildFromTemplate(C);
  m.setContextMenu(o);
}
const C = [
  {
    id: "toggleWindow",
    label: "Ocultar SondaClick",
    // Etiqueta inicial
    click: () => {
      s && (E ? (s.show(), process.platform === "darwin" ? c.focus({ steal: !0 }) : s.focus()) : s.hide(), E = !E, P());
    }
  },
  { type: "separator" },
  {
    id: "quit",
    label: "Salir de SondaClick",
    click: () => {
      c.isQuitting = !0, c.quit();
    }
  }
];
function I() {
  const e = "icon.ico", o = process.env.VITE_PUBLIC ? f.join(process.env.VITE_PUBLIC, e) : f.join(T, e), n = F.getPrimaryDisplay(), { width: a, height: i } = n.workAreaSize, r = 400, t = 580, l = a - r, d = i - t;
  if (s = new R({
    width: r,
    // Usar el ancho definido
    height: t,
    // Usar el alto definido
    x: l,
    // Establecer la posición X calculada
    y: d,
    // Establecer la posición Y calculada
    icon: k.existsSync(o) ? o : void 0,
    autoHideMenuBar: !0,
    resizable: !1,
    // Hacer la ventana no redimensionable para mantener la posición y tamaño
    movable: !1,
    maximizable: !1,
    //Quitar botón de maximizar
    minimizable: !1,
    //Quitar botón de minimizar
    // frame: false,       // Opcional: si quieres una ventana sin bordes (más tipo widget)
    // alwaysOnTop: true,  // Opcional: si quieres que esté siempre visible encima de otras apps
    webPreferences: {
      preload: f.join(Y, "preload.js"),
      // Tu preload existente, ahora usa el __dirname de ESM
      nodeIntegration: !1,
      contextIsolation: !0
    }
  }), s.webContents.on("did-finish-load", () => {
    s == null || s.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  }), $)
    s.loadURL($);
  else {
    const u = f.join(T, "index.html");
    if (!k.existsSync(u)) {
      console.error(`[Main Process] Error: index.html no encontrado en ${u}`), w.showErrorBox("Error Crítico", `No se pudo cargar la interfaz de la aplicación. Archivo no encontrado: ${u}`), c.isQuitting = !0, c.quit();
      return;
    }
    s.loadFile(u);
  }
  s.on("close", (u) => {
    c.isQuitting || (u.preventDefault(), s == null || s.hide(), E = !0, P());
  }), c.isPackaged ? console.log("[Main Process - createWindow] Aplicación empaquetada. Abriendo DevTools para depuración.") : console.log("[Main Process - createWindow] Aplicación en desarrollo. Abriendo DevTools.");
}
function N() {
  const e = "icon.ico", o = process.env.VITE_PUBLIC ? f.join(process.env.VITE_PUBLIC, e) : f.join(T, e);
  if (console.log(`[Main Process] Intentando cargar icono para Tray desde: ${o}`), !k.existsSync(o)) {
    console.error(`[Main Process] Error: La imagen del icono para la bandeja no se encontró en ${o}. No se creará la bandeja.`);
    return;
  }
  let n;
  try {
    if (n = Q.createFromPath(o), n.isEmpty()) {
      console.error(`[Main Process] Error: La imagen del icono en ${o} está vacía o no se pudo cargar.`);
      return;
    }
  } catch (a) {
    console.error(`[Main Process] Error al crear nativeImage desde ${o}:`, a);
    return;
  }
  m = new z(n), m.setToolTip("SondaClick Agente"), P(), m.on("click", () => {
    s && (E ? (s.show(), process.platform === "darwin" ? c.focus({ steal: !0 }) : s.focus()) : s.hide(), E = !E, P());
  });
}
const ye = c.requestSingleInstanceLock();
ye ? (c.on("second-instance", () => {
  console.log("[Main Process] Se intentó abrir una segunda instancia."), s && (s.isMinimized() && s.restore(), s.isVisible() || s.show(), s.focus(), E = !1, P());
}), process.platform === "win32" && c.setAppUserModelId("SondaClick.Mexico"), c.whenReady().then(async () => {
  console.log("[Main Process] app.whenReady: Iniciando (instancia única)...");
  try {
    await O(), console.log("[Main Process] Backend iniciado. Creando ventana y Tray..."), I(), N(), setTimeout(() => {
      L("¡Bienvenido a SondaClick!", "La aplicación se ha iniciado correctamente.");
    }, 1e3);
  } catch (e) {
    console.error("[Main Process] Error crítico durante el inicio:", e);
    const o = e instanceof Error ? e.message : String(e);
    w.showErrorBox("Error Crítico de Inicio", `No se pudo iniciar la aplicación correctamente. La aplicación se cerrará.

Detalles: ${o}`), c.isQuitting = !0, c.quit();
  }
}), q.on("show-native-notification", (e, { title: o, body: n }) => {
  console.log("[Main Process] Recibida solicitud IPC 'show-native-notification'"), L(o, n);
}), c.on("before-quit", (e) => {
  if (c.isQuitting, console.log("[Main Process] Evento before-quit (lógica de limpieza mejorada) recibido."), c.isQuitting = !0, m) {
    console.log("[Main Process] Destruyendo icono de la bandeja del sistema desde before-quit.");
    try {
      m.destroy();
    } catch (t) {
      console.error("[Main Process] Error destruyendo el tray:", t);
    }
    m = null;
  }
  const o = "SondaClickBackend.exe", n = () => {
    console.log("[Main Process] Limpieza finalizada o tiempo de espera agotado. Saliendo de la aplicación..."), v && (v = null), c.exit(0);
  }, a = 8e3, i = setTimeout(() => {
    console.warn(`[Main Process] El tiempo de espera general de ${a}ms para la limpieza ha expirado.`), n();
  }, a), r = () => {
    console.log("[Main Process] Procediendo con taskkill para el backend."), process.platform === "win32" ? X(`taskkill /IM "${o}" /F /T`, (t) => {
      clearTimeout(i), console.log(`[Main Process] Comando taskkill para ${o} ejecutado.`), n();
    }) : (clearTimeout(i), n());
  };
  if (v) {
    console.log(`[Main Process] Intentando cierre ordenado del backend en http://localhost:${x}/shutdown`);
    const t = new AbortController(), l = t.signal, u = setTimeout(() => t.abort(), 2e3);
    fetch(`http://localhost:${x}/shutdown`, { method: "POST", signal: l }).then((h) => {
      clearTimeout(u), console.log(`[Main Process] Solicitud de cierre ordenado enviada. Respuesta: ${h.status}`), setTimeout(r, 500);
    }).catch((h) => {
      clearTimeout(u), h.name, r();
    });
  } else
    console.log("[Main Process] No hay proceso backend registrado o ya se ha cerrado. Procediendo con la salida."), clearTimeout(i), n();
}), c.on("window-all-closed", () => {
  c.isQuitting ? process.platform : console.log("[Main Process] Todas las ventanas cerradas, pero la app sigue en la bandeja.");
}), c.on("activate", () => {
  R.getAllWindows().length === 0 ? c.isQuitting || (v ? (I(), m ? P() : N()) : (console.warn("[Main Process] activate event: Backend no está corriendo. Intentando reiniciar backend..."), O().then(() => {
    I(), m ? P() : N();
  }).catch((e) => {
    const o = e instanceof Error ? e.message : String(e);
    w.showErrorBox("Error de Reactivación", `No se pudo reiniciar el backend al activar la aplicación. Error: ${o}`);
  }))) : (s == null || s.show(), s == null || s.focus(), E = !1, P());
})) : (console.log("[Main Process] Otra instancia ya está en ejecución. Saliendo de esta instancia."), c.quit());
