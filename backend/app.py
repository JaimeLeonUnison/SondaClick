from flask import Flask, jsonify, request
from flask_cors import CORS
#from dotenv import load_dotenv
import threading
import wmi
import psutil
import socket
import requests
import subprocess
import shutil
import platform
import getpass
import uuid
import sys
import ctypes
import re
import os
import pymysql
import pythoncom
import traceback # Para logging de excepciones completas
import json # Para parsear la salida JSON de PowerShell
import tempfile # Para _get_user_details_via_powershell

app = Flask(__name__)
CORS(app)  # Permite que el frontend (React) haga peticiones

#Cargar variables de entorno desde el archivo .env
#load_dotenv()

def get_connection():
    """
    Obtiene una conexión a la base de datos usando credenciales seguras
    desde variables de entorno
    """
    try:
        connection = pymysql.connect(
            host=os.getenv('DB_HOST', 'localhost'),
            user=os.getenv('DB_USER', 'root'),
            password=os.getenv('DB_PASSWORD', ''),
            database=os.getenv('DB_NAME', 'prueba'),
            port=int(os.getenv('DB_PORT', 3306)),
            charset='utf8mb4',
            connect_timeout=10 # Aumentado ligeramente el timeout de conexión
        )
        return connection
    except Exception as e:
        print(f"[DB Connection] Error al conectar a la base de datos: {e}")
        return None

def execute_query(query, params=None, fetch=False):
    """
    Ejecuta una consulta SQL con los parámetros proporcionados
    
    Args:
        query (str): Consulta SQL
        params (tuple): Parámetros para la consulta
        fetch (bool): Indica si se deben devolver resultados
        
    Returns:
        list/None: Resultados de la consulta o None si hay un error
    """
    connection = get_connection()
    if not connection:
        return None
        
    try:
        with connection.cursor() as cursor:
            cursor.execute(query, params)
            
            if fetch:
                result = cursor.fetchall()
            else:
                connection.commit()
                result = True
                
        return result
    except Exception as e:
        print(f"Error al ejecutar la consulta: {e}")
        return None
    finally:
        if connection: # Asegurarse de que connection no sea None antes de cerrar
            connection.close()

def execute_procedure(procedure_name, params=None):
    """
    Ejecuta un procedimiento almacenado con los parámetros proporcionados
    
    Args:
        procedure_name (str): Nombre del procedimiento
        params (tuple): Parámetros para el procedimiento
        
    Returns:
        bool: True si se ejecutó correctamente, False en caso contrario
    """
    connection = get_connection()
    if not connection:
        print(f" No se pudo establecer conexión a la base de datos para {procedure_name}")
        return False
        
    try:
        with connection.cursor() as cursor:
            print(f"⏳ Ejecutando procedimiento {procedure_name} con parámetros: {params}")
            cursor.callproc(procedure_name, params)
            connection.commit()
            print(f" Procedimiento {procedure_name} ejecutado y transacción confirmada")
            return True
    except Exception as e:
        print(f" Error al ejecutar el procedimiento {procedure_name}: {e}")
        return False
    finally:
        if connection: # Asegurarse de que connection no sea None
            connection.close()

# Ejemplo de función específica para guardar datos de monitoreo del sistema
def save_system_info(hostname, cpu_percent, memory_percent, disk_percent, temperatures):
    """
    Guarda información del sistema en la base de datos utilizando el stored procedure Sp_CreaIncidente
    SOLO cuando se detecten condiciones críticas según los umbrales configurados en variables de entorno
    """
    try:
        # Extraer temperaturas específicas si están disponibles
        cpu_temp = temperatures.get('cpu', None)
        
        # Obtener umbrales desde variables de entorno o usar valores predeterminados
        cpu_threshold = float(os.getenv('CRITICAL_CPU_THRESHOLD', 90))
        temp_threshold = float(os.getenv('CRITICAL_TEMP_THRESHOLD', 90))
        memory_threshold = float(os.getenv('CRITICAL_MEMORY_THRESHOLD', 90))
        
        # Verificar si se cumplen las condiciones críticas para guardar en BD
        is_critical = False
        critical_reason = []
        
        # Verificar CPU
        if cpu_percent >= cpu_threshold:
            is_critical = True
            critical_reason.append(f"CPU al {cpu_percent}% (umbral: {cpu_threshold}%)")
            
        # Verificar Temperatura CPU
        if cpu_temp is not None and cpu_temp >= temp_threshold:
            is_critical = True
            critical_reason.append(f"Temperatura CPU: {cpu_temp}°C (umbral: {temp_threshold}°C)")
            
        # Verificar Memoria RAM
        if memory_percent >= memory_threshold:
            is_critical = True
            critical_reason.append(f"Memoria RAM al {memory_percent}% (umbral: {memory_threshold}%)")
        
        # Solo guardar si se detecta una condición crítica
        if is_critical:
            # Registrar en el log la razón
            print(f" Condición crítica detectada: {', '.join(critical_reason)}. Guardando en base de datos.")
            
            # Obtener el número de serie
            serial_number = get_serial_number()
            
            # Obtener la fecha actual
            from datetime import datetime
            current_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            # Obtener usuario y dominio separados
            user = getpass.getuser()
            domain_info = subprocess.check_output("wmic computersystem get domain", shell=True).decode().strip()
            domain_lines = [line.strip() for line in domain_info.split('\n') if line.strip()]
            domain = domain_lines[1] if len(domain_lines) > 1 else ""
            is_domain = domain.upper() != "WORKGROUP"
            
            # Usuario y dominio como campos separados (para el nuevo formato)
            dominio = domain if is_domain else "LOCAL"
            usuario = user
            
            # También mantener el formato combinado para compatibilidad
            usuario_dominio = f"{domain}\\{user}" if is_domain else user
            
            # Obtener IP pública
            ip_publica = get_public_ip() or "No disponible"
            
            # Obtener MAC de la interfaz activa
            mac_address = ""
            # Determinar IP local activa
            local_ip = get_local_ip()
            interfaces = get_network_interfaces()
            # Primero buscar la interfaz con la IP local activa
            for iface in interfaces:
                if iface.get('ip') == local_ip and iface.get('mac'):
                    mac_address = iface.get('mac')[:50]  # Limitar a 50 caracteres
                    break
            # Si no encontramos, usar la primera interfaz con MAC e IP asignada que no sea loopback
            if not mac_address:
                for iface in interfaces:
                    if iface.get('ip') and iface.get('mac') and not iface['ip'].startswith('127.'):
                        mac_address = iface.get('mac')[:50]
                        break
            
            # Obtener Marca y Modelo del sistema
            sys_details = get_system_details()
            manufacturer = sys_details.get('manufacturer', 'Unknown')[:50]  # Limitar a 50 caracteres
            model = sys_details.get('model', 'Unknown')[:50]  # Limitar a 50 caracteres
            
            # Definir el estatus como 0 (valor por defecto)
            estatus = 0
            
            # Convertir valores a enteros para BIGINT
            cpu_percent_int = int(cpu_percent)
            memory_percent_int = int(memory_percent)
            disk_percent_int = int(disk_percent)
            cpu_temp_int = int(cpu_temp) if cpu_temp is not None else 0
            
            # Verificar la estructura del procedimiento almacenado existente
            connection = get_connection()
            if connection:
                try:
                    with connection.cursor() as cursor:
                        cursor.execute("""
                        SELECT PARAMETER_NAME, ORDINAL_POSITION 
                        FROM INFORMATION_SCHEMA.PARAMETERS 
                        WHERE SPECIFIC_NAME = 'Sp_CreaIncidente' 
                        ORDER BY ORDINAL_POSITION
                        """)
                        params_info = cursor.fetchall()
                        
                        if params_info:
                            print(f"Estructura del procedimiento: {params_info}")
                        else:
                            print("No se pudo determinar la estructura del procedimiento")
                except Exception as e:
                    print(f"Error al verificar la estructura del procedimiento: {e}")
                finally:
                    connection.close()
            
            # Adaptarse al procedimiento actualizado con 14 parámetros incluyendo MAC, Marca y Modelo
            params = (
                hostname,               # 1. HostName
                serial_number,          # 2. NumeroSerie
                cpu_percent_int,        # 3. UsoCPU
                memory_percent_int,     # 4. UsoMemoria
                disk_percent_int,       # 5. UsoHD
                cpu_temp_int,           # 6. Temperatura
                current_date,           # 7. FechaIncidente
                estatus,                # 8. estatus
                dominio,                # 9. Dominio
                ip_publica,             # 10. IpPublica
                usuario,                # 11. Usuario
                mac_address,            # 12. MAC
                manufacturer,           # 13. Marca
                model                   # 14. Modelo
            )
            
            # Ejecutar el procedimiento almacenado
            result = execute_procedure("Sp_CreaIncidente", params)
            
            # NUEVO: Insertar también en NotificacionesClientes
            try:
                # Crear un mensaje personalizado para la notificación
                mensaje = f" Alerta crítica en {hostname}: {', '.join(critical_reason)}"
                
                # Determinar el tipo de notificación (1=CPU, 2=Memoria, 3=Temperatura)
                tipo_notificacion = 0
                if "CPU al" in mensaje:
                    tipo_notificacion = 1
                elif "Memoria RAM" in mensaje:
                    tipo_notificacion = 2
                elif "Temperatura" in mensaje:
                    tipo_notificacion = 3
                
                # Guardar en NotificacionesCliente con los campos correctos
                insert_query = """
                INSERT INTO NotificacionesCliente 
                (HostName, NumeroSerie, UsoCPU, UsoMemoria, UsoHD, Temperatura, FechaIncidente, estatus, Dominio, IpPublica, Usuario, MAC, Marca, Modelo) 
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """
                
                insert_params = (
                    hostname,             # HostName
                    serial_number,        # NumeroSerie
                    cpu_percent_int,      # UsoCPU
                    memory_percent_int,   # UsoMemoria
                    disk_percent_int,     # UsoHD
                    cpu_temp_int,         # Temperatura
                    current_date,         # FechaIncidente
                    estatus,              # estatus
                    dominio,              # Dominio
                    ip_publica,           # IpPublica
                    usuario,              # Usuario
                    mac_address,          # MAC
                    manufacturer,         # Marca
                    model                 # Modelo
                )
                
                # Ejecutar la inserción
                notification_result = execute_query(insert_query, insert_params)
                
                if notification_result:
                    print(f" Notificación guardada correctamente para {hostname}")
                else:
                    print(f" Error al guardar la notificación para {hostname}")
                
            except Exception as notif_error:
                print(f"Error al guardar notificación: {notif_error}")
            
            return result
        else:
            # No se detectó condición crítica, no guardamos en la BD
            return True
            
    except Exception as e:
        print(f"Error guardando información del sistema: {e}")
        return False

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
        cflags = 0
        if platform.system() == "Windows":
            cflags = subprocess.CREATE_NO_WINDOW
            
        output = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=temperature.gpu", "--format=csv,noheader,nounits"],
            encoding="utf-8", # Asumiendo que nvidia-smi da utf-8
            creationflags=cflags
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

