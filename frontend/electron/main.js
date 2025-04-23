// Versión limpia sin problemas de módulos
import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import process from 'process';

// Configuración de directorios (usando __dirname que ya está disponible en CommonJS)
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const APP_ROOT = path.join(__dirname, '..');
const VITE_DEV_SERVER_URL = import.meta.env.VITE_DEV_SERVER_URL;
const MAIN_DIST = path.join(APP_ROOT, 'dist-electron');
const RENDERER_DIST = path.join(APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(APP_ROOT, 'public') : RENDERER_DIST;

// Variable global para la ventana
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    // Usar ruta absoluta para el ícono
    icon: path.join(APP_ROOT, 'public', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: true
    }
  });

  // Establecer el ícono explícitamente para Windows
  if (process.platform === 'win32') {
    try {
      const iconPath = path.join(APP_ROOT, 'public', 'icon.ico');
      console.log('Cargando ícono desde:', iconPath);
      console.log('El ícono existe:', fs.existsSync(iconPath));
      win.setIcon(iconPath);
    } catch (error) {
      console.error('Error al establecer el ícono:', error);
    }
  }

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    if (win) {
      win.webContents.send('main-process-message', (new Date()).toLocaleString());
    }
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(createWindow);

// Usar module.exports para CommonJS
export { MAIN_DIST, RENDERER_DIST };