
@echo off
echo Configurando íconos para SondaClickMX...

:: Crear acceso directo en el escritorio con el ícono correcto
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\SondaClickMX.lnk'); $Shortcut.TargetPath = '%ProgramFiles%\SondaClickMX\SondaClickMX.exe'; $Shortcut.IconLocation = '%ProgramFiles%\SondaClickMX\resources\app\public\icon.ico'; $Shortcut.Save()"

:: Crear acceso directo en el menú de inicio con el ícono correcto
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $StartMenu = [Environment]::GetFolderPath('Programs') + '\SondaClickMX'; if (!(Test-Path $StartMenu)) { New-Item -Path $StartMenu -ItemType Directory -Force }; $Shortcut = $WshShell.CreateShortcut($StartMenu + '\SondaClickMX.lnk'); $Shortcut.TargetPath = '%ProgramFiles%\SondaClickMX\SondaClickMX.exe'; $Shortcut.IconLocation = '%ProgramFiles%\SondaClickMX\resources\app\public\icon.ico'; $Shortcut.Save()"

echo Configuración de íconos completada.
exit /b 0
      