# Añadir esta función auxiliar para obtener información de contraseña local
def _get_local_password_expiration():
    try:
        username = getpass.getuser()
        # Intentar obtener información de contraseña local usando WMIC
        cmd_wmic = f"wmic useraccount where name='{username}' get PasswordExpires"
        result_wmic = subprocess.run(cmd_wmic, shell=True, capture_output=True, text=True, encoding='utf-8', errors='backslashreplace')
        
        if result_wmic.returncode == 0:
            lines = [line.strip() for line in result_wmic.stdout.split('\n') if line.strip()]
            if len(lines) > 1:
                expires_str = lines[1].upper()
                expires = expires_str == 'TRUE'
                
                if expires:
                    try:
                        cmd_policy = "net accounts"
                        policy_result = subprocess.run(cmd_policy, shell=True, capture_output=True, text=True, encoding='utf-8', errors='backslashreplace')
                        
                        if policy_result.returncode == 0:
                            output_policy = policy_result.stdout
                            max_age_match = re.search(r'(Vigencia máxima|Maximum password age).*?(\d+)', output_policy, re.IGNORECASE)
                            
                            if max_age_match:
                                max_days = int(max_age_match.group(2))
                                if max_days == 0 or max_days > 900: # 0 o un valor muy alto usualmente significa "nunca expira" para net accounts
                                     return {"expires": False, "message": "Tu contraseña local no expira según la política."}

                                cmd_lastset = f"net user \"{username}\"" # Comillas por si el username tiene espacios
                                lastset_result = subprocess.run(cmd_lastset, shell=True, capture_output=True, text=True, encoding='utf-8', errors='backslashreplace')
                                
                                if lastset_result.returncode == 0:
                                    lastset_output = lastset_result.stdout
                                    # Ajustar regex para ser más flexible con el formato de fecha y la etiqueta
                                    lastset_match = re.search(r'(?:Último cambio de contraseña|Password last set|Última contraseña establecida)\s+(.+)', lastset_output, re.IGNORECASE)
                                    
                                    if lastset_match:
                                        import datetime # Mover import aquí
                                        date_str_from_net = lastset_match.group(1).strip().split(" ")[0] # Tomar solo la parte de la fecha

                                        for fmt in ["%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%d"]: # Añadir YYYY-MM-DD
                                            try:
                                                lastset_date = datetime.datetime.strptime(date_str_from_net, fmt).date()
                                                expiry_date = lastset_date + datetime.timedelta(days=max_days)
                                                days_remaining = (expiry_date - datetime.date.today()).days
                                                
                                                message = ""
                                                if days_remaining <= 0: message = "¡Tu contraseña local ha expirado! Debes cambiarla inmediatamente."
                                                elif days_remaining == 1: message = "¡Tu contraseña local expira mañana!"
                                                elif days_remaining <= 7: message = f"¡Tu contraseña local expirará en {days_remaining} días!" # Ajustado a 7 días
                                                else: message = f"Tu contraseña local expirará el {expiry_date.strftime('%Y-%m-%d')} (en {days_remaining} días)."
                                                    
                                                return {"expires": True, "daysRemaining": days_remaining, "expiryDate": expiry_date.strftime('%Y-%m-%d'), "message": message, "method": "local_net_user_policy"}
                                            except ValueError:
                                                continue
                                        print(f"[_get_local_password_expiration] No se pudo parsear la fecha '{date_str_from_net}' con formatos conocidos.")
                    except Exception as policy_error:
                        print(f"[_get_local_password_expiration] Error al obtener política local o fecha de último cambio: {policy_error}")
                    return {"expires": True, "message": "Tu contraseña local está configurada para expirar, pero no se pudo determinar la fecha exacta.", "method": "local_wmic_expires_true_unknown_date"}
                else: # PasswordExpires es FALSE
                    return {"expires": False, "message": "Tu contraseña local no expira.", "method": "local_wmic_never_expires"}
        
        print(f"[_get_local_password_expiration] WMIC falló o no dio info. Salida: {result_wmic.stdout} Error: {result_wmic.stderr}")
        return {"expires": None, "message": "No se pudo determinar el estado de expiración de tu contraseña local vía WMIC.", "method": "local_wmic_failed"}
    except Exception as e:
        print(f"[_get_local_password_expiration] Error general: {e}")
        traceback.print_exc()
        return {"expires": None, "message": "Error al verificar la información de contraseña local.", "method": "local_exception"}

@app.route('/api/check-domain', methods=['GET'])
def check_domain():
    is_in_domain = False
    domain_name = "WORKGROUP"
    pythoncom.CoInitialize()
    try:
        c = wmi.WMI()
        for system in c.Win32_ComputerSystem():
            domain_from_wmi = system.Domain
            if domain_from_wmi and domain_from_wmi.upper() != "WORKGROUP":
                is_in_domain = True
                domain_name = domain_from_wmi
                break
    except Exception as e:
        print(f"Error checking domain with WMI: {e}")
        # Fallback a wmic por subprocess si wmi falla
        try:
            domain_info_output = subprocess.check_output("wmic computersystem get domain", shell=True, text=True, encoding='utf-8', errors='backslashreplace', timeout=5).strip()
            domain_lines = [line.strip() for line in domain_info_output.split('\n') if line.strip()]
            if len(domain_lines) > 1:
                domain_from_wmic_subp = domain_lines[1]
                if domain_from_wmic_subp and domain_from_wmic_subp.upper() != "WORKGROUP":
                    is_in_domain = True
                    domain_name = domain_from_wmic_subp
        except Exception as sub_wmic_err:
            print(f"Error checking domain with WMIC subprocess: {sub_wmic_err}")
    finally:
        pythoncom.CoUninitialize()
    
    return jsonify({"isInDomain": is_in_domain, "domainName": domain_name if is_in_domain else None})


