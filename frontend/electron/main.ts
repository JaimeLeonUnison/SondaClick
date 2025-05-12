import { app, BrowserWindow, Notification, ipcMain, dialog, Tray, Menu, nativeImage, MenuItemConstructorOptions } from 'electron';
import * as path from 'path';
import { spawn, ChildProcess, exec } from 'child_process';
import * as dotenv from 'dotenv';
import * as fs from 'fs'; // Necesario para verificar existencia de archivos

// --- Constantes y Variables Globales ---
const APP_ROOT = path.join(__dirname, '..');
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const RENDERER_DIST = path.join(APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(APP_ROOT, 'public') : RENDERER_DIST;

let win: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
const backendPort = 5000;
let tray: Tray | null = null;
let isHidden = false; // Para el estado de visibilidad de la ventana según el nuevo código
// @ts-expect-error app.isQuitting no es una propiedad estándar, la definimos nosotros
app.isQuitting = false; // Para manejar el cierre vs. ocultar en la bandeja

// --- Definiciones de Funciones Auxiliares ---
function loadEnvConfig() {
  const projectRootDev = path.join(APP_ROOT, '..');
  const envPath = app.isPackaged
    ? path.join(app.getAppPath(), 'packaged-resources', '.env')
    : path.join(projectRootDev, '.env');

  console.log(`[Main Process] Intentando cargar .env desde: ${envPath}`);
  if (!fs.existsSync(envPath)) {
    console.warn(`[Main Process] Advertencia: Archivo .env no encontrado en ${envPath}`);
  }
  const result = dotenv.config({ path: envPath });

  if (result.error) {
    console.error('[Main Process] Error cargando el archivo .env:', result.error);
    dialog.showErrorBox("Error de Configuración", `No se pudo cargar el archivo .env desde ${envPath}. La aplicación podría no funcionar correctamente.`);
  } else {
    if (Object.keys(result.parsed || {}).length > 0) {
      console.log('[Main Process] .env cargado exitosamente.');
    } else if (!fs.existsSync(envPath)) {
      // No mostrar error si el archivo no existe y no se esperaba que existiera (ej. producción sin .env)
    } else {
      console.warn('[Main Process] .env encontrado pero vacío o con error de parseo no capturado.');
    }
  }
  return result.parsed || {};
}

function startBackend(): Promise<void> {
  return new Promise((resolve, reject) => {
    const loadedEnv = loadEnvConfig();
    const projectRootDev = path.join(APP_ROOT, '..');
    const backendExecutableName = 'SondaClickBackend.exe';
    const backendExecutablePath = app.isPackaged
      ? path.join(app.getAppPath(), 'packaged-backend', backendExecutableName) // Usar una carpeta específica para el backend empaquetado
      : path.join(projectRootDev, 'backend', 'dist', backendExecutableName);

    console.log(`[Main Process] Intentando iniciar backend desde: ${backendExecutablePath}`);

    if (!fs.existsSync(backendExecutablePath)) {
      const errorMsg = `[Main Process] Error: El ejecutable del backend no se encontró en ${backendExecutablePath}`;
      console.error(errorMsg);
      reject(new Error(errorMsg));
      return;
    }

    const backendEnv = {
      ...process.env,
      ...loadedEnv,
    };
    
    const cwdPath = path.dirname(backendExecutablePath);

    backendProcess = spawn(backendExecutablePath, [], {
      shell: false,
      cwd: cwdPath,
      env: backendEnv,
      stdio: 'inherit', // Cambiar a ['ignore', out, err] si quieres redirigir a archivos de log
    });

    backendProcess.on('error', (err) => {
      console.error('[Main Process] Fallo al iniciar el proceso del backend:', err);
      backendProcess = null; 
      reject(err);
    });

    backendProcess.on('exit', (code, signal) => {
      console.log(`[Main Process] Proceso del backend terminó con código ${code} y señal ${signal}`);
      backendProcess = null;
      // Considerar si se debe intentar reiniciar o notificar al usuario si el backend termina inesperadamente
    });

    let retries = 0;
    const maxRetries = 20; // ~30 segundos
    const checkInterval = 1500;
    const initialDelay = 3000; // Espera inicial antes del primer chequeo

    const checkIfBackendReady = () => {
      fetch(`http://localhost:${backendPort}/api/check-domain`) // Asegúrate que este endpoint existe y es ligero
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
            const errorMsg = '[Main Process] Backend falló al iniciar después de múltiples reintentos.';
            console.error(errorMsg);
            reject(new Error('Timeout del backend: No se pudo conectar después de varios intentos.'));
          }
        });
    };
    // Iniciar el chequeo después de una breve espera para darle tiempo al backend a arrancar
    setTimeout(checkIfBackendReady, initialDelay);
  });
}

