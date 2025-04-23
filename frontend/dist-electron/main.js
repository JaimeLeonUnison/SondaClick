"use strict";
const electron = require("electron");
const path = require("path");
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
const path__namespace = /* @__PURE__ */ _interopNamespaceDefault(path);
const APP_ROOT = path__namespace.join(__dirname, "..");
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const MAIN_DIST = path__namespace.join(APP_ROOT, "dist-electron");
const RENDERER_DIST = path__namespace.join(APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path__namespace.join(APP_ROOT, "public") : RENDERER_DIST;
let win = null;
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
    win.webContents.openDevTools();
  } else {
    win.loadFile(path__namespace.join(RENDERER_DIST, "index.html"));
  }
}
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
    win = null;
  }
});
electron.app.on("activate", () => {
  if (electron.BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
electron.app.whenReady().then(createWindow);
module.exports = {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