@app.route("/api/password-info", methods=["GET", "OPTIONS"])
def get_password_info():
    if request.method == 'OPTIONS': return '', 200
    try:
        username = getpass.getuser()
        command_domain = f"net user \"{username}\" /domain"
        # Usar utf-8 y backslashreplace para mejor manejo de caracteres y depuración
        result_domain = subprocess.run(command_domain, shell=True, capture_output=True, text=True, encoding='utf-8', errors='backslashreplace', timeout=10)
        
        output = ""
        if result_domain.returncode == 0:
            output = result_domain.stdout
            print("[get_password_info] 'net user /domain' exitoso.")
        else:
            print(f"[get_password_info] 'net user /domain' falló (Code: {result_domain.returncode}, Err: {result_domain.stderr.strip()}). Intentando local.")
            command_local = f"net user \"{username}\""
            result_local = subprocess.run(command_local, shell=True, capture_output=True, text=True, encoding='utf-8', errors='backslashreplace', timeout=10)
            if result_local.returncode == 0:
                output = result_local.stdout
                print("[get_password_info] 'net user' (local) exitoso.")
            else:
                print(f"[get_password_info] 'net user' (local) también falló (Code: {result_local.returncode}, Err: {result_local.stderr.strip()}).")
                return jsonify({"success": False, "message": f"No se pudo obtener información para el usuario {username}. Domain error: {result_domain.stderr.strip()}. Local error: {result_local.stderr.strip()}"}), 400
        
        password_last_set = "No disponible"
        password_expires = "No disponible"
        user_may_change = "No disponible"
        
        # Patrones mejorados y más flexibles
        patterns = {
            "password_last_set": [r"(?i)(?:Password last set|Último cambio de contraseña|contraseña establecida por última vez|Última contraseña establecida)\s+:\s*(.+)", r"(?i)(?:Password last set|Último cambio de contraseña|contraseña establecida por última vez|Última contraseña establecida)\s+(.+?)"],
            "password_expires": [r"(?i)(?:Password expires|La contraseña caduca|La contraseña expira)\s+:\s*(.+)", r"(?i)(?:Password expires|La contraseña caduca|La contraseña expira)\s+(.+?)"],
            "user_may_change": [r"(?i)(?:User may change password|El usuario puede cambiar la contraseña)\s+:\s*(Yes|No|Sí|No)",r"(?i)(?:User may change password|El usuario puede cambiar la contraseña)\s+(Yes|No|Sí|No)"]
        }

        for key, regex_list in patterns.items():
            for regex in regex_list:
                match = re.search(regex, output)
                if match:
                    value = match.group(1).strip()
                    if key == "password_last_set": password_last_set = value.split(" ")[0] # Tomar solo la fecha
                    elif key == "password_expires": password_expires = value.split(" ")[0] if not ("never" in value.lower() or "nunca" in value.lower()) else "Nunca"
                    elif key == "user_may_change": user_may_change = "Sí" if value.lower() in ["yes", "sí"] else "No"
                    break 
        
        print(f"[get_password_info] Raw output for {username}:\n{output}")
        print(f"[get_password_info] Parsed - Last Set: {password_last_set}, Expires: {password_expires}, May Change: {user_may_change}")
        
        return jsonify({
            "success": True,
            "passwordLastSet": password_last_set,
            "passwordExpires": password_expires,
            "userMayChangePassword": user_may_change
        })
    except subprocess.TimeoutExpired:
        print("[get_password_info] Timeout ejecutando 'net user'.")
        return jsonify({"success": False, "message": "Timeout al obtener información de contraseña."}), 500
    except Exception as e:
        print(f"[get_password_info] Error: {e}")
        traceback.print_exc()
        return jsonify({"success": False, "message": f"Error: {str(e)}"}), 500

@app.route("/api/password-expiration", methods=["GET", "OPTIONS"])
def password_expiration():
    if request.method == 'OPTIONS': return '', 200
    try:
        current_user = getpass.getuser()
        domain_info_output = subprocess.check_output("wmic computersystem get domain", shell=True, text=True, encoding='utf-8', errors='backslashreplace', timeout=5).strip()
        domain_lines = [line.strip() for line in domain_info_output.split('\n') if line.strip()]
        machine_domain = domain_lines[1] if len(domain_lines) > 1 else "WORKGROUP"
        is_machine_in_domain = machine_domain.upper() != "WORKGROUP"
        
        if not is_machine_in_domain:
            print("[password_expiration] Máquina no en dominio, usando _get_local_password_expiration.")
            local_info = _get_local_password_expiration()
            return jsonify(local_info)
        
        print(f"[password_expiration] Máquina en dominio '{machine_domain}'. Intentando net user para {current_user}.")
        try:
            net_user_cmd = f"net user \"{current_user}\" /domain"
            # Usar utf-8 y backslashreplace
            result = subprocess.run(net_user_cmd, shell=True, capture_output=True, text=True, encoding='utf-8', errors='backslashreplace', timeout=10)
            
            if result.returncode == 0:
                output = result.stdout
                password_expires_line = None
                password_last_set_line = None
                max_password_age_days = None # Para calcular si no hay línea de expiración directa

                for line in output.split('\n'):
                    line_lower = line.lower()
                    if "password expires" in line_lower or "la contraseña caduca" in line_lower or "la contraseña expira" in line_lower:
                        password_expires_line = line
                    if "password last set" in line_lower or "último cambio de contraseña" in line_lower:
                        password_last_set_line = line
                
                # Intentar obtener la política de "Maximum password age" como fallback
                try:
                    policy_cmd = "net accounts /domain"
                    policy_result = subprocess.run(policy_cmd, shell=True, capture_output=True, text=True, encoding='utf-8', errors='backslashreplace', timeout=5)
                    if policy_result.returncode == 0:
                        policy_output = policy_result.stdout
                        max_age_match = re.search(r'(?:Maximum password age \(days\)|Vigencia máxima de la contraseña \(días\))\s*:\s*(\d+|Unlimited|Ilimitado)', policy_output, re.IGNORECASE)
                        if max_age_match:
                            age_val = max_age_match.group(1).strip()
                            if age_val.lower() not in ["unlimited", "ilimitado"] and age_val.isdigit():
                                max_password_age_days = int(age_val)
                                if max_password_age_days == 0: max_password_age_days = None # 0 a veces significa ilimitado
                except Exception as policy_err:
                    print(f"[password_expiration] Error obteniendo política de net accounts: {policy_err}")


                if password_expires_line:
                    parts = password_expires_line.split(':', 1)
                    if len(parts) > 1:
                        expiry_info_str = parts[1].strip()
                        if "never" in expiry_info_str.lower() or "nunca" in expiry_info_str.lower():
                            return jsonify({"expires": False, "message": "Tu contraseña no expira.", "method": "net_user_domain_never"})
                        
                        # Tomar solo la parte de la fecha
                        date_part_of_expiry_info = expiry_info_str.split(" ")[0]
                        import datetime # Mover import aquí
                        date_formats = ["%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%d"]
                        expiry_date_obj = None
                        for fmt in date_formats:
                            try:
                                expiry_date_obj = datetime.datetime.strptime(date_part_of_expiry_info, fmt).date()
                                break
                            except ValueError: continue
                        
                        if expiry_date_obj:
                            days_remaining = (expiry_date_obj - datetime.date.today()).days
                            message = ""
                            if days_remaining <= 0: message = "¡Tu contraseña ha expirado! Debes cambiarla inmediatamente."
                            elif days_remaining == 1: message = "¡Tu contraseña expira mañana!"
                            elif days_remaining <= 7: message = f"¡Tu contraseña expirará en {days_remaining} días!"
                            else: message = f"Tu contraseña expirará el {expiry_date_obj.strftime('%Y-%m-%d')} (en {days_remaining} días)."
                            return jsonify({"expires": True, "daysRemaining": days_remaining, "expiryDate": expiry_date_obj.strftime('%Y-%m-%d'), "message": message, "method": "net_user_domain_parsed_date"})
                        else:
                             print(f"[password_expiration] No se pudo parsear fecha de expiración directa: '{expiry_info_str}'")
                
                # Si no hay línea de expiración directa o no se pudo parsear, intentar calcular con PwdLastSet y MaxPasswordAge
                if password_last_set_line and max_password_age_days is not None and max_password_age_days > 0:
                    parts_last_set = password_last_set_line.split(':', 1)
                    if len(parts_last_set) > 1:
                        last_set_info_str = parts_last_set[1].strip()
                        date_part_of_last_set = last_set_info_str.split(" ")[0]
                        import datetime # Mover import aquí
                        date_formats = ["%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%d"]
                        last_set_date_obj = None
                        for fmt in date_formats:
                            try:
                                last_set_date_obj = datetime.datetime.strptime(date_part_of_last_set, fmt).date()
                                break
                            except ValueError: continue
                        
                        if last_set_date_obj:
                            calculated_expiry_date = last_set_date_obj + datetime.timedelta(days=max_password_age_days)
                            days_remaining = (calculated_expiry_date - datetime.date.today()).days
                            message = ""
                            if days_remaining <= 0: message = "¡Tu contraseña ha expirado (calculado)! Debes cambiarla."
                            elif days_remaining == 1: message = "¡Tu contraseña expira mañana (calculado)!"
                            elif days_remaining <= 7: message = f"¡Tu contraseña expirará en {days_remaining} días (calculado)!"
                            else: message = f"Tu contraseña expirará el {calculated_expiry_date.strftime('%Y-%m-%d')} (en {days_remaining} días, calculado)."
                            return jsonify({"expires": True, "daysRemaining": days_remaining, "expiryDate": calculated_expiry_date.strftime('%Y-%m-%d'), "message": message, "method": "net_user_domain_calculated_date"})
                        else:
                            print(f"[password_expiration] No se pudo parsear PwdLastSet: '{last_set_info_str}'")
                
                # Fallback a PowerShell si net user no dio info clara
                print("[password_expiration] 'net user /domain' no proporcionó información clara de expiración o no se pudo calcular. Intentando PowerShell.")
                return _get_password_expiration_via_powershell()
            else: # net user /domain falló
                print(f"[password_expiration] 'net user /domain' falló (Code: {result.returncode}, Err: {result.stderr.strip()}). Intentando PowerShell.")
                return _get_password_expiration_via_powershell()
        except subprocess.TimeoutExpired:
            print("[password_expiration] Timeout ejecutando 'net user /domain'. Intentando PowerShell.")
            return _get_password_expiration_via_powershell()
        except Exception as net_user_error:
            print(f"[password_expiration] Excepción con 'net user /domain': {net_user_error}. Intentando PowerShell.")
            traceback.print_exc()
            return _get_password_expiration_via_powershell()
            
    except Exception as e:
        print(f"[password_expiration] Error general: {e}")
        traceback.print_exc()
        return jsonify({"expires": None, "message": f"Error al obtener información de expiración: {str(e)}", "method": "general_exception"})

