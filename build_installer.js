const { MSICreator } = require("electron-wix-msi");
const path = require("path");
const fs = require("fs");

// Definir rutas absolutas
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
  try {
    // Instantiate the MSICreator
    const msiCreator = new MSICreator({
      appDirectory: APP_DIR,
      outputDirectory: OUT_DIR,

      // Configuración de metadatos
      description: "Aplicación SondaClickMX",
      exe: "SondaClickMX.exe",
      name: "SondaClickMX",
      manufacturer: "SONDA",
      version: "1.0.0",

      // Usar codepage UTF-8 para soportar caracteres especiales
      codepage: 65001,

      // Configuración del ícono
      iconPath: iconPath,

      // GUID de actualización
      upgradeCode: "F18A0E1A-3CCD-4B91-8AA5-A2C516CC1D75",

      // Configuración de accesos directos
      shortcutFolderName: "SondaClickMX",
      shortcutName: "SondaClickMX",

      // Forzar inclusión de todos los archivos
      recursiveDirectoryInclusion: true,

      // UI del instalador
      ui: {
        chooseDirectory: true,
      },
    });

    // Crear el archivo de template .wxs
    console.log("📝 Creando template WiX...");
    await msiCreator.create();

    // Modificar el archivo WXS para forzar los íconos en accesos directos
    console.log("🔄 Modificando template para mejorar los accesos directos...");
    const wxsPath = path.join(OUT_DIR, "SondaClickMX.wxs");
    let wxsContent = fs.readFileSync(wxsPath, "utf-8");

    // Limpiar caracteres problemáticos (que no son parte de Windows-1252)
    wxsContent = wxsContent.replace(/[^\x00-\xFF]/g, "");

    // Verificar si ya existe la definición de IconFile
    const hasIconDefinition = wxsContent.includes('<Icon Id="IconFile"');

    // Asegúrate de que la definición del ícono existe
    if (!hasIconDefinition) {
      const productEndPos = wxsContent.lastIndexOf("</Product>");
      if (productEndPos !== -1) {
        // Añadir definición de ícono si no existe
        const iconDefinition = `\n  <Icon Id="IconFile" SourceFile="${iconPath.replace(
          /\\/g,
          "\\\\"
        )}"/>\n  `;
        wxsContent =
          wxsContent.slice(0, productEndPos) +
          iconDefinition +
          wxsContent.slice(productEndPos);
      }
    }

    // Verificar si ya existe un ComponentRef para ApplicationShortcut
    const hasDesktopShortcut = wxsContent.includes(
      '<ComponentRef Id="ApplicationShortcut"'
    );

    // Agregar referencia al acceso directo de escritorio si no existe
    if (!hasDesktopShortcut) {
      // Buscar la etiqueta Feature para insertar el ComponentRef
      const featureEndPos = wxsContent.indexOf("</Feature>");
      if (featureEndPos !== -1) {
        // Insertar la referencia al componente de acceso directo
        const componentRefText =
          '<ComponentRef Id="ApplicationShortcut" />\n      ';
        wxsContent =
          wxsContent.slice(0, featureEndPos) +
          componentRefText +
          wxsContent.slice(featureEndPos);

        // Buscar la posición para insertar la definición del componente
        const productEndPos = wxsContent.lastIndexOf("</Product>");
        if (productEndPos !== -1) {
          // Crear el fragmento para los accesos directos con ícono explícito
          const shortcutFragment = `
  <DirectoryRef Id="DesktopFolder">
    <Component Id="ApplicationShortcut" Guid="*">
      <Shortcut Id="ApplicationDesktopShortcut"
                Name="SondaClickMX"
                Description="Iniciar SondaClickMX"
                Target="[INSTALLFOLDER]SondaClickMX.exe"
                WorkingDirectory="INSTALLFOLDER"
                Icon="IconFile"/>
      <RemoveFolder Id="CleanUpDesktopShortcut" Directory="DesktopFolder" On="uninstall"/>
      <RegistryValue Root="HKCU" Key="Software\\SondaClickMX" Name="installed" Type="integer" Value="1" KeyPath="yes"/>
    </Component>
  </DirectoryRef>
          `;
          // Insertar el fragmento
          wxsContent =
            wxsContent.slice(0, productEndPos) +
            shortcutFragment +
            wxsContent.slice(productEndPos);
        }
      }
    }

    // Verificar si ya existe un ProgramMenuFolder
    const hasProgramMenuFolder = wxsContent.includes(
      'Id="ApplicationProgramsFolder"'
    );

    // NO añadir menú inicio si ya existe - Esta es la parte que causa el error
    if (!hasProgramMenuFolder) {
      const featureEndPos = wxsContent.indexOf("</Feature>");
      if (featureEndPos !== -1) {
        const componentRefText =
          '<ComponentRef Id="StartMenuShortcut" />\n      ';
        wxsContent =
          wxsContent.slice(0, featureEndPos) +
          componentRefText +
          wxsContent.slice(featureEndPos);

        const productEndPos = wxsContent.lastIndexOf("</Product>");
        if (productEndPos !== -1) {
          const startMenuFragment = `
  <DirectoryRef Id="ProgramMenuFolder">
    <Directory Id="ApplicationProgramsFolder" Name="SondaClickMX">
      <Component Id="StartMenuShortcut" Guid="*">
        <Shortcut Id="ApplicationStartMenuShortcut"
                  Name="SondaClickMX"
                  Description="Iniciar SondaClickMX"
                  Target="[INSTALLFOLDER]SondaClickMX.exe"
                  WorkingDirectory="INSTALLFOLDER"
                  Icon="IconFile"/>
        <RemoveFolder Id="CleanUpStartMenuFolder" Directory="ApplicationProgramsFolder" On="uninstall"/>
        <RegistryValue Root="HKCU" Key="Software\\SondaClickMX" Name="startmenu_installed" Type="integer" Value="1" KeyPath="yes"/>
      </Component>
    </Directory>
  </DirectoryRef>
          `;
          wxsContent =
            wxsContent.slice(0, productEndPos) +
            startMenuFragment +
            wxsContent.slice(productEndPos);
        }
      }
    }

    // Guardar el archivo modificado
    fs.writeFileSync(wxsPath, wxsContent, "utf-8");
    console.log("✅ Template WiX modificado correctamente");

    // Compilar el template a un archivo .msi
    console.log("🔧 Compilando instalador MSI...");
    await msiCreator.compile();

    console.log("✅ ¡Instalador MSI creado exitosamente!");
    const msiFiles = fs
      .readdirSync(OUT_DIR)
      .filter((file) => file.endsWith(".msi"));
    if (msiFiles.length > 0) {
      console.log(`   Instalador: ${path.join(OUT_DIR, msiFiles[0])}`);
      
      // Crear un script post-instalación para asegurar que el ícono se establezca correctamente
      const postInstallScript = `
@echo off
echo Configurando íconos para SondaClickMX...

:: Crear acceso directo en el escritorio con el ícono correcto
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\\SondaClickMX.lnk'); $Shortcut.TargetPath = '%ProgramFiles%\\SondaClickMX\\SondaClickMX.exe'; $Shortcut.IconLocation = '%ProgramFiles%\\SondaClickMX\\resources\\app\\public\\icon.ico'; $Shortcut.Save()"

:: Crear acceso directo en el menú de inicio con el ícono correcto
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $StartMenu = [Environment]::GetFolderPath('Programs') + '\\SondaClickMX'; if (!(Test-Path $StartMenu)) { New-Item -Path $StartMenu -ItemType Directory -Force }; $Shortcut = $WshShell.CreateShortcut($StartMenu + '\\SondaClickMX.lnk'); $Shortcut.TargetPath = '%ProgramFiles%\\SondaClickMX\\SondaClickMX.exe'; $Shortcut.IconLocation = '%ProgramFiles%\\SondaClickMX\\resources\\app\\public\\icon.ico'; $Shortcut.Save()"

echo Configuración de íconos completada.
exit /b 0
      `;
      
      const postInstallPath = path.join(OUT_DIR, 'configure-icons.cmd');
      fs.writeFileSync(postInstallPath, postInstallScript);
      console.log(`   Script post-instalación creado: ${postInstallPath}`);
      console.log(`   Ejecuta este script después de instalar para configurar los íconos correctamente.`);
    }
  } catch (error) {
    console.error("❌ Error al crear el instalador MSI:");
    console.error(error);
  }
}

// Ejecutar la función
buildInstaller();
