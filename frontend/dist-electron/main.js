"use strict";
const electron = require("electron");
const path$1 = require("path");
const child_process = require("child_process");
const require$$0 = require("fs");
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
var main = { exports: {} };
const version$1 = "16.5.0";
const require$$4 = {
  version: version$1
};
const fs = require$$0;
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
if (process.platform === "win32") {
  electron.app.setAppUserModelId("SondaClick.Mexico");
}
function loadEnvConfig() {
  const projectRootDev = path__namespace.join(APP_ROOT, "..");
  const envPath = electron.app.isPackaged ? path__namespace.join(electron.app.getAppPath(), "packaged-resources", ".env") : path__namespace.join(projectRootDev, ".env");
  console.log(`[Main Process] Intentando cargar .env desde: ${envPath}`);
  const result = config_1({ path: envPath });
  if (result.error) {
    console.error("[Main Process] Error cargando el archivo .env:", result.error);
    electron.dialog.showErrorBox("Error de Configuración", `No se pudo cargar el archivo .env desde ${envPath}. La aplicación podría no funcionar correctamente.`);
  } else {
    console.log("[Main Process] .env cargado exitosamente.");
  }
  return result.parsed || {};
}
function startBackend() {
  return new Promise((resolve, reject) => {
    const loadedEnv = loadEnvConfig();
    const projectRootDev = path__namespace.join(APP_ROOT, "..");
    const backendExecutablePath = electron.app.isPackaged ? path__namespace.join(electron.app.getAppPath(), "packaged-backend", "SondaClickBackend.exe") : path__namespace.join(projectRootDev, "backend", "dist", "SondaClickBackend", "SondaClickBackend.exe");
    console.log(`[Main Process] Intentando iniciar backend desde: ${backendExecutablePath}`);
    const backendEnv = {
      ...process.env,
      // Hereda el entorno actual de Electron
      ...loadedEnv
      // Sobrescribe/añade con las variables del .env
    };
    const cwdPath = path__namespace.dirname(backendExecutablePath);
    backendProcess = child_process.spawn(backendExecutablePath, [], {
      shell: false,
      cwd: cwdPath,
      env: backendEnv,
      stdio: "inherit"
      // Muestra la salida del backend en la consola de Electron para depuración
    });
    backendProcess.on("error", (err) => {
      console.error("[Main Process] Fallo al iniciar el proceso del backend:", err);
      reject(err);
    });
    backendProcess.on("exit", (code, signal) => {
      console.log(`[Main Process] Proceso del backend terminó con código ${code} y señal ${signal}`);
      backendProcess = null;
    });
    let retries = 0;
    const maxRetries = 20;
    const checkInterval = 1500;
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
          console.error("[Main Process] Backend falló al iniciar después de múltiples reintentos.");
          reject(new Error("Timeout del backend"));
        }
      });
    };
    setTimeout(checkIfBackendReady, 3e3);
  });
}
function showMainProcessNotification(title, body) {
  if (electron.Notification.isSupported()) {
    console.log("showMainProcessNotification: Mostrando notificación - Título:", title);
    const notification = new electron.Notification({
      title,
      body,
      icon: path__namespace.join(APP_ROOT, "public", "icon.ico")
    });
    notification.show();
    notification.on("click", () => {
      console.log("Notificación del proceso principal clickeada:", title);
      if (win) {
        win.focus();
      }
    });
    notification.on("close", () => {
      console.log("Notificación del proceso principal cerrada:", title);
    });
  } else {
    console.log("Las notificaciones no son compatibles en este sistema (desde main).");
  }
}
function createWindow() {
  win = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    icon: path__namespace.join(APP_ROOT, "public", "icon.ico"),
    webPreferences: {
      preload: path__namespace.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  win.webContents.on("did-finish-load", () => {
    if (win) {
      win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
    }
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path__namespace.join(RENDERER_DIST, "index.html"));
  }
}
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("will-quit", () => {
  if (backendProcess) {
    console.log("[Main Process] Intentando terminar el proceso del backend...");
    const killed = backendProcess.kill();
    if (killed) {
      console.log("[Main Process] Señal de terminación enviada al proceso del backend.");
    } else {
      console.log("[Main Process] Fallo al enviar señal de terminación. Puede que ya haya terminado.");
    }
    backendProcess = null;
  }
});
electron.app.on("activate", () => {
  if (electron.BrowserWindow.getAllWindows().length === 0) {
    if (win === null && backendProcess) {
      createWindow();
    } else if (win === null && !backendProcess) {
      console.warn("[Main Process] activate event: Backend no está corriendo, no se creará ventana. Revisar inicio.");
    }
  }
});
electron.app.whenReady().then(async () => {
  console.log("[Main Process] app.whenReady: Iniciando backend...");
  try {
    await startBackend();
    console.log("[Main Process] Backend iniciado. Creando ventana...");
    createWindow();
    setTimeout(() => {
      showMainProcessNotification("¡Bienvenido a SondaClick!", "La aplicación se ha iniciado correctamente.");
    }, 1e3);
  } catch (error) {
    console.error("[Main Process] Error crítico durante el inicio:", error);
    electron.dialog.showErrorBox("Error Crítico de Inicio", "No se pudo iniciar el componente del backend. La aplicación se cerrará.\n\nDetalles: " + (error instanceof Error ? error.message : String(error)));
    electron.app.quit();
  }
  electron.ipcMain.on("show-native-notification", (_event, { title, body }) => {
    console.log("[Main Process] Recibida solicitud IPC 'show-native-notification'");
    showMainProcessNotification(title, body);
  });
});