def _get_password_expiration_via_powershell():
    try:
        ps_cmd = r'''
        powershell -Command "
        try {
            $ErrorActionPreference = 'Stop'
            $outputObject = @{ expires = $null; daysRemaining = $null; expiryDate = $null; message = 'No se pudo determinar la expiración.'; method = 'PowerShell' }

            # Método 1: Usar Get-ADUser (requiere módulo AD)
            try {
                Import-Module ActiveDirectory -ErrorAction SilentlyContinue
                if (Get-Module -Name ActiveDirectory) {
                    $userAD = Get-ADUser -Identity $env:USERNAME -Properties PasswordLastSet, PasswordNeverExpires, PasswordExpired, msDS-UserPasswordExpiryTimeComputed -ErrorAction SilentlyContinue
                    if ($userAD) {
                        if ($userAD.PasswordNeverExpires) {
                            $outputObject.expires = $false
                            $outputObject.message = 'Tu contraseña no expira (AD).'
                            $outputObject.method = 'PowerShell_GetADUser_NeverExpires'
                            Write-Output ($outputObject | ConvertTo-Json -Compress)
                            exit
                        }
                        if ($userAD.PasswordExpired) {
                            $outputObject.expires = $true
                            $outputObject.daysRemaining = 0
                            $outputObject.message = '¡Tu contraseña ha expirado (AD)! Debes cambiarla.'
                            $outputObject.method = 'PowerShell_GetADUser_Expired'
                            Write-Output ($outputObject | ConvertTo-Json -Compress)
                            exit
                        }
                        if ($userAD.'msDS-UserPasswordExpiryTimeComputed') {
                            $expiryTime = [datetime]::FromFileTime($userAD.'msDS-UserPasswordExpiryTimeComputed')
                            if ($expiryTime.Year -gt 1601) { # Valid date
                                $outputObject.expires = $true
                                $outputObject.expiryDate = $expiryTime.ToString('yyyy-MM-dd')
                                $outputObject.daysRemaining = ($expiryTime - (Get-Date)).Days
                                if ($outputObject.daysRemaining -le 0) { $outputObject.message = '¡Tu contraseña ha expirado (AD-msDS)! Debes cambiarla.' }
                                elseif ($outputObject.daysRemaining -eq 1) { $outputObject.message = '¡Tu contraseña expira mañana (AD-msDS)!' }
                                elseif ($outputObject.daysRemaining -le 7) { $outputObject.message = ('¡Tu contraseña expirará en {0} días (AD-msDS)!' -f $outputObject.daysRemaining) }
                                else { $outputObject.message = ('Tu contraseña expirará el {0} (en {1} días, AD-msDS).' -f $outputObject.expiryDate, $outputObject.daysRemaining) }
                                $outputObject.method = 'PowerShell_GetADUser_msDS'
                                Write-Output ($outputObject | ConvertTo-Json -Compress)
                                exit
                            }
                        }
                    }
                }
            } catch { Write-Warning ('Error con Get-ADUser: ' + $_.Exception.Message) }

            # Método 2: System.DirectoryServices.AccountManagement
            try {
                Add-Type -AssemblyName System.DirectoryServices.AccountManagement
                $principalContext = New-Object System.DirectoryServices.AccountManagement.PrincipalContext([System.DirectoryServices.AccountManagement.ContextType]::Domain)
                $userPrincipal = [System.DirectoryServices.AccountManagement.UserPrincipal]::FindByIdentity($principalContext, $env:USERNAME)
                if ($userPrincipal) {
                    if ($userPrincipal.PasswordNeverExpires) {
                        $outputObject.expires = $false
                        $outputObject.message = 'Tu contraseña no expira (AccountManagement).'
                        $outputObject.method = 'PowerShell_AcctMgmt_NeverExpires'
                        Write-Output ($outputObject | ConvertTo-Json -Compress)
                        exit
                    }
                    if ($userPrincipal.LastPasswordSet) {
                        # Este método no da la fecha de expiración directamente, necesitaría política de dominio
                        # Pero podemos indicar si se requiere cambio al inicio
                        # $userPrincipal.PasswordExpired no existe, PasswordMustChange es más relevante
                        if ($userPrincipal.PasswordNotRequired -eq $false -and $userPrincipal.Enabled -eq $true -and $userPrincipal.LastPasswordSet -eq $null) {
                             # O si UserPrincipal.PasswordMustChange es true (no es un atributo directo, se infiere)
                        }
                    } else { # LastPasswordSet es null, usualmente significa que debe cambiarla
                         $outputObject.expires = $true
                         $outputObject.daysRemaining = 0
                         $outputObject.message = 'Debes cambiar tu contraseña en el próximo inicio de sesión (AccountManagement).'
                         $outputObject.method = 'PowerShell_AcctMgmt_ChangeRequired'
                         Write-Output ($outputObject | ConvertTo-Json -Compress)
                         exit
                    }
                }
            } catch { Write-Warning ('Error con AccountManagement: ' + $_.Exception.Message) }
            
            # Si llegamos aquí, no pudimos determinar nada concreto con los métodos preferidos
            $outputObject.message = 'No se pudo determinar la expiración de la contraseña con métodos PowerShell preferidos.'
            $outputObject.method = 'PowerShell_Fallback_Unknown'
            Write-Output ($outputObject | ConvertTo-Json -Compress)

        } catch {
            $outputObject.message = ('Error en script PowerShell: ' + $_.Exception.Message)
            $outputObject.method = 'PowerShell_GlobalError'
            Write-Output ($outputObject | ConvertTo-Json -Compress)
        }
        '''
        creation_flags = 0
        if platform.system() == "Windows":
            creation_flags = subprocess.CREATE_NO_WINDOW
        
        result = subprocess.run(ps_cmd, shell=True, capture_output=True, text=True, encoding='utf-8', errors='replace', creationflags=creation_flags, timeout=25)
        output = result.stdout.strip()
        
        if not output:
            stderr_output = result.stderr.strip()
            print(f"[_get_password_expiration_via_powershell] PowerShell no produjo salida. Stderr: {stderr_output}")
            return jsonify({"expires": None, "message": f"Error de script PowerShell: {stderr_output if stderr_output else 'Sin salida.'}", "method": "PowerShell_NoOutput"})

        try:
            ps_json_data = json.loads(output)
            return jsonify(ps_json_data)
        except json.JSONDecodeError:
            print(f"[_get_password_expiration_via_powershell] Error decodificando JSON de PowerShell: {output}")
            return jsonify({"expires": None, "message": f"Respuesta inesperada de PowerShell: {output}", "method": "PowerShell_InvalidJSON"})

    except subprocess.TimeoutExpired:
        print("[_get_password_expiration_via_powershell] Timeout.")
        return jsonify({"expires": None, "message": "Timeout ejecutando script de PowerShell.", "method": "PowerShell-Timeout"})
    except Exception as e:
        print(f"[_get_password_expiration_via_powershell] Excepción: {e}")
        traceback.print_exc()
        return jsonify({"expires": None, "message": "No se pudo determinar la expiración (excepción en Python).", "method": "PowerShell_PythonException"})

@app.route('/api/force-password-change', methods=['POST', 'OPTIONS'])
def force_password_change():
    if request.method == 'OPTIONS': return '', 200
    try:
        username = getpass.getuser()
        domain_info_output = subprocess.check_output("wmic computersystem get domain", shell=True, text=True, encoding='utf-8', errors='backslashreplace', timeout=5).strip()
        domain_lines = [line.strip() for line in domain_info_output.split('\n') if line.strip()]
        machine_domain = domain_lines[1] if len(domain_lines) > 1 else "WORKGROUP"
        is_machine_in_domain = machine_domain.upper() != "WORKGROUP"
        
        creation_flags = 0
        if platform.system() == "Windows":
            creation_flags = subprocess.CREATE_NO_WINDOW

        if is_machine_in_domain:
            cmd = 'powershell -Command "(New-Object -ComObject Shell.Application).Windows().item() | ForEach-Object { if ($_.hwnd -eq (Get-Process -Id $pid).MainWindowHandle) { $_.Quit() } }; Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\"^(%{DELETE})\")"'
            # Intento alternativo si el anterior no funciona bien o para forzar bloqueo:
            # cmd = 'powershell -Command "Add-Type -TypeDefinition \'public class P{ [System.Runtime.InteropServices.DllImport(\\\"user32.dll\\\")] public static extern void LockWorkStation(); }\'; [P]::LockWorkStation()"'
            subprocess.Popen(cmd, shell=True, creationflags=creation_flags)
            return jsonify({"success": True, "message": "Se ha enviado la señal para cambiar contraseña (Ctrl+Alt+Supr). Si no aparece el diálogo, bloquea tu sesión (Windows+L) y desbloquéala para ver la opción 'Cambiar una contraseña'.", "isOrganizationRequest": True})
        else: # Local
            subprocess.Popen('control userpasswords2', shell=True, creationflags=creation_flags)
            return jsonify({"success": True, "message": "Se ha abierto el panel de control de cuentas de usuario para cambiar tu contraseña local.", "isOrganizationRequest": True })
            
    except Exception as e:
        print(f"[force_password_change] Error: {str(e)}")
        traceback.print_exc()
        return jsonify({"success": False, "message": f"Error al iniciar el proceso de cambio de contraseña: {str(e)}"}), 500

