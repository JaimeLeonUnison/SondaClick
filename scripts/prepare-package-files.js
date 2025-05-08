// filepath: c:\Users\jaime\Documents\SondaClick\scripts\prepare-package-files.js
const fs = require('fs-extra');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const frontendDir = path.join(projectRoot, 'frontend');

const backendExeSrc = path.join(projectRoot, 'backend', 'dist', 'SondaClickBackend', 'SondaClickBackend.exe');
const envSrc = path.join(projectRoot, '.env');

const backendDestDir = path.join(frontendDir, 'packaged-backend');
const backendExeDest = path.join(backendDestDir, 'SondaClickBackend.exe');

const envDestDir = path.join(frontendDir, 'packaged-resources');
const envDest = path.join(envDestDir, '.env');

async function copyFiles() {
  try {
    console.log('Limpiando y copiando archivos para empaquetado de Electron...');
    await fs.remove(backendDestDir);
    await fs.remove(envDestDir);
    console.log('Directorios de destino anteriores limpiados.');

    await fs.ensureDir(backendDestDir);
    await fs.ensureDir(envDestDir);
    console.log('Directorios de destino creados/asegurados.');

    if (await fs.pathExists(backendExeSrc)) {
      await fs.copy(backendExeSrc, backendExeDest);
      console.log(`Backend ejecutable copiado a: ${backendExeDest}`);
    } else {
      console.error(`Error: El ejecutable del backend no se encontró en ${backendExeSrc}`);
      console.error('Asegúrate de haber compilado el backend con PyInstaller primero.');
      process.exit(1);
    }

    if (await fs.pathExists(envSrc)) {
      await fs.copy(envSrc, envDest);
      console.log(`.env principal copiado a: ${envDest}`);
    } else {
      console.error(`Error: El archivo .env principal no se encontró en ${envSrc}`);
      process.exit(1);
    }
    console.log('Archivos necesarios para el empaquetado copiados exitosamente a la carpeta frontend.');
  } catch (err) {
    console.error('Error al copiar archivos para empaquetado:', err);
    process.exit(1);
  }
}
copyFiles();