"use strict";
const electron = require("electron");
const path$1 = require("path");
const child_process = require("child_process");
const fs$1 = require("fs");
const require$$2 = require("os");
const require$$3 = require("crypto");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const path__namespace = /* @__PURE__ */ _interopNamespaceDefault(path$1);
const fs__namespace = /* @__PURE__ */ _interopNamespaceDefault(fs$1);
var main = { exports: {} };
const version$1 = "16.5.0";
const require$$4 = {
  version: version$1
};
const fs = fs$1;
const path = path$1;
const os = require$$2;
const crypto = require$$3;
const packageJson = require$$4;
const version = packageJson.version;
const LINE = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/mg;
function parse(src) {
  const obj = {};
  let lines = src.toString();
  lines = lines.replace(/\r\n?/mg, "\n");
  let match;
  while ((match = LINE.exec(lines)) != null) {
    const key = match[1];
    let value = match[2] || "";
    value = value.trim();
    const maybeQuote = value[0];
    value = value.replace(/^(['"`])([\s\S]*)\1$/mg, "$2");
    if (maybeQuote === '"') {
      value = value.replace(/\\n/g, "\n");
      value = value.replace(/\\r/g, "\r");
    }
    obj[key] = value;
  }
  return obj;
}
function _parseVault(options) {
  const vaultPath = _vaultPath(options);
  const result = DotenvModule.configDotenv({ path: vaultPath });
  if (!result.parsed) {
    const err = new Error(`MISSING_DATA: Cannot parse ${vaultPath} for an unknown reason`);
    err.code = "MISSING_DATA";
    throw err;
  }
  const keys = _dotenvKey(options).split(",");
  const length = keys.length;
  let decrypted;
  for (let i = 0; i < length; i++) {
    try {
      const key = keys[i].trim();
      const attrs = _instructions(result, key);
      decrypted = DotenvModule.decrypt(attrs.ciphertext, attrs.key);
      break;
    } catch (error) {
      if (i + 1 >= length) {
        throw error;
      }
    }
  }
  return DotenvModule.parse(decrypted);
}
function _warn(message) {
  console.log(`[dotenv@${version}][WARN] ${message}`);
}
function _debug(message) {
  console.log(`[dotenv@${version}][DEBUG] ${message}`);
}
function _dotenvKey(options) {
  if (options && options.DOTENV_KEY && options.DOTENV_KEY.length > 0) {
    return options.DOTENV_KEY;
  }
  if (process.env.DOTENV_KEY && process.env.DOTENV_KEY.length > 0) {
    return process.env.DOTENV_KEY;
  }
  return "";
}
function _instructions(result, dotenvKey) {
  let uri;
  try {
    uri = new URL(dotenvKey);
  } catch (error) {
    if (error.code === "ERR_INVALID_URL") {
      const err = new Error("INVALID_DOTENV_KEY: Wrong format. Must be in valid uri format like dotenv://:key_1234@dotenvx.com/vault/.env.vault?environment=development");
      err.code = "INVALID_DOTENV_KEY";
      throw err;
    }
    throw error;
  }
  const key = uri.password;
  if (!key) {
    const err = new Error("INVALID_DOTENV_KEY: Missing key part");
    err.code = "INVALID_DOTENV_KEY";
    throw err;
  }
  const environment = uri.searchParams.get("environment");
  if (!environment) {
    const err = new Error("INVALID_DOTENV_KEY: Missing environment part");
    err.code = "INVALID_DOTENV_KEY";
    throw err;
  }
  const environmentKey = `DOTENV_VAULT_${environment.toUpperCase()}`;
  const ciphertext = result.parsed[environmentKey];
  if (!ciphertext) {
    const err = new Error(`NOT_FOUND_DOTENV_ENVIRONMENT: Cannot locate environment ${environmentKey} in your .env.vault file.`);
    err.code = "NOT_FOUND_DOTENV_ENVIRONMENT";
    throw err;
  }
  return { ciphertext, key };
}
function _vaultPath(options) {
  let possibleVaultPath = null;
  if (options && options.path && options.path.length > 0) {
    if (Array.isArray(options.path)) {
      for (const filepath of options.path) {
        if (fs.existsSync(filepath)) {
          possibleVaultPath = filepath.endsWith(".vault") ? filepath : `${filepath}.vault`;
        }
      }
    } else {
      possibleVaultPath = options.path.endsWith(".vault") ? options.path : `${options.path}.vault`;
    }
  } else {
    possibleVaultPath = path.resolve(process.cwd(), ".env.vault");
  }
  if (fs.existsSync(possibleVaultPath)) {
    return possibleVaultPath;
  }
  return null;
}
function _resolveHome(envPath) {
  return envPath[0] === "~" ? path.join(os.homedir(), envPath.slice(1)) : envPath;
}
function _configVault(options) {
  const debug = Boolean(options && options.debug);
  if (debug) {
    _debug("Loading env from encrypted .env.vault");
  }
  const parsed = DotenvModule._parseVault(options);
  let processEnv = process.env;
  if (options && options.processEnv != null) {
    processEnv = options.processEnv;
  }
  DotenvModule.populate(processEnv, parsed, options);
  return { parsed };
}
function configDotenv(options) {
  const dotenvPath = path.resolve(process.cwd(), ".env");
  let encoding = "utf8";
  const debug = Boolean(options && options.debug);
  if (options && options.encoding) {
    encoding = options.encoding;
  } else {
    if (debug) {
      _debug("No encoding is specified. UTF-8 is used by default");
    }
  }
  let optionPaths = [dotenvPath];
  if (options && options.path) {
    if (!Array.isArray(options.path)) {
      optionPaths = [_resolveHome(options.path)];
    } else {
      optionPaths = [];
      for (const filepath of options.path) {
        optionPaths.push(_resolveHome(filepath));
      }
    }
  }
  let lastError;
  const parsedAll = {};
  for (const path2 of optionPaths) {
    try {
      const parsed = DotenvModule.parse(fs.readFileSync(path2, { encoding }));
      DotenvModule.populate(parsedAll, parsed, options);
    } catch (e) {
      if (debug) {
        _debug(`Failed to load ${path2} ${e.message}`);
      }
      lastError = e;
    }
  }
  let processEnv = process.env;
  if (options && options.processEnv != null) {
    processEnv = options.processEnv;
  }
  DotenvModule.populate(processEnv, parsedAll, options);
  if (lastError) {
    return { parsed: parsedAll, error: lastError };
  } else {
    return { parsed: parsedAll };
  }
}
function config(options) {
  if (_dotenvKey(options).length === 0) {
    return DotenvModule.configDotenv(options);
  }
  const vaultPath = _vaultPath(options);
  if (!vaultPath) {
    _warn(`You set DOTENV_KEY but you are missing a .env.vault file at ${vaultPath}. Did you forget to build it?`);
    return DotenvModule.configDotenv(options);
  }
  return DotenvModule._configVault(options);
}
function decrypt(encrypted, keyStr) {
  const key = Buffer.from(keyStr.slice(-64), "hex");
  let ciphertext = Buffer.from(encrypted, "base64");
  const nonce = ciphertext.subarray(0, 12);
  const authTag = ciphertext.subarray(-16);
  ciphertext = ciphertext.subarray(12, -16);
  try {
    const aesgcm = crypto.createDecipheriv("aes-256-gcm", key, nonce);
    aesgcm.setAuthTag(authTag);
    return `${aesgcm.update(ciphertext)}${aesgcm.final()}`;
  } catch (error) {
    const isRange = error instanceof RangeError;
    const invalidKeyLength = error.message === "Invalid key length";
    const decryptionFailed = error.message === "Unsupported state or unable to authenticate data";
    if (isRange || invalidKeyLength) {
      const err = new Error("INVALID_DOTENV_KEY: It must be 64 characters long (or more)");
      err.code = "INVALID_DOTENV_KEY";
      throw err;
    } else if (decryptionFailed) {
      const err = new Error("DECRYPTION_FAILED: Please check your DOTENV_KEY");
      err.code = "DECRYPTION_FAILED";
      throw err;
    } else {
      throw error;
    }
  }
}
function populate(processEnv, parsed, options = {}) {
  const debug = Boolean(options && options.debug);
  const override = Boolean(options && options.override);
  if (typeof parsed !== "object") {
    const err = new Error("OBJECT_REQUIRED: Please check the processEnv argument being passed to populate");
    err.code = "OBJECT_REQUIRED";
    throw err;
  }
  for (const key of Object.keys(parsed)) {
    if (Object.prototype.hasOwnProperty.call(processEnv, key)) {
      if (override === true) {
        processEnv[key] = parsed[key];
      }
      if (debug) {
        if (override === true) {
          _debug(`"${key}" is already defined and WAS overwritten`);
        } else {
          _debug(`"${key}" is already defined and was NOT overwritten`);
        }
      }
    } else {
      processEnv[key] = parsed[key];
    }
  }
}
const DotenvModule = {
  configDotenv,
  _configVault,
  _parseVault,
  config,
  decrypt,
  parse,
  populate
};
main.exports.configDotenv = DotenvModule.configDotenv;
main.exports._configVault = DotenvModule._configVault;
main.exports._parseVault = DotenvModule._parseVault;
var config_1 = main.exports.config = DotenvModule.config;
main.exports.decrypt = DotenvModule.decrypt;
main.exports.parse = DotenvModule.parse;
main.exports.populate = DotenvModule.populate;
main.exports = DotenvModule;
const APP_ROOT = path__namespace.join(__dirname, "..");
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const RENDERER_DIST = path__namespace.join(APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path__namespace.join(APP_ROOT, "public") : RENDERER_DIST;
let win = null;
let backendProcess = null;
const backendPort = 5e3;
let tray = null;
let isHidden = false;
electron.app.isQuitting = false;
function loadEnvConfig() {
  const projectRootDev = path__namespace.join(APP_ROOT, "..");
  const envPath = electron.app.isPackaged ? path__namespace.join(electron.app.getAppPath(), "packaged-resources", ".env") : path__namespace.join(projectRootDev, ".env");
  console.log(`[Main Process] Intentando cargar .env desde: ${envPath}`);
  if (!fs__namespace.existsSync(envPath)) {
    console.warn(`[Main Process] Advertencia: Archivo .env no encontrado en ${envPath}`);
  }
  const result = config_1({ path: envPath });
  if (result.error) {
    console.error("[Main Process] Error cargando el archivo .env:", result.error);
    electron.dialog.showErrorBox("Error de Configuración", `No se pudo cargar el archivo .env desde ${envPath}. La aplicación podría no funcionar correctamente.`);
  } else {
    if (Object.keys(result.parsed || {}).length > 0) {
      console.log("[Main Process] .env cargado exitosamente.");
    } else if (!fs__namespace.existsSync(envPath)) ;
    else {
      console.warn("[Main Process] .env encontrado pero vacío o con error de parseo no capturado.");
    }
  }
  return result.parsed || {};
}
function startBackend() {
  return new Promise((resolve, reject) => {
    const loadedEnv = loadEnvConfig();
    const projectRootDev = path__namespace.join(APP_ROOT, "..");
    const backendExecutableName = "SondaClickBackend.exe";
    const backendExecutablePath = electron.app.isPackaged ? path__namespace.join(electron.app.getAppPath(), "packaged-backend", backendExecutableName) : path__namespace.join(projectRootDev, "backend", "dist", backendExecutableName);
    console.log(`[Main Process] Intentando iniciar backend desde: ${backendExecutablePath}`);
    if (!fs__namespace.existsSync(backendExecutablePath)) {
      const errorMsg = `[Main Process] Error: El ejecutable del backend no se encontró en ${backendExecutablePath}`;
      console.error(errorMsg);
      reject(new Error(errorMsg));
      return;
    }
    const backendEnv = {
      ...process.env,
      ...loadedEnv
    };
    const cwdPath = path__namespace.dirname(backendExecutablePath);
    backendProcess = child_process.spawn(backendExecutablePath, [], {
      shell: false,
      cwd: cwdPath,
      env: backendEnv,
      stdio: "inherit"
      // Cambiar a ['ignore', out, err] si quieres redirigir a archivos de log
    });
    backendProcess.on("error", (err) => {
      console.error("[Main Process] Fallo al iniciar el proceso del backend:", err);
      backendProcess = null;
      reject(err);
    });
    backendProcess.on("exit", (code, signal) => {
      console.log(`[Main Process] Proceso del backend terminó con código ${code} y señal ${signal}`);
      backendProcess = null;
    });
    let retries = 0;
    const maxRetries = 20;
    const checkInterval = 1500;
    const initialDelay = 3e3;
    const checkIfBackendReady = () => {
      fetch(`http://localhost:${backendPort}/api/check-domain`).then((res) => {
        if (res.ok) {
          console.log("[Main Process] ¡Backend listo!");
          resolve();
        } else {
          throw new Error(`[Main Process] Backend respondió con ${res.status}`);
        }
      }).catch((err) => {
        retries++;
        if (retries < maxRetries) {
          console.log(`[Main Process] Backend no listo, reintentando (${retries}/${maxRetries}). Error: ${err.message}`);
          setTimeout(checkIfBackendReady, checkInterval);
        } else {
          const errorMsg = "[Main Process] Backend falló al iniciar después de múltiples reintentos.";
          console.error(errorMsg);
          reject(new Error("Timeout del backend: No se pudo conectar después de varios intentos."));
        }
      });
    };
    setTimeout(checkIfBackendReady, initialDelay);
  });
}
function showMainProcessNotification(title, body) {
  if (electron.Notification.isSupported()) {
    console.log("[Main Process] showMainProcessNotification: Mostrando notificación - Título:", title);
    const iconName = "icon.ico";
    const iconPath = process.env.VITE_PUBLIC ? path__namespace.join(process.env.VITE_PUBLIC, iconName) : path__namespace.join(RENDERER_DIST, iconName);
    if (!fs__namespace.existsSync(iconPath)) {
      console.warn(`[Main Process] Icono de notificación no encontrado en ${iconPath}`);
    }
    const notification = new electron.Notification({
      title,
      body,
      icon: fs__namespace.existsSync(iconPath) ? iconPath : void 0
      // Solo pasar el ícono si existe
    });
    notification.show();
    notification.on("click", () => {
      console.log("[Main Process] Notificación del proceso principal clickeada:", title);
      win == null ? void 0 : win.show();
      win == null ? void 0 : win.focus();
    });
    notification.on("close", () => console.log("[Main Process] Notificación del proceso principal cerrada:", title));
  } else {
    console.log("[Main Process] Las notificaciones no son compatibles en este sistema.");
  }
}
function updateTrayMenu() {
  if (!tray) return;
  const toggleItem = menuTemplate.find((item) => item.id === "toggleWindow");
  if (toggleItem) {
    toggleItem.label = isHidden ? "Mostrar SondaClick" : "Ocultar SondaClick";
  }
  const newMenu = electron.Menu.buildFromTemplate(menuTemplate);
  tray.setContextMenu(newMenu);
}
const menuTemplate = [
  {
    id: "toggleWindow",
    label: "Ocultar SondaClick",
    // Etiqueta inicial
    click: () => {
      if (win) {
        if (isHidden) {
          win.show();
          if (process.platform === "darwin") {
            electron.app.focus({ steal: true });
          } else {
            win.focus();
          }
        } else {
          win.hide();
        }
        isHidden = !isHidden;
        updateTrayMenu();
      }
    }
  },
  { type: "separator" },
  {
    id: "quit",
    label: "Salir de SondaClick",
    click: () => {
      electron.app.isQuitting = true;
      electron.app.quit();
    }
  }
];
function createWindow() {
  const iconName = "icon.ico";
  const iconPath = process.env.VITE_PUBLIC ? path__namespace.join(process.env.VITE_PUBLIC, iconName) : path__namespace.join(RENDERER_DIST, iconName);
  win = new electron.BrowserWindow({
    width: 1200,
    // Ancho original
    height: 800,
    // Alto original
    icon: fs__namespace.existsSync(iconPath) ? iconPath : void 0,
    webPreferences: {
      preload: path__namespace.join(__dirname, "preload.js"),
      // Tu preload existente
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    const indexPath = path__namespace.join(RENDERER_DIST, "index.html");
    if (!fs__namespace.existsSync(indexPath)) {
      console.error(`[Main Process] Error: index.html no encontrado en ${indexPath}`);
      electron.dialog.showErrorBox("Error Crítico", `No se pudo cargar la interfaz de la aplicación. Archivo no encontrado: ${indexPath}`);
      electron.app.isQuitting = true;
      electron.app.quit();
      return;
    }
    win.loadFile(indexPath);
  }
  win.on("close", (event) => {
    if (!electron.app.isQuitting) {
      event.preventDefault();
      win == null ? void 0 : win.hide();
      isHidden = true;
      updateTrayMenu();
    }
  });
}
function createTray() {
  const iconName = "icon.ico";
  const iconPath = process.env.VITE_PUBLIC ? path__namespace.join(process.env.VITE_PUBLIC, iconName) : path__namespace.join(RENDERER_DIST, iconName);
  console.log(`[Main Process] Intentando cargar icono para Tray desde: ${iconPath}`);
  if (!fs__namespace.existsSync(iconPath)) {
    console.error(`[Main Process] Error: La imagen del icono para la bandeja no se encontró en ${iconPath}. No se creará la bandeja.`);
    return;
  }
  let image;
  try {
    image = electron.nativeImage.createFromPath(iconPath);
    if (image.isEmpty()) {
      console.error(`[Main Process] Error: La imagen del icono en ${iconPath} está vacía o no se pudo cargar.`);
      return;
    }
  } catch (error) {
    console.error(`[Main Process] Error al crear nativeImage desde ${iconPath}:`, error);
    return;
  }
  tray = new electron.Tray(image);
  tray.setToolTip("SondaClick Agente");
  updateTrayMenu();
  tray.on("click", () => {
    if (win) {
      if (isHidden) {
        win.show();
        if (process.platform === "darwin") electron.app.focus({ steal: true });
        else win.focus();
      } else {
        win.hide();
      }
      isHidden = !isHidden;
      updateTrayMenu();
    }
  });
}
const gotTheLock = electron.app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log("[Main Process] Otra instancia ya está en ejecución. Saliendo de esta instancia.");
  electron.app.quit();
} else {
  electron.app.on("second-instance", () => {
    console.log("[Main Process] Se intentó abrir una segunda instancia.");
    if (win) {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus();
      isHidden = false;
      updateTrayMenu();
    }
  });
  if (process.platform === "win32") {
    electron.app.setAppUserModelId("SondaClick.Mexico");
  }
  electron.app.whenReady().then(async () => {
    console.log("[Main Process] app.whenReady: Iniciando (instancia única)...");
    try {
      await startBackend();
      console.log("[Main Process] Backend iniciado. Creando ventana y Tray...");
      createWindow();
      createTray();
      setTimeout(() => {
        showMainProcessNotification("¡Bienvenido a SondaClick!", "La aplicación se ha iniciado correctamente.");
      }, 1e3);
    } catch (error) {
      console.error("[Main Process] Error crítico durante el inicio:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      electron.dialog.showErrorBox("Error Crítico de Inicio", `No se pudo iniciar la aplicación correctamente. La aplicación se cerrará.

Detalles: ${errorMessage}`);
      electron.app.isQuitting = true;
      electron.app.quit();
    }
  });
  electron.ipcMain.on("show-native-notification", (_event, { title, body }) => {
    console.log("[Main Process] Recibida solicitud IPC 'show-native-notification'");
    showMainProcessNotification(title, body);
  });
  electron.app.on("before-quit", (event) => {
    if (!electron.app.isQuitting && event) ;
    console.log("[Main Process] Evento before-quit (lógica de limpieza mejorada) recibido.");
    electron.app.isQuitting = true;
    if (tray) {
      console.log("[Main Process] Destruyendo icono de la bandeja del sistema desde before-quit.");
      try {
        tray.destroy();
      } catch (e) {
        console.error("[Main Process] Error destruyendo el tray:", e);
      }
      tray = null;
    }
    const backendExecutableName = "SondaClickBackend.exe";
    const performExit = () => {
      console.log("[Main Process] Limpieza finalizada o tiempo de espera agotado. Saliendo de la aplicación...");
      if (backendProcess) {
        backendProcess = null;
      }
      electron.app.exit(0);
    };
    const overallCleanupTimeoutDuration = 8e3;
    const overallCleanupTimer = setTimeout(() => {
      console.warn(`[Main Process] El tiempo de espera general de ${overallCleanupTimeoutDuration}ms para la limpieza ha expirado.`);
      performExit();
    }, overallCleanupTimeoutDuration);
    const executeTaskkill = () => {
      console.log("[Main Process] Procediendo con taskkill para el backend.");
      if (process.platform === "win32") {
        child_process.exec(`taskkill /IM "${backendExecutableName}" /F /T`, (error) => {
          clearTimeout(overallCleanupTimer);
          console.log(`[Main Process] Comando taskkill para ${backendExecutableName} ejecutado.`);
          performExit();
        });
      } else {
        clearTimeout(overallCleanupTimer);
        performExit();
      }
    };
    if (backendProcess) {
      console.log(`[Main Process] Intentando cierre ordenado del backend en http://localhost:${backendPort}/shutdown`);
      const controller = new AbortController();
      const gracefulSignal = controller.signal;
      const fetchSpecificTimeout = 2e3;
      const fetchTimer = setTimeout(() => controller.abort(), fetchSpecificTimeout);
      fetch(`http://localhost:${backendPort}/shutdown`, { method: "POST", signal: gracefulSignal }).then((response) => {
        clearTimeout(fetchTimer);
        console.log(`[Main Process] Solicitud de cierre ordenado enviada. Respuesta: ${response.status}`);
        setTimeout(executeTaskkill, 500);
      }).catch((err) => {
        clearTimeout(fetchTimer);
        if (err.name === "AbortError") ;
        executeTaskkill();
      });
    } else {
      console.log("[Main Process] No hay proceso backend registrado o ya se ha cerrado. Procediendo con la salida.");
      clearTimeout(overallCleanupTimer);
      performExit();
    }
  });
  electron.app.on("window-all-closed", () => {
    if (electron.app.isQuitting) {
      if (process.platform !== "darwin") ;
    } else {
      console.log("[Main Process] Todas las ventanas cerradas, pero la app sigue en la bandeja.");
    }
  });
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      if (!electron.app.isQuitting) {
        if (!backendProcess) {
          console.warn("[Main Process] activate event: Backend no está corriendo. Intentando reiniciar backend...");
          startBackend().then(() => {
            createWindow();
            if (!tray) createTray();
            else updateTrayMenu();
          }).catch((err) => {
            const errorMessage = err instanceof Error ? err.message : String(err);
            electron.dialog.showErrorBox("Error de Reactivación", `No se pudo reiniciar el backend al activar la aplicación. Error: ${errorMessage}`);
          });
        } else {
          createWindow();
          if (!tray) createTray();
          else updateTrayMenu();
        }
      }
    } else {
      win == null ? void 0 : win.show();
      win == null ? void 0 : win.focus();
      isHidden = false;
      updateTrayMenu();
    }
  });
}
