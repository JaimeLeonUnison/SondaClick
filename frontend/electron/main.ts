import { app, BrowserWindow, Notification, ipcMain, dialog, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import { spawn, ChildProcess, exec } from 'child_process';
import * as dotenv from 'dotenv';

// --- Constantes y Variables Globales ---
const APP_ROOT = path.join(__dirname, '..');
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const RENDERER_DIST = path.join(APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(APP_ROOT, 'public') : RENDERER_DIST;

let win: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
const backendPort = 5000;
let tray: Tray | null = null;
// @ts-expect-error ignoring
app.isQuitting = false; // Para manejar el cierre vs. ocultar en la bandeja

// --- Definiciones de Funciones Auxiliares ---
function loadEnvConfig() {
  const projectRootDev = path.join(APP_ROOT, '..');
  const envPath = app.isPackaged
    ? path.join(app.getAppPath(), 'packaged-resources', '.env')
    : path.join(projectRootDev, '.env');

  console.log(`[Main Process] Intentando cargar .env desde: ${envPath}`);
  const result = dotenv.config({ path: envPath });

  if (result.error) {
    console.error('[Main Process] Error cargando el archivo .env:', result.error);
    dialog.showErrorBox("Error de Configuración", `No se pudo cargar el archivo .env desde ${envPath}. La aplicación podría no funcionar correctamente.`);
  } else {
    console.log('[Main Process] .env cargado exitosamente.');
  }
  return result.parsed || {};
}

function startBackend(): Promise<void> {
  return new Promise((resolve, reject) => {
    const loadedEnv = loadEnvConfig();
    const projectRootDev = path.join(APP_ROOT, '..');
    const backendExecutablePath = app.isPackaged
      ? path.join(app.getAppPath(), 'packaged-backend', 'SondaClickBackend.exe')
      : path.join(projectRootDev, 'backend', 'dist', 'SondaClickBackend.exe');

    console.log(`[Main Process] Intentando iniciar backend desde: ${backendExecutablePath}`);

    const backendEnv = {
      ...process.env,
      ...loadedEnv,
    };
    
    const cwdPath = path.dirname(backendExecutablePath);

    backendProcess = spawn(backendExecutablePath, [], {
      shell: false,
      cwd: cwdPath,
      env: backendEnv,
      stdio: 'inherit',
    });

    backendProcess.on('error', (err) => {
      console.error('[Main Process] Fallo al iniciar el proceso del backend:', err);
      backendProcess = null; 
      reject(err);
    });

    backendProcess.on('exit', (code, signal) => {
      console.log(`[Main Process] Proceso del backend terminó con código ${code} y señal ${signal}`);
      backendProcess = null;
    });

    let retries = 0;
    const maxRetries = 20;
    const checkInterval = 1500;

    const checkIfBackendReady = () => {
      fetch(`http://localhost:${backendPort}/api/check-domain`)
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
    setTimeout(checkIfBackendReady, 3000);
  });
}

function showMainProcessNotification(title: string, body: string) {
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
      win?.show();
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
  
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }

  win.on('close', (event) => {
    // @ts-expect-error ignoring
    if (!app.isQuitting) {
      event.preventDefault();
      win?.hide();
    }
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

// --- Lógica para Instancia Única ---
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('[Main Process] Otra instancia ya está en ejecución. Saliendo de esta instancia.');
  app.quit();
} else {
  // --- INICIO: Lógica de la aplicación principal (solo si tenemos el bloqueo) ---

  app.on('second-instance', () => {
    // Alguien intentó ejecutar una segunda instancia, debemos enfocar nuestra ventana.
    console.log('[Main Process] Se intentó abrir una segunda instancia.');
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  // Mover app.setAppUserModelId aquí también
  if (process.platform === 'win32') {
    app.setAppUserModelId("SondaClick.Mexico");
  }

  // --- Manejadores de Eventos de la Aplicación (DENTRO DEL BLOQUE 'else') ---

  app.whenReady().then(async () => {
    console.log("[Main Process] app.whenReady: Iniciando (instancia única)...");
    try {
      await startBackend(); // Esta llamada ahora solo ocurre si es la instancia única
      console.log("[Main Process] Backend iniciado. Creando ventana y Tray...");
      createWindow();
      createTray();
      setTimeout(() => {
        showMainProcessNotification("¡Bienvenido a SondaClick!", "La aplicación se ha iniciado correctamente.");
      }, 1000);
    } catch (error) {
      console.error("[Main Process] Error crítico durante el inicio:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      dialog.showErrorBox("Error Crítico de Inicio", "No se pudo iniciar el componente del backend. La aplicación se cerrará.\n\nDetalles: " + errorMessage);
      // @ts-expect-error ignoring
      app.isQuitting = true;
      app.quit();
    }
});

  // Corregir la posición del manejador de IPC
  ipcMain.on('show-native-notification', (_event, { title, body }) => {
    console.log("[Main Process] Recibida solicitud IPC 'show-native-notification'");
    showMainProcessNotification(title, body);
  });

  app.on('before-quit', (event) => {
    // Si ya estamos en proceso de salir, no prevenir el evento quit
    // @ts-expect-error ignoring
    if (app.isQuitting) return;
    
    console.log('[Main Process] Evento before-quit recibido. Iniciando secuencia de cierre ordenado...');
    // @ts-expect-error ignoring
    app.isQuitting = true;
    event.preventDefault(); // Prevenir el cierre inmediato
    
    // El resto de tu código de cierre...
  });

  app.on('before-quit', (event) => {
    console.log('[Main Process] Evento before-quit (lógica de limpieza mejorada) recibido.');
    // @ts-expect-error ignoring
    app.isQuitting = true;
    event.preventDefault();
    console.log('[Main Process] before-quit: Iniciando limpieza...');
    if (tray) {
      console.log('[Main Process] Destruyendo icono de la bandeja del sistema desde before-quit.');
      try { tray.destroy(); } catch (e) { console.error('[Main Process] Error destruyendo el tray:', e); }
      tray = null;
    }
    const backendExecutableName = 'SondaClickBackend.exe';
    const performExit = () => {
      console.log('[Main Process] Limpieza finalizada o tiempo de espera agotado. Saliendo de la aplicación...');
      if (backendProcess) { backendProcess = null; }
      app.exit(0);
    };
    const overallCleanupTimeoutDuration = 10000;
    const overallCleanupTimer = setTimeout(() => {
      console.warn(`[Main Process] El tiempo de espera general de ${overallCleanupTimeoutDuration}ms para la limpieza ha expirado.`);
      console.log('[Main Process] Timeout general: Forzando salida directa.');
      performExit();
    }, overallCleanupTimeoutDuration);

    const executeTaskkill = () => {
      console.log('[Main Process] Procediendo con taskkill para el backend como fallback/verificación.');
      if (process.platform === 'win32') {
        console.log(`[Main Process] Intentando terminar todos los procesos ${backendExecutableName} usando taskkill...`);
        exec(`taskkill /IM "${backendExecutableName}" /F /T`, (error, stdout, stderr) => {
          clearTimeout(overallCleanupTimer);
          if (error) {
            const errorMessage = error.message.toLowerCase();
            if (errorMessage.includes('no running instances') || errorMessage.includes('no se encontraron instancias') || errorMessage.includes('could not find the process')) {
              console.log(`[Main Process] No se encontraron instancias de ${backendExecutableName} en ejecución (taskkill lo confirma o ya estaba cerrado).`);
            } else {
              console.error(`[Main Process] Error al intentar terminar ${backendExecutableName} con taskkill: ${error.message}`);
            }
          }
          const stderrLower = stderr ? stderr.toLowerCase() : "";
          if (stderr && !stderrLower.includes('no se encontraron instancias') && !stderrLower.includes('no running instances') && !stderrLower.includes('could not find the process')) {
            console.warn(`[Main Process] taskkill stderr: ${stderr}`);
          }
          if (stdout) {
            console.log(`[Main Process] taskkill stdout: ${stdout}`);
          }
          console.log(`[Main Process] Comando taskkill para ${backendExecutableName} ejecutado.`);
          performExit();
        });
      } else {
        if (backendProcess && backendProcess.pid && !backendProcess.killed) {
          console.log('[Main Process] Intentando terminar el proceso del backend (no Windows) con SIGKILL...');
          const killed = backendProcess.kill('SIGKILL');
          console.log(killed ? '[Main Process] Señal SIGKILL enviada al backend (no Windows).' : '[Main Process] Fallo al enviar señal SIGKILL (no Windows).');
        } else {
          console.log('[Main Process] Proceso backend (no Windows) no encontrado, ya terminado o sin PID.');
        }
        clearTimeout(overallCleanupTimer);
        performExit();
      }
    };

    const attemptGracefulShutdown = () => {
      console.log(`[Main Process] Intentando cierre ordenado del backend en http://localhost:${backendPort}/shutdown`);
      const controller = new AbortController();
      const gracefulSignal = controller.signal;
      const fetchSpecificTimeout = 2500;
      const fetchTimer = setTimeout(() => controller.abort(), fetchSpecificTimeout);
      fetch(`http://localhost:${backendPort}/shutdown`, { method: 'POST', signal: gracefulSignal })
        .then(response => {
          clearTimeout(fetchTimer);
          console.log(`[Main Process] Solicitud de cierre ordenado enviada. Respuesta del backend: ${response.status}`);
          setTimeout(() => {
            console.log('[Main Process] Pausa después de intento de cierre ordenado completada.');
            executeTaskkill();
          }, 1000);
        })
        .catch(err => {
          clearTimeout(fetchTimer);
          if (err.name === 'AbortError') {
            console.warn('[Main Process] Timeout durante el intento de cierre ordenado del backend (fetch abortado).');
          } else {
            console.warn('[Main Process] Error durante el intento de cierre ordenado del backend (puede ser normal):', err.message);
          }
          executeTaskkill();
        });
    };
    attemptGracefulShutdown();
  });

  app.on('window-all-closed', () => {
    // @ts-expect-error ignoring
    if (app.isQuitting) {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    } else {
      console.log('[Main Process] Todas las ventanas cerradas, pero la app sigue en la bandeja.');
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      // @ts-expect-error ignoring
      if (!app.isQuitting) {
        if (backendProcess) {
          createWindow();
        } else {
          console.warn("[Main Process] activate event: Backend no está corriendo. Intentando reiniciar backend...");
          startBackend().then(() => {
            createWindow();
            if (tray) {
                try { tray.destroy(); } catch(e) { console.error("Error destruyendo tray en activate:", e); }
            }
            createTray();
          }).catch(err => {
            const errorMessage = err instanceof Error ? err.message : String(err);
            dialog.showErrorBox("Error de Reactivación", `No se pudo reiniciar el backend al activar la aplicación. Error: ${errorMessage}`);
          });
        }
      }
    } else {
      win?.show();
      win?.focus();
    }
  });
}