@app.route("/api/user-info", methods=["GET", "OPTIONS"])
def user_info():
    if request.method == 'OPTIONS': return '', 200
    try:
        username = getpass.getuser()
        domain_info_output = subprocess.check_output("wmic computersystem get domain", shell=True, text=True, encoding='utf-8', errors='backslashreplace', timeout=5).strip()
        domain_lines = [line.strip() for line in domain_info_output.split('\n') if line.strip()]
        domain = domain_lines[1] if len(domain_lines) > 1 else "WORKGROUP"
        is_domain_user = domain.upper() != "WORKGROUP"
        
        full_name = ""
        try:
            # Usar utf-8 y backslashreplace
            name_info_output = subprocess.check_output(f"wmic useraccount where name='{username}' get fullname", shell=True, text=True, encoding='utf-8', errors='backslashreplace', timeout=5).strip()
            name_lines = [line.strip() for line in name_info_output.split('\n') if line.strip()]
            if len(name_lines) > 1 and name_lines[1]: # Asegurar que la línea no esté vacía
                full_name = name_lines[1]
            else: # Fallback si wmic no da el nombre completo
                full_name = username 
        except Exception as wmic_fullname_err:
            print(f"[user_info] Error obteniendo fullname con wmic: {wmic_fullname_err}. Usando username como fullname.")
            full_name = username
        
        return jsonify({
            "username": username,
            "fullName": full_name,
            "isDomainUser": is_domain_user,
            "domain": domain if is_domain_user else None # Devolver null si no está en dominio
        })
    except Exception as e:
        print(f"[user_info] Error general: {e}")
        traceback.print_exc()
        return jsonify({"username": getpass.getuser(), "fullName": getpass.getuser(), "isDomainUser": False, "domain": None, "error": str(e)}), 500
    
def change_password(username, old_password, new_password):
    try:
        is_domain_user = False
        domain = None
        if '\\' in username:
            domain, username_part = username.split('\\', 1) # Usar username_part para no sobreescribir el param
            is_domain_user = True
        else:
            username_part = username # Es solo el nombre de usuario
            try:
                domain_info_output = subprocess.check_output("wmic computersystem get domain", shell=True, text=True, encoding='utf-8', errors='backslashreplace', timeout=5).strip()
                domain_lines = [line.strip() for line in domain_info_output.split('\n') if line.strip()]
                current_machine_domain = domain_lines[1] if len(domain_lines) > 1 else "WORKGROUP"
                if current_machine_domain.upper() != "WORKGROUP":
                    is_domain_user = True
                    domain = current_machine_domain # Asignar el dominio de la máquina
            except Exception as e_dom: print(f"[change_password] Error verificando dominio: {e_dom}")
        
        is_admin = ctypes.windll.shell32.IsUserAnAdmin() != 0
        if not is_admin: return {"success": False, "message": "Esta operación requiere privilegios de administrador"}
        
        validation_success = False
        creation_flags = 0
        if platform.system() == "Windows": creation_flags = subprocess.CREATE_NO_WINDOW

        # Para validar, siempre usar el contexto del usuario que ejecuta el script (getpass.getuser())
        # ya que runas o Invoke-Command con otras credenciales es para ejecución, no validación simple.
        # La validación real de 'old_password' se hará implícitamente por 'net user' o 'Set-ADAccountPassword'
        
        if is_domain_user and domain:
            # Para usuarios de dominio, Set-ADAccountPassword valida la contraseña antigua
            ps_cmd_change = f'powershell -Command "Add-Type -AssemblyName System.DirectoryServices.AccountManagement; try {{ $ctx = New-Object System.DirectoryServices.AccountManagement.PrincipalContext([System.DirectoryServices.AccountManagement.ContextType]::Domain, \'{domain}\'); $usr = [System.DirectoryServices.AccountManagement.UserPrincipal]::FindByIdentity($ctx, \'{username_part}\'); $usr.ChangePassword(\'{old_password}\', \'{new_password}\'); Write-Output \'Success\' }} catch {{ Write-Output $_.Exception.Message }}"'
            ps_result = subprocess.run(ps_cmd_change, shell=True, capture_output=True, text=True, encoding='utf-8', errors='replace', creationflags=creation_flags, timeout=20)
            if "Success" in ps_result.stdout:
                return {"success": True, "message": "Contraseña de dominio cambiada con éxito."}
            else:
                error_msg = ps_result.stdout.strip() or ps_result.stderr.strip() or "Error desconocido al cambiar contraseña de dominio."
                # Intentar con Set-ADAccountPassword si el anterior falló (requiere módulo AD y permisos)
                ps_cmd_setad = f'powershell -Command "$ErrorActionPreference = \"Stop\"; try {{ Import-Module ActiveDirectory; Set-ADAccountPassword -Identity \'{username_part}\' -OldPassword (ConvertTo-SecureString \'{old_password}\' -AsPlainText -Force) -NewPassword (ConvertTo-SecureString \'{new_password}\' -AsPlainText -Force); Write-Output \"Success\" }} catch {{ Write-Output $_.Exception.Message }}"'
                ps_result_setad = subprocess.run(ps_cmd_setad, shell=True, capture_output=True, text=True, encoding='utf-8', errors='replace', creationflags=creation_flags, timeout=20)
                if "Success" in ps_result_setad.stdout:
                    return {"success": True, "message": "Contraseña de dominio cambiada con éxito (Set-ADAccountPassword)."}
                else:
                    error_msg_setad = ps_result_setad.stdout.strip() or ps_result_setad.stderr.strip() or "Error desconocido con Set-ADAccountPassword."
                    print(f"[change_password] Fallo AccountManagement: {error_msg}. Fallo Set-ADAccountPassword: {error_msg_setad}")
                    return {"success": False, "message": f"Error al cambiar contraseña de dominio. Intento 1: {error_msg}. Intento 2: {error_msg_setad}"}
        else: # Usuario local
            cmd_local_change = f"net user \"{username_part}\" \"{new_password}\""
            # Para net user, la validación de la contraseña antigua no se hace directamente en este comando si se ejecuta como admin.
            # Se asume que si el admin lo ejecuta, tiene permiso.
            # Si se requiere validación de la contraseña antigua para local, se necesitaría un enfoque diferente (ej. LogonUser API).
            # Por ahora, se simplifica a que el admin puede cambiarla.
            result_local_change = subprocess.run(cmd_local_change, shell=True, capture_output=True, text=True, encoding='utf-8', errors='backslashreplace', timeout=10)
            if result_local_change.returncode == 0:
                return {"success": True, "message": "Contraseña local cambiada con éxito."}
            else:
                error_msg = result_local_change.stderr.strip() or result_local_change.stdout.strip() or "Error desconocido al cambiar contraseña local."
                return {"success": False, "message": f"Error al cambiar contraseña local: {error_msg}"}

    except Exception as e:
        print(f"[change_password] Error general: {e}")
        traceback.print_exc()
        return {"success": False, "message": f"Error inesperado: {str(e)}"}

@app.route('/api/open-windows-settings', methods=['POST', 'OPTIONS'])
def open_windows_settings():
    if request.method == 'OPTIONS':
        return '', 200
        
    try:
        # Obtener el tipo de configuración a abrir
        data = request.json
        setting = data.get('setting', 'accounts')
        
        # Mapeo de configuraciones a URI de ms-settings
        settings_map = {
            'accounts': 'ms-settings:yourinfo',
            'password': 'ms-settings:signinoptions',
            'email': 'ms-settings:emailandaccounts',
            'sync': 'ms-settings:sync',
            'signin': 'ms-settings:signinoptions',
            'privacy': 'ms-settings:privacy',
            'network': 'ms-settings:network',
            'bluetooth': 'ms-settings:bluetooth'
        }
        
        # Obtener la URI correspondiente o usar una por defecto
        setting_uri = settings_map.get(setting, 'ms-settings:yourinfo')
        
        # Ejecutar el comando para abrir la configuración
        subprocess.Popen(f'start {setting_uri}', shell=True)
        
        return jsonify({
            "success": True, 
            "message": f"Configuración de Windows abierta: {setting}"
        })
            
    except Exception as e:
        print(f"Error al abrir configuración de Windows: {str(e)}")
        return jsonify({"success": False, "message": str(e)}), 500

