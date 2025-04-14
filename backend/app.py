from flask import Flask, jsonify, request
from flask_cors import CORS
import psutil
import socket
import requests
import subprocess
import shutil
import platform
import getpass
import uuid
import ctypes
import re
import os

app = Flask(__name__)
CORS(app)  # Permite que el frontend (React) haga peticiones

def get_system_details():
    try:
        # Función auxiliar para manejar la salida de comandos WMIC de forma segura
        def get_wmic_output(command):
            try:
                output = subprocess.check_output(command, shell=True).decode()
                lines = [line.strip() for line in output.split('\n') if line.strip()]
                if len(lines) > 1:  # Al menos debe haber encabezado y un valor
                    return lines[1]  # El primer valor después del encabezado
                return "No disponible"
            except Exception as e:
                print(f"Error ejecutando comando '{command}': {e}")
                return "No disponible"
        
        # Obtener información del sistema de forma segura
        manufacturer = get_wmic_output("wmic computersystem get manufacturer")
        model = get_wmic_output("wmic computersystem get model")
        domain = get_wmic_output("wmic computersystem get domain")
        
        os_name = platform.system()
        os_version = platform.version()
        os_release = platform.release()
        
        is_in_domain = domain.upper() != "WORKGROUP"
        
        return {
            "manufacturer": manufacturer,
            "model": model,
            "os": f"{os_name} {os_release} (v{os_version})",
            "domain": domain if is_in_domain else "No está en un dominio"
        }
    except Exception as e:
        print(f"Error obteniendo detalles del sistema: {e}")
        return {
            "manufacturer": "No disponible",
            "model": "No disponible",
            "os": "No disponible",
            "domain": "No disponible"
        }

def get_disk_usage():
    try:
        total, used, free = shutil.disk_usage("/")
        percent = round(used / total * 100, 2)
        return {
            "total": total,
            "used": used,
            "free": free,
            "percent": percent
        }
    except Exception as e:
        return {"error": str(e)}

def get_cpu_speed():
    try:
        freq = psutil.cpu_freq()
        return freq.current if freq else None
    except Exception:
        return None

def get_gpu_temp():
    try:
        output = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=temperature.gpu", "--format=csv,noheader,nounits"],
            encoding="utf-8"
        )
        return int(output.strip())
    except Exception:
        return None

def get_local_ip():
    try:
        return socket.gethostbyname(socket.gethostname())
    except Exception:
        return None

def get_public_ip():
    try:
        return requests.get("https://api.ipify.org").text
    except Exception:
        return None

def get_cpu_temp_from_registry():
    try:
        import winreg
        possible_paths = [
            r"HARDWARE\\ACPI\\THERMAL_ZONE",
            r"HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0",
            r"SYSTEM\\CurrentControlSet\\Services\\Processor\\Performance"
        ]
        for path in possible_paths:
            try:
                reg = winreg.ConnectRegistry(None, winreg.HKEY_LOCAL_MACHINE)
                key = winreg.OpenKey(reg, path)
                for val_name in ["_TMP", "CurrentTemperature", "Temperature"]:
                    try:
                        value, _ = winreg.QueryValueEx(key, val_name)
                        temp_celsius = (value / 10.0) - 273.15 if value > 1000 else value
                        return temp_celsius
                    except:
                        continue
            except:
                continue
        return None
    except Exception:
        return None

def get_system_temperatures():
    temps = {}
    gpu_temp = get_gpu_temp()
    if gpu_temp is not None:
        temps["gpu"] = gpu_temp
    registry_temp = get_cpu_temp_from_registry()
    if registry_temp is not None:
        temps["cpu"] = registry_temp
    else:
        cpu_percent = psutil.cpu_percent(interval=0.1)
        base_temp = 35.0
        max_temp = 85.0
        load_factor = (cpu_percent / 100.0) ** 0.8
        estimated_temp = base_temp + (max_temp - base_temp) * load_factor
        temps["cpu"] = round(estimated_temp, 1)
    return temps

def get_serial_number():
    try:
        output = subprocess.check_output("wmic bios get serialnumber", shell=True).decode()
        lines = [line.strip() for line in output.split('\n') if line.strip()]
        if len(lines) > 1:
            return lines[1]
        return "No disponible"
    except Exception as e:
        print(f"Error obteniendo número de serie: {e}")
        return "No disponible"

def get_network_interfaces():
    interfaces = []
    for interface, addrs in psutil.net_if_addrs().items():
        iface_info = {"name": interface, "ip": None, "mac": None}
        for addr in addrs:
            if addr.family == socket.AF_INET:
                iface_info["ip"] = addr.address
            elif addr.family == psutil.AF_LINK:
                iface_info["mac"] = addr.address
        interfaces.append(iface_info)
    return interfaces

