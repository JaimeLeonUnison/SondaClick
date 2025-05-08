import { app, BrowserWindow, Notification, ipcMain, dialog} from 'electron';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import * as dotenv from 'dotenv';

const APP_ROOT = path.join(__dirname, '..'); // frontend/
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const RENDERER_DIST = path.join(APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(APP_ROOT, 'public') : RENDERER_DIST;

let win: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
const backendPort = 5000;

if (process.platform === 'win32') {
  app.setAppUserModelId("SondaClick.Mexico");
}

// Función para cargar la configuración del .env principal
function loadEnvConfig() {
  // En desarrollo, __dirname es frontend/electron, APP_ROOT es frontend/
  // El .env está en la raíz del proyecto SondaClick/
  const projectRootDev = path.join(APP_ROOT, '..'); // SondaClick/
  
  // Ajuste para la ruta del .env en modo empaquetado
  const envPath = app.isPackaged
    ? path.join(app.getAppPath(), 'packaged-resources', '.env') // <--- AJUSTADO
    : path.join(projectRootDev, '.env');

  console.log(`[Main Process] Intentando cargar .env desde: ${envPath}`);
  const result = dotenv.config({ path: envPath });

  if (result.error) {
    console.error('[Main Process] Error cargando el archivo .env:', result.error);
    dialog.showErrorBox("Error de Configuración", `No se pudo cargar el archivo .env desde ${envPath}. La aplicación podría no funcionar correctamente.`);
  } else {
    console.log('[Main Process] .env cargado exitosamente.');
  }
  return result.parsed || {}; // Devuelve las variables parseadas o un objeto vacío
}


function startBackend(): Promise<void> {
  return new Promise((resolve, reject) => {
    const loadedEnv = loadEnvConfig();
    const projectRootDev = path.join(APP_ROOT, '..'); // SondaClick/

    // Ajuste para la ruta del backend ejecutable en modo empaquetado
    const backendExecutablePath = app.isPackaged
      ? path.join(app.getAppPath(), 'packaged-backend', 'SondaClickBackend.exe') // <--- AJUSTADO
      : path.join(projectRootDev, 'backend', 'dist', 'SondaClickBackend', 'SondaClickBackend.exe');

    console.log(`[Main Process] Intentando iniciar backend desde: ${backendExecutablePath}`);

    const backendEnv = {
      ...process.env, // Hereda el entorno actual de Electron
      ...loadedEnv,   // Sobrescribe/añade con las variables del .env
    };
    // console.log("[Main Process] Variables de entorno para el backend:", JSON.stringify(loadedEnv, null, 2)); // Descomenta para depurar

    const cwdPath = path.dirname(backendExecutablePath); // El directorio de trabajo es donde está el ejecutable

    backendProcess = spawn(backendExecutablePath, [], {
      shell: false,
      cwd: cwdPath,
      env: backendEnv,
      stdio: 'inherit', // Muestra la salida del backend en la consola de Electron para depuración
    });

    backendProcess.on('error', (err) => {
      console.error('[Main Process] Fallo al iniciar el proceso del backend:', err);
      reject(err);
    });

    backendProcess.on('exit', (code, signal) => {
      console.log(`[Main Process] Proceso del backend terminó con código ${code} y señal ${signal}`);
      backendProcess = null;
    });

    // Verificación de que el backend esté listo (ping a un endpoint)
    let retries = 0;
    const maxRetries = 20; // Intentos para conectar
    const checkInterval = 1500; // ms entre intentos

    const checkIfBackendReady = () => {
      // Usa fetch global si está disponible (Electron 28+) o importa 'node-fetch'
      fetch(`http://localhost:${backendPort}/api/check-domain`) // Un endpoint ligero de tu backend
        .then(res => {
          if (res.ok) {
            console.log('[Main Process] ¡Backend listo!');
            resolve();
          } else {
            throw new Error(`[Main Process] Backend respondió con ${res.status}`);
          }
        })
        .catch(err => {
          retries++;
          if (retries < maxRetries) {
            console.log(`[Main Process] Backend no listo, reintentando (${retries}/${maxRetries}). Error: ${err.message}`);
            setTimeout(checkIfBackendReady, checkInterval);
          } else {
            console.error('[Main Process] Backend falló al iniciar después de múltiples reintentos.');
            reject(new Error('Timeout del backend'));
          }
        });
    };
    // Dar un tiempo para que el ejecutable de PyInstaller (y Flask) inicie
    setTimeout(checkIfBackendReady, 3000);
  });
}


function showMainProcessNotification(title: string, body: string) {
  // ... (tu función showMainProcessNotification existente, sin cambios)
  if (Notification.isSupported()) {
    console.log("showMainProcessNotification: Mostrando notificación - Título:", title);
    const notification = new Notification({
      title: title,
      body: body,
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

  } else {
    console.log('Las notificaciones no son compatibles en este sistema (desde main).');
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(APP_ROOT, 'public', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
  });

  win.webContents.on('did-finish-load', () => {
    if (win) {
      win.webContents.send('main-process-message', (new Date()).toLocaleString());
    }
  });
  
  // La URL que carga tu frontend.
  // Si tu frontend es una SPA (React, Vue, Angular) que se sirve por Vite/Webpack dev server:
  // y se conecta a la API de Flask en localhost:5000
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL); // Para desarrollo con Vite HMR
    // win.webContents.openDevTools();
  } else {
    // Para producción, carga el index.html compilado.
    // El frontend (React) se encargará de hacer las llamadas fetch al backend en localhost:5000
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit(); // Esto disparará 'will-quit'
    // win = null; // No es necesario aquí si app.quit() se llama
  }
});

