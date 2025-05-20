const { MSICreator } = require("electron-wix-msi");
const path = require("path");
const fs = require("fs");

// Define rutas absolutas
const APP_DIR = path.resolve(__dirname, "./frontend/SondaClickMX-win32-x64");
const OUT_DIR = path.resolve(__dirname, "./windows_installer");

// Verificar que el directorio de la aplicación existe
if (!fs.existsSync(APP_DIR)) {
  console.error(
    `❌ Error: El directorio de la aplicación no existe: ${APP_DIR}`
  );
  console.error('Ejecuta primero el comando "cd frontend && npm run package"');
  process.exit(1);
}

// Verificar que el ícono existe
const iconPath = path.resolve(__dirname, "./frontend/public/icon.ico");
if (!fs.existsSync(iconPath)) {
  console.error(`❌ Error: El ícono no existe en ${iconPath}`);
  console.error("Coloca un archivo icon.ico en la carpeta frontend/public/");
  process.exit(1);
}

// Crear directorio de salida si no existe
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

console.log("🔨 Iniciando creación de instalador MSI...");
console.log(`📂 Directorio de la aplicación: ${APP_DIR}`);
console.log(`📂 Directorio de salida: ${OUT_DIR}`);
console.log(`🖼️ Ícono: ${iconPath}`);

async function buildInstaller() {
  const APP_PRODUCT_NAME = "SondaClickMX";
  const APP_EXE_NAME = "SondaClickMX.exe";
  const APP_DESCRIPTION = "Aplicación SondaClickMX";
  const APP_MANUFACTURER = "SONDA";
  const APP_VERSION = "1.0.0";
  const SHORTCUT_FOLDER_NAME = APP_PRODUCT_NAME;
  const SHORTCUT_NAME = APP_PRODUCT_NAME;

  try {
    const msiCreator = new MSICreator({
      appDirectory: APP_DIR,
      outputDirectory: OUT_DIR,
      description: APP_DESCRIPTION,
      exe: APP_EXE_NAME,
      name: APP_PRODUCT_NAME,
      manufacturer: APP_MANUFACTURER,
      version: APP_VERSION,
      codepage: 65001,
      iconPath: iconPath,
      upgradeCode: "F18A0E1A-3CCD-4B91-8AA5-A2C516CC1D75",
      shortcutFolderName: SHORTCUT_FOLDER_NAME, // This should prompt MSICreator to create Start Menu shortcut structure
      shortcutName: SHORTCUT_NAME, // This should prompt MSICreator to create shortcut elements
      recursiveDirectoryInclusion: true,
      ui: {
        chooseDirectory: true,
      },
    });

    console.log("📝 Creando template WiX...");
    await msiCreator.create();

    console.log(
      "🔄 Modificando template para asegurar íconos en accesos directos..."
    );
    const wxsPath = path.join(OUT_DIR, "SondaClickMX.wxs");
    let wxsContent = fs.readFileSync(wxsPath, "utf-8");

    // 1. Ensure the <Icon Id="IconFile".../> definition exists.
    const iconDefinitionTag = `<Icon Id="IconFile" SourceFile="${iconPath.replace(
      /\\/g,
      "\\\\"
    )}" />`;
    if (!wxsContent.includes('<Icon Id="IconFile"')) {
      const productEndPos = wxsContent.lastIndexOf("</Product>");
      if (productEndPos !== -1) {
        wxsContent =
          wxsContent.slice(0, productEndPos) +
          `  ${iconDefinitionTag}\n` +
          wxsContent.slice(productEndPos);
      }
    } else {
      wxsContent = wxsContent.replace(
        /<Icon Id="IconFile" SourceFile="[^"]*"\s*\/>/g,
        iconDefinitionTag
      );
    }

    // 2. Ensure existing <Shortcut...> elements (expected to be created by MSICreator) use Icon="IconFile".
    // For the Desktop shortcut (MSICreator usually names it ApplicationDesktopShortcut)
    wxsContent = wxsContent.replace(
      /(<Shortcut Id="MyDesktopShortcut"[^>]*?)(?:\s*Icon="[^"]*")?([^>]*>)/gs,
      `$1 Icon="IconFile"$2`
    );
    // For the Start Menu shortcut (MSICreator usually names it ApplicationStartMenuShortcut)
    wxsContent = wxsContent.replace(
      /(<Shortcut Id="ApplicationStartMenuShortcut"[^>]*?)(?:\s*Icon="[^"]*")?([^>]*>)/gs,
      `$1 Icon="IconFile"$2`
    );

    fs.writeFileSync(wxsPath, wxsContent, "utf-8");
    console.log(
      "✅ Template WiX modificado correctamente (íconos en accesos directos existentes asegurados)"
    );

    console.log("🔧 Compilando instalador MSI...");
    await msiCreator.compile();

    console.log("✅ ¡Instalador MSI creado exitosamente!");
    const msiFiles = fs
      .readdirSync(OUT_DIR)
      .filter((file) => file.endsWith(".msi"));
    if (msiFiles.length > 0) {
      console.log(`   Instalador: ${path.join(OUT_DIR, msiFiles[0])}`);
    }
  } catch (error) {
    console.error("❌ Error al crear el instalador MSI:");
    console.error(error);
    process.exit(1);
  }
}

buildInstaller();
