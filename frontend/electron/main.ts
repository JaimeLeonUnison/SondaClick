import { app, BrowserWindow, Notification, ipcMain, dialog, Tray, Menu, nativeImage } from 'electron'; // Añadido Tray, Menu, nativeImage
import * as path from 'path';
import { spawn, ChildProcess, exec } from 'child_process';
import * as dotenv from 'dotenv';

const APP_ROOT = path.join(__dirname, '..');
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const RENDERER_DIST = path.join(APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(APP_ROOT, 'public') : RENDERER_DIST;

let win: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
const backendPort = 5000;
let tray: Tray | null = null; // Variable para la instancia de Tray
// @ts-expect-error ignoring
app.isQuitting = false; // Para manejar el cierre vs. ocultar en la bandeja

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
      : path.join(projectRootDev, 'backend', 'dist', 'SondaClickBackend.exe');

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
    const iconPath = process.env.VITE_PUBLIC ? path.join(process.env.VITE_PUBLIC, 'icon.ico') : path.join(RENDERER_DIST, 'icon.ico');
    const notification = new Notification({
      title: title,
      body: body,
      icon: iconPath
    });
    notification.show();

    notification.on('click', () => {
      console.log('Notificación del proceso principal clickeada:', title);
      win?.show(); // Muestra la ventana al hacer clic en la notificación
      win?.focus();
    });

    notification.on('close', () => console.log('Notificación del proceso principal cerrada:', title));
  } else {
    console.log('Las notificaciones no son compatibles en este sistema (desde main).');
  }
}

function createWindow() {
  const iconPath = process.env.VITE_PUBLIC ? path.join(process.env.VITE_PUBLIC, 'icon.ico') : path.join(RENDERER_DIST, 'icon.ico');
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
  });

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date()).toLocaleString());
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

  win.on('close', (event) => {
    // @ts-expect-error ignoring
    if (!app.isQuitting) {
      event.preventDefault();
      win?.hide();
    } else {
      // Si estamos saliendo, permite que la ventana se cierre normalmente.
      // Esto es importante para que 'window-all-closed' se dispare correctamente si es la última ventana.
    }
  });

  win.on('closed', () => {
    // win = null; // No es necesario si se maneja el cierre de la app de otra forma
  });
}

function createTray() {
  const iconName = 'icon.ico';
  const iconPath = process.env.VITE_PUBLIC ? path.join(process.env.VITE_PUBLIC, iconName) : path.join(RENDERER_DIST, iconName);
  
  console.log(`[Main Process] Intentando cargar icono para Tray desde: ${iconPath}`);
  let image;
  try {
    image = nativeImage.createFromPath(iconPath);
    if (image.isEmpty()) {
      console.error(`[Main Process] Error: La imagen del icono en ${iconPath} está vacía o no se pudo cargar.`);
      return;
    }
  } catch (error) {
    console.error(`[Main Process] Error al crear nativeImage desde ${iconPath}:`, error);
    return;
  }

  tray = new Tray(image);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Abrir SondaClick',
      click: () => {
        win?.show();
        win?.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Salir de SondaClick',
      click: () => {
        // @ts-expect-error ignoring
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('SondaClick Agente');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (win) {
      win.isVisible() && !win.isMinimized() ? win.hide() : win.show();
    }
  });
}

app.on('before-quit', () => {
  console.log('[Main Process] Evento before-quit recibido.');
  // @ts-expect-error ignoring
  app.isQuitting = true;
});

app.on('window-all-closed', () => {
  // @ts-expect-error ignoring
  if (app.isQuitting) { // Si estamos saliendo intencionadamente, permite que la app se cierre.
    if (process.platform !== 'darwin') {
      app.quit();
    }
  } else {
    // Si no estamos saliendo (ej. solo se cerró la ventana), no hacer nada.
    // La aplicación seguirá en la bandeja del sistema.
    console.log('[Main Process] Todas las ventanas cerradas, pero la app sigue en la bandeja.');
  }
});

app.on('will-quit', () => {
  if (tray) {
    console.log('[Main Process] Destruyendo icono de la bandeja del sistema.');
    tray.destroy();
    tray = null;
  }

  const backendExecutableName = 'SondaClickBackend.exe';
  if (process.platform === 'win32') {
    console.log(`[Main Process] Intentando terminar todos los procesos ${backendExecutableName} usando taskkill /IM...`);
    exec(`taskkill /IM ${backendExecutableName} /F /T`, (error, stdout, stderr) => {
      if (error) {
        if (error.message.toLowerCase().includes('no running instances') || error.message.toLowerCase().includes('no se encontraron instancias')) {
          console.log(`[Main Process] No se encontraron instancias de ${backendExecutableName} en ejecución.`);
        } else {
          console.error(`[Main Process] Error al intentar terminar ${backendExecutableName} con taskkill /IM: ${error.message}`);
        }
      }
      if (stderr && !stderr.toLowerCase().includes('no se encontraron instancias')) {
          console.warn(`[Main Process] taskkill /IM stderr: ${stderr}`);
      }
      if (stdout) {
          console.log(`[Main Process] taskkill /IM stdout: ${stdout}`);
      }
      console.log(`[Main Process] Comando taskkill /IM ${backendExecutableName} ejecutado.`);
    });
  } else {
    if (backendProcess && backendProcess.pid) {
      console.log('[Main Process] Intentando terminar el proceso del backend (no Windows)...');
      const killed = backendProcess.kill();
      console.log(killed ? '[Main Process] Señal de terminación enviada (no Windows).' : '[Main Process] Fallo al enviar señal (no Windows).');
    }
  }
  if (backendProcess) {
    backendProcess = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    // @ts-expect-error ignoring
    if (!app.isQuitting) { // Solo recrear ventana si no estamos saliendo
        // Verificar si el backend está corriendo antes de crear la ventana
        // Esta es una verificación simple, podrías reusar checkIfBackendReady si es necesario
        if (backendProcess) {
            createWindow();
        } else {
            console.warn("[Main Process] activate event: Backend no está corriendo, no se creará ventana. Intentando reiniciar backend...");
            // Opcional: intentar reiniciar el backend y luego crear la ventana
            startBackend().then(() => {
                createWindow();
                if (tray) tray.destroy(); // Destruir el viejo tray si existe
                createTray(); // Recrear tray por si acaso
            }).catch(err => {
                const errorMessage = err instanceof Error ? err.message : String(err);
                dialog.showErrorBox("Error de Reactivación", `No se pudo reiniciar el backend al activar la aplicación. Error: ${errorMessage}`);
            });
        }
    }
  } else {
    win?.show(); // Si hay ventanas, pero la principal está oculta, muéstrala
    win?.focus();
  }
});

app.whenReady().then(async () => {
  console.log("[Main Process] app.whenReady: Iniciando...");
  try {
    await startBackend();
    console.log("[Main Process] Backend iniciado. Creando ventana y Tray...");
    createWindow();
    createTray(); // Crear el icono en la bandeja después de la ventana

    setTimeout(() => {
      showMainProcessNotification("¡Bienvenido a SondaClick!", "La aplicación se ha iniciado correctamente.");
    }, 1000);

  } catch (error) {
    console.error("[Main Process] Error crítico durante el inicio:", error);
    dialog.showErrorBox("Error Crítico de Inicio", "No se pudo iniciar el componente del backend. La aplicación se cerrará.\n\nDetalles: " + (error instanceof Error ? error.message : String(error)));
    // @ts-expect-error ignoring
    app.isQuitting = true; // Asegurar que la app se cierre
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