def get_hostname():
    try:
        return socket.gethostname()
    except Exception as e:
        print(f"Error obteniendo nombre de host: {e}")
        return "No disponible"
    
def change_password(username, old_password, new_password):
    try:
        # Determinar si el usuario está en un dominio o es local
        is_domain_user = False
        domain = None
        
        # Verificar si el nombre de usuario incluye dominio (formato: DOMINIO\usuario)
        if '\\' in username:
            domain, username = username.split('\\', 1)
            is_domain_user = True
        else:
            # Intentar determinar si está en un dominio consultando la información del sistema
            try:
                domain_info = subprocess.check_output("wmic computersystem get domain", shell=True).decode().strip()
                domain_lines = [line.strip() for line in domain_info.split('\n') if line.strip()]
                if len(domain_lines) > 1:
                    domain = domain_lines[1]
                    # Si no es WORKGROUP, probablemente es un dominio
                    is_domain_user = domain.upper() != "WORKGROUP"
            except Exception as e:
                print(f"Error al verificar dominio: {e}")
        
        # Verificar si la aplicación se está ejecutando como administrador
        is_admin = ctypes.windll.shell32.IsUserAnAdmin() != 0
        if not is_admin:
            return {"success": False, "message": "Esta operación requiere privilegios de administrador"}
        
        # Validar la contraseña actual
        validation_success = False
        
        if is_domain_user and domain:
            # Para usuarios de dominio, intentar validar contraseña
            try:
                # Usar logon con PowerShell
                ps_cmd = f'powershell -Command "$secpasswd = ConvertTo-SecureString \'{old_password}\' -AsPlainText -Force; $creds = New-Object System.Management.Automation.PSCredential (\'{domain}\\{username}\', $secpasswd); $result = Invoke-Command -ComputerName localhost -Credential $creds -ScriptBlock {{ $true }} -ErrorAction SilentlyContinue; if ($result) {{ Write-Output \'Success\' }} else {{ Write-Output \'Failure\' }}"'
                ps_result = subprocess.run(ps_cmd, shell=True, capture_output=True, text=True)
                validation_success = "Success" in ps_result.stdout
            except Exception as e:
                print(f"Error validando contraseña de dominio: {e}")
                return {"success": False, "message": f"Error validando credenciales: {str(e)}"}
        else:
            # Para usuarios locales, usar el método existente
            verify_cmd = f'echo {old_password} | runas /user:{username} "cmd.exe /c echo Contraseña correcta" 2>&1'
            verify_result = subprocess.run(verify_cmd, shell=True, capture_output=True, text=True)
            validation_success = "Contraseña no es correcta" not in verify_result.stderr.lower() and "incorrect password" not in verify_result.stderr.lower()
        
        if not validation_success:
            return {"success": False, "message": "Contraseña actual incorrecta"}
            
        # Cambiar la contraseña
        if is_domain_user and domain:
            # Para usuarios de dominio
            try:
                # Usar PowerShell para cambiar contraseña de dominio
                ps_cmd = f'powershell -Command "$secpasswd = ConvertTo-SecureString \'{old_password}\' -AsPlainText -Force; $newpasswd = ConvertTo-SecureString \'{new_password}\' -AsPlainText -Force; $creds = New-Object System.Management.Automation.PSCredential (\'{domain}\\{username}\', $secpasswd); try {{ Set-ADAccountPassword -Identity \'{username}\' -OldPassword $secpasswd -NewPassword $newpasswd -ErrorAction Stop; Write-Output \'Success\' }} catch {{ Write-Output $_.Exception.Message }}"'
                ps_result = subprocess.run(ps_cmd, shell=True, capture_output=True, text=True)
                
                if "Success" in ps_result.stdout:
                    return {"success": True, "message": "Contraseña de dominio cambiada con éxito"}
                else:
                    error_msg = ps_result.stdout.strip() or ps_result.stderr.strip() or "Error desconocido"
                    
                    # Alternativa: intentar cambiar con ADSI si falló
                    try:
                        adsi_cmd = f'powershell -Command "$secpasswd = ConvertTo-SecureString \'{old_password}\' -AsPlainText -Force; $creds = New-Object System.Management.Automation.PSCredential (\'{domain}\\{username}\', $secpasswd); try {{ $user = [ADSI]"WinNT://{domain}/{username}"; $user.ChangePassword(\'{old_password}\', \'{new_password}\'); Write-Output \'Success\' }} catch {{ Write-Output $_.Exception.Message }}"'
                        adsi_result = subprocess.run(adsi_cmd, shell=True, capture_output=True, text=True)
                        
                        if "Success" in adsi_result.stdout:
                            return {"success": True, "message": "Contraseña de dominio cambiada con éxito (método alternativo)"}
                    except Exception as e:
                        print(f"Error en método ADSI: {e}")
                        
                    return {"success": False, "message": f"Error al cambiar contraseña de dominio: {error_msg}"}
            except Exception as e:
                print(f"Error cambiando contraseña de dominio: {e}")
                return {"success": False, "message": f"Error: {str(e)}"}
        else:
            # Para usuarios locales
            try:
                cmd = f'net user {username} {new_password}'
                result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
                
                if result.returncode == 0:
                    return {"success": True, "message": "Contraseña local cambiada con éxito"}
                else:
                    error_msg = result.stderr.strip() if result.stderr else result.stdout.strip() if result.stdout else "Error desconocido"
                    
                    # Si falló, intentar con método alternativo (WinAPI)
                    try:
                        ps_cmd = f'powershell -Command "try {{ $user = [ADSI]\'WinNT://./\' + \'{username}\'; $user.ChangePassword(\'{old_password}\', \'{new_password}\'); Write-Output \'Success\' }} catch {{ Write-Output $_.Exception.Message }}"'
                        ps_result = subprocess.run(ps_cmd, shell=True, capture_output=True, text=True)
                        
                        if "Success" in ps_result.stdout:
                            return {"success": True, "message": "Contraseña local cambiada con éxito (método alternativo)"}
                    except Exception as e:
                        print(f"Error en método ADSI local: {e}")
                        
                    return {"success": False, "message": f"Error al cambiar contraseña local: {error_msg}"}
            except Exception as e:
                print(f"Error cambiando contraseña local: {e}")
                return {"success": False, "message": f"Error: {str(e)}"}
    except Exception as e:
        print(f"Error general cambiando contraseña: {e}")
        return {"success": False, "message": f"Error inesperado: {str(e)}"}