// Manejador para cerrar el backend cuando la app se cierra
app.on('will-quit', () => {
  if (backendProcess) {
    console.log('[Main Process] Intentando terminar el proceso del backend...');
    const killed = backendProcess.kill(); // Intenta terminar el proceso
    if (killed) {
      console.log('[Main Process] Señal de terminación enviada al proceso del backend.');
    } else {
      console.log('[Main Process] Fallo al enviar señal de terminación. Puede que ya haya terminado.');
    }
    backendProcess = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    // No iniciar backend aquí de nuevo, solo crear ventana si es necesario
    // y si el backend ya está (o debería estar) corriendo.
    if (win === null && backendProcess) { // Solo crea ventana si el backend se inició bien
        createWindow();
    } else if (win === null && !backendProcess) {
        console.warn("[Main Process] activate event: Backend no está corriendo, no se creará ventana. Revisar inicio.");
    }
  }
});

app.whenReady().then(async () => {
  console.log("[Main Process] app.whenReady: Iniciando backend...");
  try {
    await startBackend(); // Espera a que el backend se inicie y esté listo
    console.log("[Main Process] Backend iniciado. Creando ventana...");
    createWindow();

    // Mueve tu notificación de bienvenida aquí, después de que todo esté listo
    setTimeout(() => {
      showMainProcessNotification("¡Bienvenido a SondaClick!", "La aplicación se ha iniciado correctamente.");
    }, 1000); // Un pequeño retraso después de crear la ventana

  } catch (error) {
    console.error("[Main Process] Error crítico durante el inicio:", error);
    // Aquí podrías mostrar un diálogo de error al usuario antes de salir.
    // Por ejemplo, usando dialog.showErrorBox
    dialog.showErrorBox("Error Crítico de Inicio", "No se pudo iniciar el componente del backend. La aplicación se cerrará.\n\nDetalles: " + (error instanceof Error ? error.message : String(error)));
    app.quit();
  }

  ipcMain.on('show-native-notification', (_event, { title, body }) => {
    console.log("[Main Process] Recibida solicitud IPC 'show-native-notification'");
    showMainProcessNotification(title, body);
  });
});

// Elimina el module.exports si no es necesario para tu proceso de build.
// Si tu tsconfig.json tiene "module": "commonjs", module.exports es válido.
// Si es "esnext" o similar, usarías 'export { ... }'.
// Por ahora, lo comentaré ya que estas constantes no parecen usarse externamente
// de una manera que requiera exportación desde el main process empaquetado.
/*
module.exports = {
  MAIN_DIST, // MAIN_DIST no se usa en este archivo después de su definición
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
*/