function showMainProcessNotification(title: string, body: string) {
  if (Notification.isSupported()) {
    console.log("[Main Process] showMainProcessNotification: Mostrando notificación - Título:", title);
    const iconName = 'icon.ico'; // o el nombre de tu ícono
    const iconPath = process.env.VITE_PUBLIC 
        ? path.join(process.env.VITE_PUBLIC, iconName) 
        : path.join(RENDERER_DIST, iconName);
    
    if (!fs.existsSync(iconPath)) {
        console.warn(`[Main Process] Icono de notificación no encontrado en ${iconPath}`);
    }

    const notification = new Notification({
      title: title,
      body: body,
      icon: fs.existsSync(iconPath) ? iconPath : undefined // Solo pasar el ícono si existe
    });
    notification.show();
    notification.on('click', () => {
      console.log('[Main Process] Notificación del proceso principal clickeada:', title);
      win?.show();
      win?.focus();
    });
    notification.on('close', () => console.log('[Main Process] Notificación del proceso principal cerrada:', title));
  } else {
    console.log('[Main Process] Las notificaciones no son compatibles en este sistema.');
  }
}

// --- Lógica de la Bandeja y Menú (adaptada del código proporcionado) ---

// Función auxiliar para actualizar la etiqueta del menú y el menú de la bandeja
function updateTrayMenu() {
  if (!tray) return;

  const toggleItem = menuTemplate.find(item => item.id === "toggleWindow");
  if (toggleItem) {
    toggleItem.label = isHidden ? "Mostrar SondaClick" : "Ocultar SondaClick";
  }

  const newMenu = Menu.buildFromTemplate(menuTemplate as MenuItemConstructorOptions[]);
  tray.setContextMenu(newMenu);
}