@app.route("/api/system-info") # Eliminar la duplicada, solo una definición
def system_info():
    sys_details = get_system_details() # get_system_details ya usa wmic subprocess
    temps = get_system_temperatures()
    interfaces = get_network_interfaces()
    hostname = get_hostname()
    cpu_percent = psutil.cpu_percent(interval=0.5) # Intervalo más corto
    memory = psutil.virtual_memory()
    disk = get_disk_usage()
    
    user = getpass.getuser()
    # Reutilizar la lógica de get_system_details para el dominio si es posible, o wmic directo
    machine_domain_from_details = sys_details.get("domain", "WORKGROUP")
    is_machine_in_domain = machine_domain_from_details.upper() != "WORKGROUP" and machine_domain_from_details != "No está en un dominio"
    
    dominio_final = machine_domain_from_details if is_machine_in_domain else "LOCAL"
    
    ip_publica = get_public_ip() or "No disponible"
    
    # Obtener umbrales desde variables de entorno
    cpu_threshold = float(os.getenv('CRITICAL_CPU_THRESHOLD', 90))
    temp_threshold = float(os.getenv('CRITICAL_TEMP_THRESHOLD', 90))
    memory_threshold = float(os.getenv('CRITICAL_MEMORY_THRESHOLD', 90))
    
    critical_conditions = []
    if cpu_percent >= cpu_threshold:
        critical_conditions.append(f"CPU al {cpu_percent}% (umbral: {cpu_threshold}%)")
    
    cpu_temp = temps.get('cpu', None)
    if cpu_temp is not None and cpu_temp >= temp_threshold:
        critical_conditions.append(f"Temperatura CPU: {cpu_temp}°C (umbral: {temp_threshold}%)")
    
    if memory.percent >= memory_threshold:
        critical_conditions.append(f"Memoria RAM al {memory.percent}% (umbral: {memory_threshold}%)")
    
    saved_to_db = False
    if critical_conditions:
        print(f"[system_info] Condiciones críticas detectadas: {critical_conditions}. Intentando guardar...")
        saved_to_db = save_system_info( # save_system_info ya obtiene serial, mac, etc.
            hostname=hostname,
            cpu_percent=cpu_percent,
            memory_percent=memory.percent,
            disk_percent=disk.get("percent", 0), # Usar .get con default
            temperatures=temps
        )
        print(f"[system_info] Resultado de save_system_info: {saved_to_db}")


    return jsonify({
        "user": user,
        "IpPublica": ip_publica,
        "hostname": hostname,
        "cpu_percent": cpu_percent,
        "memory": memory._asdict(),
        "cpu_speed": get_cpu_speed(),
        "temperatures": temps,
        # "gpu_temp": get_gpu_temp(), # temps ya puede incluir gpu
        "ip_local": get_local_ip(),
        # "ip_public": ip_publica, # Ya está como IpPublica
        "disk_usage": disk,
        "serial_number": get_serial_number(),
        "network_interfaces": interfaces,
        "critical_conditions": critical_conditions,
        "saved_to_database": saved_to_db, # No necesita `and len(critical_conditions) > 0`
        "thresholds": {
            "cpu": cpu_threshold,
            "temperature": temp_threshold,
            "memory": memory_threshold
        },
        "domain": dominio_final, # Añadido para consistencia
        **sys_details # sys_details ya contiene manufacturer, model, os, y su propia version de domain
    })
    
