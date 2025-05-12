import { app, BrowserWindow, Tray, Menu, nativeImage } from "electron";
import path from 'path';
import { fileURLToPath } from 'url';
import process from 'process';

// Recreate __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let win; // Hacer 'win' accesible globalmente en este módulo
let tray; // Hacer 'tray' accesible globalmente
let isHidden = false; // Estado para la visibilidad de la ventana

// Definir menuTemplate en un alcance más amplio para que sea accesible
// tanto para la creación inicial como para la actualización.
const menuTemplate = [
  {
    id: "toggleWindow", // ID más descriptivo
    label: "Ocultar Ventana", // Etiqueta inicial
    click: () => {
      if (win) { // Asegurarse de que la ventana exista
        if (isHidden) {
          win.show();
          if (process.platform === 'darwin') { // En macOS, app.focus() puede ser necesario
            app.focus({ steal: true });
          } else {
            win.focus();
          }
          menuTemplate.find(item => item.id === "toggleWindow").label = "Ocultar Ventana";
        } else {
          win.hide();
          menuTemplate.find(item => item.id === "toggleWindow").label = "Mostrar Ventana";
        }
        isHidden = !isHidden;

        // Reconstruir y aplicar el menú actualizado a la bandeja
        const newMenu = Menu.buildFromTemplate(menuTemplate);
        if (tray) { // Asegurarse de que la bandeja exista
          tray.setContextMenu(newMenu);
        }
      }
    }
  },
  {
    id: "quit",
    label: "Salir",
    click: () => {
      app.quit(); // Usar app.quit() para un cierre ordenado
    }
  }
];

const createWindow = () => {
  const indexPath = path.resolve(__dirname, '../index.html');

  win = new BrowserWindow({ // Asignar a la variable 'win' global
    width: 400,
    height: 400,
    // webPreferences: {
    //   preload: path.join(__dirname, 'preload.js') // Considera usar un preload script
    // }
  });

  win.loadFile(indexPath);

  // Opcional: manejar cuando la ventana se cierra con la 'x'
  // para que en lugar de cerrar la app, solo se oculte la ventana
  // y se pueda reabrir desde la bandeja.
  win.on('close', (event) => {
    if (!app.isQuitting) { // app.isQuitting es una bandera que puedes setear tú mismo
      event.preventDefault();
      win.hide();
      isHidden = true;
      menuTemplate.find(item => item.id === "toggleWindow").label = "Mostrar Ventana";
      const newMenu = Menu.buildFromTemplate(menuTemplate);
      if (tray) {
        tray.setContextMenu(newMenu);
      }
    }
  });
};

const createTray = () => {
  const iconPath = path.resolve(__dirname, '../public/icon.ico'); // Asegúrate que esta ruta es correcta
  
  let image;
  try {
    image = nativeImage.createFromPath(iconPath);
    if (image.isEmpty()) {
        console.error("Error: El ícono de la bandeja está vacío o no se pudo cargar desde:", iconPath);
        // Considera usar un ícono por defecto o no crear la bandeja
        return;
    }
  } catch (error) {
    console.error("Error al crear nativeImage para la bandeja:", error);
    return;
  }


  tray = new Tray(image); // Crear la bandeja con el ícono

  const contextMenu = Menu.buildFromTemplate(menuTemplate);
  tray.setContextMenu(contextMenu);
  tray.setToolTip('SondaClickMX'); // Añadir un tooltip
};

app.whenReady().then(() => {
  createWindow();
  createTray(); // Crear la bandeja después de crear la ventana o cuando la app esté lista

  app.on('activate', () => {
    // En macOS es común recrear una ventana en la app cuando el
    // ícono del dock es clickeado y no hay otras ventanas abiertas.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (win && !win.isVisible()) {
      // Si la ventana existe pero está oculta, mostrarla
      win.show();
      isHidden = false;
      menuTemplate.find(item => item.id === "toggleWindow").label = "Ocultar Ventana";
      const newMenu = Menu.buildFromTemplate(menuTemplate);
      if (tray) {
        tray.setContextMenu(newMenu);
      }
    }
  });
});

// Manejar el cierre de todas las ventanas de forma diferente en macOS
app.on('window-all-closed', () => {
  // En macOS, las aplicaciones suelen permanecer activas incluso sin ventanas abiertas.
  // En otros sistemas operativos, se suele salir de la aplicación.
  if (process.platform !== 'darwin') {
    // app.quit(); // Comentado para que la app permanezca en la bandeja
  }
});

// Opcional: para la bandera app.isQuitting
app.on('before-quit', () => {
  app.isQuitting = true;
});