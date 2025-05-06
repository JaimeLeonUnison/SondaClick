import { app, BrowserWindow, Notification, ipcMain } from 'electron';
import * as path from 'path'; // Usar 'import * as path' o 'import path' es común

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.js

// __dirname en el contexto de un archivo .ts en la carpeta electron/
// se referirá a frontend/electron/ en desarrollo.
// APP_ROOT será frontend/
const APP_ROOT = path.join(__dirname, '..');
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const MAIN_DIST = path.join(APP_ROOT, 'dist-electron'); // Salida para el main process
const RENDERER_DIST = path.join(APP_ROOT, 'dist'); // Salida para el renderer process

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(APP_ROOT, 'public') : RENDERER_DIST;

let win: BrowserWindow | null = null;

if (process.platform === 'win32') {
  app.setAppUserModelId("SondaClick.Mexico"); // Correcto, usa tu ID único
}

function showMainProcessNotification(title: string, body: string) {
  if (Notification.isSupported()) {
    console.log("showMainProcessNotification: Mostrando notificación - Título:", title);
    const notification = new Notification({
      title: title,
      body: body,
      // Icono opcional: Usa APP_ROOT para una ruta más consistente
      // Asegúrate que 'icon.png' o 'icon.ico' exista en 'frontend/public/'
      icon: path.join(APP_ROOT, 'public', 'icon.ico')
    });
    notification.show();

    notification.on('click', () => {
      console.log('Notificación del proceso principal clickeada:', title);
      if (win) {
        win.focus();
      }
    });

    notification.on('close', () => {
      console.log('Notificación del proceso principal cerrada:', title);
    });

    // Error event not supported by Electron's Notification API
    // Handle any errors with a try-catch instead if needed

  } else {
    console.log('Las notificaciones no son compatibles en este sistema (desde main).');
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(APP_ROOT, 'public', 'icon.ico'), // Icono de la ventana
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // Vite compilará preload.ts a preload.js en dist-electron
      nodeIntegration: false,
      contextIsolation: true
    },
  });

  win.webContents.on('did-finish-load', () => {
    if (win) {
      win.webContents.send('main-process-message', (new Date()).toLocaleString());
    }
  });
  
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    //win.webContents.openDevTools(); // DevTools en desarrollo
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

app.whenReady().then(() => {
  console.log("app.whenReady: Creando ventana...");
  createWindow();

  // Ejemplo: Mostrar una notificación 3 segundos después de que la app esté lista
  console.log("app.whenReady: Programando notificación de bienvenida en 3 segundos...");
  setTimeout(() => {
    showMainProcessNotification("¡Bienvenido a SondaClick!", "La aplicación se ha iniciado correctamente.");
  }, 3000);

  // Listener IPC para notificaciones solicitadas por el renderer (ya lo tenías, ¡está bien!)
  ipcMain.on('show-native-notification', (event, { title, body }) => {
    console.log("app.whenReady: Recibida solicitud IPC 'show-native-notification'");
    showMainProcessNotification(title, body);
  });
});

// Exportar usando module.exports (si tu configuración de tsconfig/vite lo maneja así para el main process)
// Si tu main process se compila como un ES Module puro, usarías 'export { ... }'
module.exports = {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