def _get_user_details_via_powershell(username_to_check, machine_domain_name_hint):
    """
    Intenta obtener detalles del usuario usando PowerShell y System.DirectoryServices.AccountManagement.
    """
    print(f"[_get_user_details_via_powershell] Intentando para usuario: {username_to_check} en dominio (hint): {machine_domain_name_hint}")
    
    context_block = ""
    ps_machine_domain_hint_for_script = "''" 
    if machine_domain_name_hint and machine_domain_name_hint.upper() != "WORKGROUP":
        context_block = f"$principalContext = New-Object System.DirectoryServices.AccountManagement.PrincipalContext([System.DirectoryServices.AccountManagement.ContextType]::Domain, '{machine_domain_name_hint}')"
        ps_machine_domain_hint_for_script = f"'{machine_domain_name_hint}'"
    else:
        context_block = "$principalContext = New-Object System.DirectoryServices.AccountManagement.PrincipalContext([System.DirectoryServices.AccountManagement.ContextType]::Machine)"

    # Script de PowerShell robusto (como se discutió, con try-catch interno)
    ps_script_body = f"""
    Add-Type -AssemblyName System.DirectoryServices.AccountManagement
    $MachineDomainHintFromPy = {ps_machine_domain_hint_for_script}
    {context_block}
    
    $userPrincipal = $null
    try {{
        $userPrincipal = [System.DirectoryServices.AccountManagement.UserPrincipal]::FindByIdentity($principalContext, $UsernameToQuery)
    }} catch {{
        Write-Warning "Error en FindByIdentity: $($_.Exception.Message)"
    }}

    if ($userPrincipal) {{
        $effectiveDomainName = $null
        $isDomainUser = $false
        $pwdLastSetVal = $null
        $detailsOutput = $null # Para el JSON de salida

        try {{ # Inicio del try-catch granular
            if ($userPrincipal.Context) {{
                $effectiveDomainName = $userPrincipal.Context.Name
                if ($userPrincipal.Context.ContextType -eq [System.DirectoryServices.AccountManagement.ContextType]::Domain) {{
                    $isDomainUser = $true
                }} elseif ($userPrincipal.Context.ContextType -eq [System.DirectoryServices.AccountManagement.ContextType]::Machine) {{
                    $isDomainUser = $false
                    $effectiveDomainName = $env:COMPUTERNAME # Usar nombre de máquina para local
                }}
            }}

            if ($isDomainUser -and (-not $effectiveDomainName)) {{
                if ($MachineDomainHintFromPy -and $MachineDomainHintFromPy -ne "''") {{
                    $effectiveDomainName = $MachineDomainHintFromPy
                }} else {{
                    try {{
                        $wmiDomain = (Get-WmiObject Win32_ComputerSystem -ErrorAction SilentlyContinue).Domain
                        if ($wmiDomain -and $wmiDomain.ToUpper() -ne "WORKGROUP") {{ $effectiveDomainName = $wmiDomain }}
                    }} catch {{ Write-Warning "No se pudo obtener el dominio de WMI como fallback." }}
                }}
            }}
            
            if ($userPrincipal.LastPasswordSet) {{
                $pwdLastSetVal = $userPrincipal.LastPasswordSet.Value.ToString("yyyy-MM-dd HH:mm:ss")
            }}

            $detailsOutput = @{{
                success                 = $true;
                method                  = "PowerShell-AccountManagement";
                username                = $userPrincipal.SamAccountName;
                fullName                = $userPrincipal.DisplayName;
                isDomain                = $isDomainUser;
                domain                  = $effectiveDomainName;
                accountEnabled          = $userPrincipal.Enabled;
                passwordLastSet         = $pwdLastSetVal;
                passwordNeverExpires    = $userPrincipal.PasswordNeverExpires;
                userCannotChangePassword= $userPrincipal.UserCannotChangePassword;
                userPrincipalName       = $userPrincipal.UserPrincipalName;
                distinguishedName       = $userPrincipal.DistinguishedName
            }}
            Write-Output (ConvertTo-Json -InputObject $detailsOutput -Depth 5 -Compress) # Aumentado Depth

        }} catch {{ # Catch para el try-catch granular
            $innerExceptionMessage = "Error procesando detalles de userPrincipal."
            $innerExceptionDetails = ""
            if ($_) {{ if ($_.Exception) {{ $innerExceptionMessage = $_.Exception.Message; $innerExceptionDetails = $_.Exception.ToString() }} }}
            Write-Output (ConvertTo-Json -InputObject @{{success=$false; method="PowerShell-AccountManagement-ProcessingError"; message=$innerExceptionMessage; details=$innerExceptionDetails}} -Compress)
        }}
    }} else {{
        Write-Output (ConvertTo-Json -InputObject @{{success=$false; method="PowerShell-AccountManagement"; message="Usuario '$UsernameToQuery' no encontrado con AccountManagement (o error en FindByIdentity)."}} -Compress)
    }}
    """
    
    ps_script_full = f"""
    param ([string]$UsernameToQuery)
    try {{ {ps_script_body} }}
    catch {{
        $exceptionMessage = "Error desconocido en script PowerShell."
        if ($_) {{ if ($_.Exception) {{ $exceptionMessage = $_.Exception.Message }} }}
        $exceptionType = "Desconocido"
        if ($_) {{ if ($_.Exception) {{ if ($_.Exception.GetType()) {{ $exceptionType = $_.Exception.GetType().FullName }} }} }}
        $stackTraceInfo = "No stack trace disponible"
        if ($_) {{ if ($_.Exception) {{ if ($_.Exception.StackTrace) {{ $stackTraceInfo = $_.Exception.StackTrace.ToString() }} }} }}
        $errorDetails = @{{ success=$false; method="PowerShell-AccountManagement-GlobalCatch"; message=$exceptionMessage; exceptionType=$exceptionType; stackTrace=$stackTraceInfo }}
        Write-Output (ConvertTo-Json -InputObject $errorDetails -Compress)
    }}
    """

    temp_ps_file = None
    try:
        # Usar tempfile.NamedTemporaryFile para asegurar que se elimina
        with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".ps1", encoding="utf-8") as tmpfile:
            tmpfile.write(ps_script_full)
            temp_ps_file = tmpfile.name
        
        ps_command_list = ["powershell", "-NonInteractive", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", temp_ps_file, "-UsernameToQuery", username_to_check]
        print(f"[_get_user_details_via_powershell] Ejecutando: {' '.join(ps_command_list)}")

        creation_flags = 0
        if platform.system() == "Windows": creation_flags = subprocess.CREATE_NO_WINDOW

        result = subprocess.run(ps_command_list, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=20, creationflags=creation_flags)
        
        print(f"[_get_user_details_via_powershell] PS STDOUT: {result.stdout.strip()}")
        if result.stderr: print(f"[_get_user_details_via_powershell] PS STDERR: {result.stderr.strip()}")

        if result.stdout:
            try:
                ps_output_json = json.loads(result.stdout.strip())
                # Devolver directamente el JSON parseado, ya que el script de PS ahora incluye 'success'
                return ps_output_json # El script ya debería tener la estructura {"success": true/false, "data": {...}} o error
            except json.JSONDecodeError as je:
                print(f"[_get_user_details_via_powershell] Error decodificando JSON de PS: {je}. Salida: {result.stdout.strip()}")
                return {"success": False, "error": f"Error parseando salida de PowerShell: {result.stdout.strip()}", "method": "PowerShell-JSONDecodeError"}
        else:
            error_output = result.stderr.strip() if result.stderr else "Script de PowerShell no produjo salida STDOUT."
            print(f"[_get_user_details_via_powershell] Sin STDOUT. Código: {result.returncode}. Error: {error_output}")
            return {"success": False, "error": f"Fallo de ejecución de PowerShell: {error_output}", "method": "PowerShell-NoSTDOUT"}

    except subprocess.TimeoutExpired:
        print("[_get_user_details_via_powershell] Timeout.")
        return {"success": False, "error": "Timeout ejecutando script de PowerShell", "method": "PowerShell-Timeout"}
    except Exception as e:
        print(f"[_get_user_details_via_powershell] Excepción: {e}")
        traceback.print_exc()
        return {"success": False, "error": f"Excepción en Python/PowerShell: {str(e)}", "method": "PowerShell-PythonException"}
    finally:
        if temp_ps_file and os.path.exists(temp_ps_file):
            try: os.remove(temp_ps_file)
            except Exception as e_rm: print(f"[_get_user_details_via_powershell] Error eliminando tmp {temp_ps_file}: {e_rm}")

@app.route("/api/user-details", methods=["GET", "OPTIONS"])
def get_user_details():
    if request.method == 'OPTIONS': return '', 200
    try:
        username = getpass.getuser()
        print(f"[get_user_details] Usuario: {username}")
        
        machine_domain = "WORKGROUP"
        is_machine_in_domain = False
        try:
            # Usar la ruta /api/check-domain internamente es una opción, o replicar su lógica mejorada
            pythoncom.CoInitialize()
            try:
                c = wmi.WMI()
                for system in c.Win32_ComputerSystem():
                    domain_from_wmi = system.Domain
                    if domain_from_wmi and domain_from_wmi.upper() != "WORKGROUP":
                        is_machine_in_domain = True
                        machine_domain = domain_from_wmi
                        break
            finally:
                pythoncom.CoUninitialize()
            if not is_machine_in_domain and machine_domain == "WORKGROUP": # Si WMI falló o dio WORKGROUP, intentar wmic subprocess
                domain_info_output = subprocess.check_output("wmic computersystem get domain", shell=True, text=True, encoding='utf-8', errors='backslashreplace', timeout=5).strip()
                domain_lines = [line.strip() for line in domain_info_output.split('\n') if line.strip()]
                if len(domain_lines) > 1:
                    domain_from_wmic_subp = domain_lines[1]
                    if domain_from_wmic_subp and domain_from_wmic_subp.upper() != "WORKGROUP":
                        is_machine_in_domain = True
                        machine_domain = domain_from_wmic_subp
        except Exception as domain_check_err:
            print(f"[get_user_details] Error obteniendo dominio de la máquina: {domain_check_err}")
        
        print(f"[get_user_details] Máquina en dominio '{machine_domain}', is_machine_in_domain: {is_machine_in_domain}")

        user_details_final = None # Cambiado a None para una verificación más clara
        domain_attempts_log = []

        if is_machine_in_domain:
            print(f"[get_user_details] Intentando 'net user \"{username}\" /domain'")
            try:
                cmd_domain = f"net user \"{username}\" /domain"
                # Usar utf-8 y backslashreplace para mejor manejo de caracteres y depuración
                result_domain = subprocess.run(cmd_domain, shell=True, capture_output=True, text=True, encoding='utf-8', errors='backslashreplace', timeout=10)
                
                if result_domain.returncode == 0:
                    output_domain = result_domain.stdout
                    parsed_data = {"isDomain": True, "domain": machine_domain, "username": username, "method": "net user /domain"}
                    
                    # Patrones de parseo (ajustar según sea necesario)
                    patterns = {
                        "fullName": [r"(?im)^\s*Full Name\s+(.+)$", r"(?im)^\s*Nombre completo\s+(.+)$"],
                        "accountActive": [r"(?im)^\s*Account active\s+(Yes|No)$", r"(?im)^\s*Cuenta activa\s+(Sí|No)$"],
                        # Añadir más patrones si es necesario
                    }
                    for key, regex_list in patterns.items():
                        for regex in regex_list:
                            match = re.search(regex, output_domain)
                            if match:
                                value = match.group(1).strip()
                                if key == "accountActive": value = value.lower() in ["yes", "sí"]
                                parsed_data[key] = value
                                break
                    
                    if parsed_data.get("fullName"): # Considerar éxito si se obtiene el nombre completo
                        user_details_final = parsed_data
                        domain_attempts_log.append("net user /domain: Success.")
                    else:
                        log_msg = "net user /domain: OK, but no key data parsed (e.g., fullName)."
                        print(f"[get_user_details] {log_msg}")
                        print(f"[get_user_details] Salida de 'net user /domain' que no se pudo parsear:\n{output_domain}")
                        domain_attempts_log.append(log_msg + f" Output sample: {output_domain[:200]}")
                else:
                    err_msg = result_domain.stderr.strip() if result_domain.stderr else f"Exit code {result_domain.returncode}"
                    domain_attempts_log.append(f"net user /domain: Failed - {err_msg}")
            
            except subprocess.TimeoutExpired: domain_attempts_log.append("net user /domain: Timeout.")
            except Exception as e_domain: domain_attempts_log.append(f"net user /domain: Exception - {str(e_domain)}")

            if not user_details_final: # Si net user /domain falló o no parseó
                print(f"[get_user_details] 'net user /domain' no obtuvo datos, intentando PowerShell.")
                ps_result = _get_user_details_via_powershell(username, machine_domain)
                if ps_result and ps_result.get("success"): # ps_result ahora es el JSON directo
                    user_details_final = ps_result # El script de PS ya incluye 'method', 'isDomain', etc.
                    # ps_result ya tiene la estructura correcta, incluyendo 'success' y los datos del usuario
                    # Si el script de PS devuelve success=true, sus datos son los detalles del usuario.
                    # user_details_final["method"] = ps_result.get("method", "PowerShell-Unknown") # Ya debería estar en ps_result
                    domain_attempts_log.append(f"PowerShell: Success ({ps_result.get('method', '')}).")
                else:
                    err_msg_ps = ps_result.get('message', 'Error desconocido de PowerShell') if ps_result else 'PowerShell no devolvió resultado'
                    domain_attempts_log.append(f"PowerShell: Failed - {err_msg_ps}")
        
        if not user_details_final: # Si sigue sin datos (no es de dominio, o los intentos de dominio fallaron)
            local_attempt_log = ""
            print(f"[get_user_details] Intentando 'net user \"{username}\"' (local)")
            try:
                cmd_local = f"net user \"{username}\""
                result_local = subprocess.run(cmd_local, shell=True, capture_output=True, text=True, encoding='utf-8', errors='backslashreplace', timeout=10)
                if result_local.returncode == 0:
                    output_local = result_local.stdout
                    parsed_local_data = {"isDomain": False, "domain": "Local", "username": username, "method": "net user (local)"}
                    # Modificar patterns_local para hacer el colon opcional (:?)
                    patterns_local = {
                        "fullName": [r"(?im)^\s*Full Name\s*:?\s*(.+)$", r"(?im)^\s*Nombre completo\s*:?\s*(.+)$"],
                        "accountActive": [r"(?im)^\s*Account active\s*:?\s*(Yes|No)$", r"(?im)^\s*Cuenta activa\s*:?\s*(Sí|No)$"],
                    }
                    for key, regex_list in patterns_local.items():
                        for regex in regex_list:
                            match = re.search(regex, output_local)
                            if match:
                                value = match.group(1).strip()
                                if key == "accountActive": value = value.lower() in ["yes", "sí"]
                                parsed_local_data[key] = value
                                break 
                    if parsed_local_data.get("fullName"):
                        user_details_final = parsed_local_data
                        local_attempt_log = "net user (local): Success."
                    else:
                        local_attempt_log = "net user (local): OK, but no key data parsed (e.g., fullName)."
                        print(f"[get_user_details] {local_attempt_log}")
                        # ESTA LÍNEA ES CRUCIAL:
                        print(f"[get_user_details] Salida de 'net user' (local) que no se pudo parsear:\n{output_local}")
                else:
                    local_attempt_log = f"net user (local): Failed - {result_local.stderr.strip() if result_local.stderr else f'Exit code {result_local.returncode}'}"
            except subprocess.TimeoutExpired: local_attempt_log = "net user (local): Timeout."
            except Exception as e_local: local_attempt_log = f"net user (local): Exception - {str(e_local)}"
            
            if local_attempt_log: domain_attempts_log.append(local_attempt_log) # Añadir log del intento local

        if user_details_final and user_details_final.get("success") is False: # Si PowerShell falló y asignó su error a user_details_final
            # Esto puede pasar si ps_result es {"success": False, ...} y se asigna directamente
           

            error_message = user_details_final.get("message", "Fallo en el método de obtención de detalles.")
            print(f"[get_user_details] Método final falló explícitamente: {error_message}")
            return jsonify({"success": False, "message": error_message, "error_details": {"log": "; ".join(domain_attempts_log)}}), 400

        if user_details_final and user_details_final.get("success") is True: # Si PowerShell tuvo éxito
             # El campo 'method' y otros ya están en user_details_final desde el script de PS
             # Asegurar que 'isDomain' y 'domain' estén correctamente poblados por el script de PS
            print(f"[get_user_details] Devolviendo user_details_final (desde PS exitoso): {user_details_final}")
            return jsonify({"success": True, "userDetails": user_details_final })


        if user_details_final: # Si net user (domain o local) tuvo éxito
            print(f"[get_user_details] Devolviendo user_details_final: {user_details_final}")
            return jsonify({"success": True, "userDetails": user_details_final})
        else: # Todos los métodos fallaron
            error_message = f"No se pudo obtener información del usuario '{username}' después de todos los intentos."
            print(f"[get_user_details] {error_message} Logs: {'; '.join(domain_attempts_log)}")
            return jsonify({"success": False, "message": error_message, "error_details": {"log": "; ".join(domain_attempts_log)}}), 400
        
    except Exception as e:
        print(f"[get_user_details] Error general: {e}")
        traceback.print_exc()
        return jsonify({"success": False, "message": "Error general al obtener detalles del usuario.", "error_details": {"exception": str(e)}}), 500

@app.route('/api/open-password-dialog', methods=['POST', 'OPTIONS'])
def open_password_dialog():
    if request.method == 'OPTIONS': return '', 200
        
    try:
        # Determinar si estamos en un dominio
        domain_info = subprocess.check_output("wmic computersystem get domain", shell=True, text=True, encoding='utf-8', errors='backslashreplace', timeout=5).strip()
        domain_lines = [line.strip() for line in domain_info.split('\n') if line.strip()]
        domain = domain_lines[1] if len(domain_lines) > 1 else ""
        is_domain = domain.upper() != "WORKGROUP"
        
        if is_domain:
            # Para equipos en dominio, intentar abrir CTRL+ALT+DEL mediante bloqueo de pantalla
            ctypes.windll.user32.LockWorkStation()
            return jsonify({"success": True, "message": "Se ha bloqueado la pantalla. Presione Ctrl+Alt+Supr y seleccione 'Cambiar una contraseña'"})
        else:
            # Para equipos no en dominio, abrir el panel de control de cuentas de usuario
            subprocess.Popen('control userpasswords2', shell=True)
            return jsonify({"success": True, "message": "Panel de control de contraseñas abierto"})
            
    except Exception as e:
        print(f"Error al abrir panel de contraseñas: {str(e)}")
        return jsonify({"success": False, "message": str(e)}), 500
    
@app.route('/shutdown', methods=['POST'])
def shutdown_route():
    """
    Shuts down the Flask application.
    This endpoint should be called by the main application when it's closing.
    """
    # For security, you might want to restrict this endpoint, e.g., to localhost requests
    # if request.remote_addr != '127.0.0.1':
    #     return jsonify(message="Forbidden: Access denied."), 403

    shutdown_function = request.environ.get('werkzeug.server.shutdown')
    if shutdown_function is None:
        print('Not running with the Werkzeug Server or shutdown function not available.')
        # As a fallback, especially if not using Werkzeug or if it fails,
        # schedule a forced exit. This is a more abrupt shutdown.
        # A small delay can help ensure the HTTP response is sent.
        print('Attempting to force exit the application.')
        threading.Timer(0.5, lambda: os._exit(0)).start()
        return jsonify(message="Server is attempting a forced shutdown."), 200
    else:
        print('Server is shutting down via Werkzeug.')
        shutdown_function()
        return jsonify(message="Server is shutting down."), 200

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
    
@app.errorhandler(Exception)
def handle_exception(e):
    """Manejador global de excepciones."""
    print(f"Error no manejado: {e}")
    return jsonify({
        "success": False,
        "message": "Error interno del servidor"
    }), 500

def init_database():
    connection = None
    try:
        print("[DB Init] Iniciando conexión a la base de datos...")
        connection = get_connection()
        if not connection:
            print("[DB Init]  No se pudo establecer conexión a la base de datos. La inicialización de la BD se omite.")
            return False
            
        print("[DB Init]  Conexión a la base de datos establecida correctamente.")
        with connection.cursor() as cursor:
            print("[DB Init] ⏳ Verificando/Actualizando el procedimiento almacenado 'Sp_CreaIncidente'...")
            db_name = os.getenv('DB_NAME', 'prueba')
            cursor.execute(f"SELECT ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_TYPE = 'PROCEDURE' AND ROUTINE_NAME = 'Sp_CreaIncidente' AND ROUTINE_SCHEMA = '{db_name}'")
            result = cursor.fetchone()
            if result:
                print("[DB Init] ⏳ 'Sp_CreaIncidente' existe. Eliminándolo para recrear...")
                cursor.execute("DROP PROCEDURE IF EXISTS Sp_CreaIncidente")
            
            sql_create_procedure = """
            CREATE PROCEDURE Sp_CreaIncidente(
                IN p_HostName VARCHAR(100), IN p_NumeroSerie VARCHAR(100), IN p_UsoCPU BIGINT, IN p_UsoMemoria BIGINT,
                IN p_UsoHD BIGINT, IN p_Temperatura BIGINT, IN p_FechaIncidente TIMESTAMP, IN p_estatus TINYINT,
                IN p_Dominio VARCHAR(100), IN p_IpPublica VARCHAR(50), IN p_Usuario VARCHAR(50),
                IN p_MAC VARCHAR(50), IN p_Marca VARCHAR(50), IN p_Modelo VARCHAR(50)
            )
            BEGIN
                INSERT INTO Incidentes(HostName, NumeroSerie, UsoCPU, UsoMemoria, UsoHD, Temperatura, FechaIncidente, estatus, Dominio, IpPublica, Usuario, MAC, Marca, Modelo)
                VALUES(p_HostName, p_NumeroSerie, p_UsoCPU, p_UsoMemoria, p_UsoHD, p_Temperatura, p_FechaIncidente, p_estatus, p_Dominio, p_IpPublica, p_Usuario, p_MAC, p_Marca, p_Modelo);
            END
            """
            cursor.execute(sql_create_procedure)
            connection.commit()
            print("[DB Init] Procedimiento almacenado 'Sp_CreaIncidente' (re)creado correctamente.")
        return True
    except Exception as e:
        error_str = str(e).encode('utf-8', 'replace').decode('utf-8')
        print(f"[DB Init] Error general inicializando la base de datos: {error_str}")
        traceback.print_exc()
        return False
    finally:
        if connection:
            try: connection.close()
            except Exception as e_close: print(f"[DB Init] Error cerrando conexión: {e_close}")

if __name__ == "__main__":
    print("[Main] Iniciando SondaClick Backend...")
    db_init_success = init_database()
    if not db_init_success:
        print("[Main] La inicialización de la base de datos NO fue exitosa. El backend podría tener funcionalidades limitadas.")
    else:
        print("[Main] Inicialización de la base de datos completada (o intentada).")

    is_packaged = getattr(sys, 'frozen', False)
    run_debug_mode = not is_packaged
    use_reloader_mode = not is_packaged
    
    print(f"[Main] Preparando para iniciar Flask:")
    print(f"  sys.frozen: {getattr(sys, 'frozen', 'No definido (no empaquetado)')}")
    print(f"  run_debug_mode (Flask debug): {run_debug_mode}")
    print(f"  use_reloader_mode (Flask reloader): {use_reloader_mode}")
    print(f"  Host: 0.0.0.0, Port: 5000")

    try:
        print("[Main] Intentando ejecutar app.run()...")
        app.run(debug=run_debug_mode, use_reloader=use_reloader_mode, host='0.0.0.0', port=5000)
        print("[Main] Flask app.run() ha finalizado.") 
    except SystemExit:
        print("[Main] Flask app.run() detenido por SystemExit (normal si el reloader está activo).")
    except OSError as e_os:
        if hasattr(e_os, 'winerror') and e_os.winerror == 10048: # Puerto en uso Windows
             print(f"[Main] ERROR CRÍTICO: El puerto 5000 ya está en uso. Detalles: {e_os}")
        elif e_os.errno == 98: # Puerto en uso Linux/macOS
             print(f"[Main] ERROR CRÍTICO: El puerto 5000 ya está en uso. Detalles: {e_os}")
        else:
             print(f"[Main] ERROR CRÍTICO DEL SISTEMA OPERATIVO al iniciar Flask: {e_os}")
        traceback.print_exc()
    except Exception as e_flask:
        print(f"[Main] ERROR CRÍTICO al intentar iniciar Flask: {e_flask}")
        traceback.print_exc()
    
    print("[Main] Script del backend finalizado.")