@app.route("/api/system-info")
def system_info():
    sys_details = get_system_details()
    temps = get_system_temperatures()
    interfaces = get_network_interfaces()

    return jsonify({
        "user": getpass.getuser(),
        "hostname": get_hostname(),
        "cpu_percent": psutil.cpu_percent(interval=1),
        "memory": psutil.virtual_memory()._asdict(),
        "cpu_speed": get_cpu_speed(),
        "temperatures": temps,
        "gpu_temp": get_gpu_temp(),
        "ip_local": get_local_ip(),
        "ip_public": get_public_ip(),
        "disk_usage": get_disk_usage(),
        "serial_number": get_serial_number(),
        "network_interfaces": interfaces,
        **sys_details
    })

@app.route('/api/open-password-dialog', methods=['POST', 'OPTIONS'])
def open_password_dialog():
    # Manejar preflight CORS
    if request.method == 'OPTIONS':
        return '', 200
        
    try:
        # Este comando abre el diálogo de cambio de contraseña en Windows
        subprocess.Popen('rundll32.exe keymgr.dll,KRShowKeyMgr', shell=True)
        return jsonify({"success": True, "message": "Diálogo de cambio de contraseña abierto"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route("/api/change-password", methods=["POST"])
def change_password_endpoint():
    """
    Endpoint para cambiar la contraseña del usuario
    Requiere: username, oldPassword, newPassword
    """
    try:
        # Obtenemos los datos del cuerpo de la solicitud
        data = request.get_json()
        
        if not data:
            return jsonify({"success": False, "message": "Datos no proporcionados"}), 400
            
        username = data.get("username")
        old_password = data.get("oldPassword")
        new_password = data.get("newPassword")
        
        # Validamos que todos los campos requeridos estén presentes
        if not all([username, old_password, new_password]):
            return jsonify({"success": False, "message": "Faltan campos requeridos"}), 400
            
        # Validamos requisitos mínimos de seguridad para la nueva contraseña
        if len(new_password) < 8:
            return jsonify({"success": False, "message": "La nueva contraseña debe tener al menos 8 caracteres"}), 400
            
        # Ejecutamos la función de cambio de contraseña
        result = change_password(username, old_password, new_password)
        
        if result["success"]:
            return jsonify(result), 200
        else:
            return jsonify(result), 400
            
    except Exception as e:
        print(f"Error en el endpoint de cambio de contraseña: {e}")
        return jsonify({"success": False, "message": f"Error del servidor: {str(e)}"}), 500

if __name__ == "__main__":
    app.run(debug=True)