const menuTemplate: Array<MenuItemConstructorOptions & { id?: string }> = [
  {
    id: "toggleWindow",
    label: "Ocultar SondaClick", // Etiqueta inicial
    click: () => {
      if (win) {
        if (isHidden) {
          win.show();
          if (process.platform === 'darwin') {
            app.focus({ steal: true });
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
  { type: 'separator' },
  {
    id: "quit",
    label: "Salir de SondaClick",
    click: () => {
      // @ts-expect-error // isQuitting is a custom flag to manage app lifecycle
      app.isQuitting = true;
      app.quit();
    }
  }
];

function createWindow() {
  const iconName = 'icon.ico';
  const iconPath = process.env.VITE_PUBLIC 
    ? path.join(process.env.VITE_PUBLIC, iconName) 
    : path.join(RENDERER_DIST, iconName);

  win = new BrowserWindow({
    width: 1200, // Ancho original
    height: 800, // Alto original
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // Tu preload existente
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date()).toLocaleString());
  });
  
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    const indexPath = path.join(RENDERER_DIST, 'index.html');
    if (!fs.existsSync(indexPath)) {
        console.error(`[Main Process] Error: index.html no encontrado en ${indexPath}`);
        dialog.showErrorBox("Error Crítico", `No se pudo cargar la interfaz de la aplicación. Archivo no encontrado: ${indexPath}`);
        // @ts-expect-error // isQuitting is a custom flag to manage app lifecycle
        app.isQuitting = true;
        app.quit();
        return;
    }
    win.loadFile(indexPath);
  }

  win.on('close', (event) => {
    // @ts-expect-error // isQuitting is a custom flag to manage app lifecycle
    if (!app.isQuitting) {
      event.preventDefault();
      win?.hide();
      isHidden = true; // Actualizar estado
      updateTrayMenu(); // Actualizar menú de la bandeja
    }
    // Si app.isQuitting es true, la ventana se cerrará normalmente.
  });
}

function createTray() {
  const iconName = 'icon.ico';
  const iconPath = process.env.VITE_PUBLIC 
    ? path.join(process.env.VITE_PUBLIC, iconName) 
    : path.join(RENDERER_DIST, iconName);
  
  console.log(`[Main Process] Intentando cargar icono para Tray desde: ${iconPath}`);
  
  if (!fs.existsSync(iconPath)) {
    console.error(`[Main Process] Error: La imagen del icono para la bandeja no se encontró en ${iconPath}. No se creará la bandeja.`);
    return;
  }

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
  tray.setToolTip('SondaClick Agente'); // Tooltip original
  updateTrayMenu(); // Establecer el menú inicial

  // Comportamiento de clic izquierdo en la bandeja (opcional, pero común)
  tray.on('click', () => {
    if (win) {
      if (isHidden) { // Si está oculta, mostrarla
        win.show();
        if (process.platform === 'darwin') app.focus({ steal: true }); else win.focus();
      } else { // Si está visible, ocultarla
        win.hide();
      }
      isHidden = !isHidden;
      updateTrayMenu();
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
    console.log('[Main Process] Se intentó abrir una segunda instancia.');
    if (win) {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show(); // Asegurarse de que se muestre si estaba oculta
      win.focus();
      isHidden = false; // Actualizar estado
      updateTrayMenu(); // Actualizar menú
    }
  });

  if (process.platform === 'win32') {
    app.setAppUserModelId("SondaClick.Mexico");
  }

  app.whenReady().then(async () => {
    console.log("[Main Process] app.whenReady: Iniciando (instancia única)...");
    try {
      await startBackend();
      console.log("[Main Process] Backend iniciado. Creando ventana y Tray...");
      createWindow();
      createTray(); // Crear la bandeja aquí
      // La notificación de bienvenida se puede mover o mantener
      setTimeout(() => {
        showMainProcessNotification("¡Bienvenido a SondaClick!", "La aplicación se ha iniciado correctamente.");
      }, 1000);
    } catch (error) {
      console.error("[Main Process] Error crítico durante el inicio:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      dialog.showErrorBox("Error Crítico de Inicio", `No se pudo iniciar la aplicación correctamente. La aplicación se cerrará.\n\nDetalles: ${errorMessage}`);
      // @ts-expect-error // isQuitting is a custom flag to manage app lifecycle
      app.isQuitting = true;
      app.quit();
    }
  });

  ipcMain.on('show-native-notification', (_event, { title, body }) => {
    console.log("[Main Process] Recibida solicitud IPC 'show-native-notification'");
    showMainProcessNotification(title, body);
  });

  app.on('before-quit', (event) => {
    // @ts-expect-error // isQuitting is a custom flag to manage app lifecycle
    if (!app.isQuitting && event) { // Si event es undefined, no podemos prevenir
        // Esta lógica es para cuando el usuario intenta cerrar la app
        // pero no a través del botón "Salir" del menú de la bandeja.
        // Por ejemplo, Cmd+Q en macOS o Alt+F4 en Windows si no se maneja 'close' de la ventana.
        // Aquí podrías decidir si realmente quieres salir o solo ocultar.
        // La lógica actual con app.isQuitting ya maneja esto bien si el 'close' de la ventana
        // previene el default y oculta.
    }
    console.log('[Main Process] Evento before-quit (lógica de limpieza mejorada) recibido.');
    // @ts-expect-error // isQuitting is a custom flag to manage app lifecycle
    app.isQuitting = true; // Asegurar que está marcado como saliendo
    // event.preventDefault(); // No prevenir aquí si ya lo haces en el cierre de la ventana
                           // o si realmente quieres que la secuencia de quit continúe.
                           // La lógica de cierre del backend ya está aquí.

    if (tray) {
      console.log('[Main Process] Destruyendo icono de la bandeja del sistema desde before-quit.');
      try { tray.destroy(); } catch (e) { console.error('[Main Process] Error destruyendo el tray:', e); }
      tray = null;
    }
    
    // Lógica de cierre del backend (simplificada para claridad, tu lógica original es más robusta)
    const backendExecutableName = 'SondaClickBackend.exe';
    const performExit = () => {
      console.log('[Main Process] Limpieza finalizada o tiempo de espera agotado. Saliendo de la aplicación...');
      if (backendProcess) { backendProcess = null; } // Limpiar referencia
      app.exit(0); // Forzar salida si es necesario después de la limpieza
    };

    const overallCleanupTimeoutDuration = 8000; // Reducido un poco
    const overallCleanupTimer = setTimeout(() => {
      console.warn(`[Main Process] El tiempo de espera general de ${overallCleanupTimeoutDuration}ms para la limpieza ha expirado.`);
      performExit();
    }, overallCleanupTimeoutDuration);

    const executeTaskkill = () => {
      console.log('[Main Process] Procediendo con taskkill para el backend.');
      if (process.platform === 'win32') {
        exec(`taskkill /IM "${backendExecutableName}" /F /T`, (error) => {
          clearTimeout(overallCleanupTimer); // Detener el temporizador general
          if (error) { /* ... tu manejo de errores de taskkill ... */ }
          console.log(`[Main Process] Comando taskkill para ${backendExecutableName} ejecutado.`);
          performExit();
        });
      } else {
        // ... tu lógica para no-Windows ...
        clearTimeout(overallCleanupTimer);
        performExit();
      }
    };

    if (backendProcess) { // Solo intentar cierre ordenado si el backend está (o creemos que está) corriendo
        console.log(`[Main Process] Intentando cierre ordenado del backend en http://localhost:${backendPort}/shutdown`);
        const controller = new AbortController();
        const gracefulSignal = controller.signal;
        const fetchSpecificTimeout = 2000; // Reducido
        const fetchTimer = setTimeout(() => controller.abort(), fetchSpecificTimeout);

        fetch(`http://localhost:${backendPort}/shutdown`, { method: 'POST', signal: gracefulSignal })
          .then(response => {
            clearTimeout(fetchTimer);
            console.log(`[Main Process] Solicitud de cierre ordenado enviada. Respuesta: ${response.status}`);
            setTimeout(executeTaskkill, 500); // Dar un poco de tiempo y luego taskkill
          })
          .catch(err => {
            clearTimeout(fetchTimer);
            if (err.name === 'AbortError') { /* ... */ } else { /* ... */ }
            executeTaskkill();
          });
    } else {
        console.log('[Main Process] No hay proceso backend registrado o ya se ha cerrado. Procediendo con la salida.');
        clearTimeout(overallCleanupTimer);
        performExit();
    }
  });

  app.on('window-all-closed', () => {
    // @ts-expect-error // isQuitting is a custom flag to manage app lifecycle
    if (app.isQuitting) {
      // Si estamos saliendo intencionalmente, y no es macOS, permitir que app.quit() continúe.
      // En macOS, la app a menudo permanece activa.
      if (process.platform !== 'darwin') {
        // app.quit(); // No es necesario llamar a quit() aquí de nuevo si before-quit ya lo maneja.
      }
    } else {
      // Si no estamos saliendo, y todas las ventanas se cierran (ej. el usuario cerró la última ventana),
      // la aplicación permanecerá en la bandeja. No hacer nada aquí.
      console.log('[Main Process] Todas las ventanas cerradas, pero la app sigue en la bandeja.');
    }
  });

  app.on('activate', () => { // Este manejador es principalmente para macOS
    if (BrowserWindow.getAllWindows().length === 0) {
      // @ts-expect-error // isQuitting is a custom flag to manage app lifecycle
      if (!app.isQuitting) { // Solo recrear si no estamos en proceso de salir
        // Si el backend no está corriendo, intentar reiniciarlo antes de crear la ventana
        if (!backendProcess) {
            console.warn("[Main Process] activate event: Backend no está corriendo. Intentando reiniciar backend...");
            startBackend().then(() => {
                createWindow();
                // Recrear la bandeja si fue destruida o no existe
                if (!tray) createTray(); else updateTrayMenu();
            }).catch(err => {
                const errorMessage = err instanceof Error ? err.message : String(err);
                dialog.showErrorBox("Error de Reactivación", `No se pudo reiniciar el backend al activar la aplicación. Error: ${errorMessage}`);
            });
        } else {
            createWindow();
             if (!tray) createTray(); else updateTrayMenu();
        }
      }
    } else {
      // Si hay ventanas, simplemente mostrar y enfocar la principal
      win?.show();
      win?.focus();
      isHidden = false;
      updateTrayMenu();
    }
  });
}