from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
import wmi
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
import pymysql
import pythoncom # <--- AÑADE ESTA LÍNEA

app = Flask(__name__)
CORS(app)  # Permite que el frontend (React) haga peticiones

#Cargar variables de entorno desde el archivo .env
load_dotenv()

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
            port=int(os.getenv('DB_PORT', 3306))
        )
        return connection
    except Exception as e:
        print(f"Error al conectar a la base de datos: {e}")
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
        print(f"⚠️ No se pudo establecer conexión a la base de datos para {procedure_name}")
        return False
        
    try:
        with connection.cursor() as cursor:
            print(f"⏳ Ejecutando procedimiento {procedure_name} con parámetros: {params}")
            
            # Ejecutar el procedimiento sin verificaciones intermedias
            cursor.callproc(procedure_name, params)
            
            # Confirmar la transacción
            connection.commit()
            print(f"✅ Procedimiento {procedure_name} ejecutado y transacción confirmada")
            
            return True
            
    except Exception as e:
        print(f"⚠️ Error al ejecutar el procedimiento {procedure_name}: {e}")
        return False
    finally:
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
            print(f"⚠️ Condición crítica detectada: {', '.join(critical_reason)}. Guardando en base de datos.")
            
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
                mensaje = f"⚠️ Alerta crítica en {hostname}: {', '.join(critical_reason)}"
                
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
                    print(f"✅ Notificación guardada correctamente para {hostname}")
                else:
                    print(f"⚠️ Error al guardar la notificación para {hostname}")
                
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

# Añadir esta función auxiliar para obtener información de contraseña local
def _get_local_password_expiration():
    try:
        # Intentar obtener información de contraseña local usando WMIC
        cmd = "wmic useraccount where name='%s' get PasswordExpires" % getpass.getuser()
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        
        if result.returncode == 0:
            lines = [line.strip() for line in result.stdout.split('\n') if line.strip()]
            if len(lines) > 1:
                # Si TRUE, la contraseña expira; si FALSE, no expira
                expires = lines[1].upper() == 'TRUE'
                
                if expires:
                    # Intentar obtener cuándo
                    try:
                        # Obtener la política local
                        cmd_policy = "net accounts"
                        policy_result = subprocess.run(cmd_policy, shell=True, capture_output=True, text=True)
                        
                        if policy_result.returncode == 0:
                            output = policy_result.stdout
                            
                            # Buscar el tiempo máximo de duración de contraseña
                            max_age_match = re.search(r'(Vigencia máxima|Maximum password age).*?(\d+)', output, re.IGNORECASE)
                            
                            if max_age_match:
                                max_days = int(max_age_match.group(2))
                                
                                # Obtener fecha del último cambio de contraseña
                                cmd_lastset = f"net user {getpass.getuser()}"
                                lastset_result = subprocess.run(cmd_lastset, shell=True, capture_output=True, text=True)
                                
                                if lastset_result.returncode == 0:
                                    lastset_output = lastset_result.stdout
                                    lastset_match = re.search(r'(Último cambio|Last password change).*?(\d{2}/\d{2}/\d{4})', lastset_output, re.IGNORECASE)
                                    
                                    if lastset_match:
                                        import datetime
                                        
                                        # Intentar diferentes formatos de fecha
                                        for fmt in ["%d/%m/%Y", "%m/%d/%Y"]:
                                            try:
                                                lastset_date = datetime.datetime.strptime(lastset_match.group(2), fmt).date()
                                                expiry_date = lastset_date + datetime.timedelta(days=max_days)
                                                days_remaining = (expiry_date - datetime.date.today()).days
                                                
                                                message = ""
                                                if days_remaining <= 0:
                                                    message = "¡Tu contraseña ha expirado! Debes cambiarla inmediatamente."
                                                elif days_remaining == 1:
                                                    message = "¡Tu contraseña expira mañana!"
                                                elif days_remaining <= 5:
                                                    message = f"¡Tu contraseña expirará en {days_remaining} días!"
                                                else:
                                                    message = f"Tu contraseña expirará el {expiry_date.strftime('%Y-%m-%d')} (en {days_remaining} días)."
                                                    
                                                return {
                                                    "expires": True,
                                                    "daysRemaining": days_remaining,
                                                    "expiryDate": expiry_date.strftime('%Y-%m-%d'),
                                                    "message": message
                                                }
                                            except ValueError:
                                                continue
                    except Exception as policy_error:
                        print(f"Error al obtener política local: {policy_error}")
                
                    # Si llegamos aquí, no pudimos determinar cuándo expira
                    return {
                        "expires": True,
                        "message": "Tu contraseña está configurada para expirar, pero no se pudo determinar la fecha exacta."
                    }
                else:
                    # La contraseña no expira
                    return {
                        "expires": False,
                        "message": "Tu contraseña no expira."
                    }
        
        # Si llegamos aquí, no pudimos determinar si la contraseña expira
        return {
            "expires": None,
            "message": "No se pudo determinar el estado de expiración de tu contraseña local."
        }
    except Exception as e:
        print(f"Error al obtener expiración de contraseña local: {e}")
        return {
            "expires": None,
            "message": "Error al verificar la información de contraseña local."
        }
        
# Agrega esta función a tu archivo principal de API

@app.route('/api/check-domain', methods=['GET'])
def check_domain():
    is_in_domain = False
    
    try:
        # import wmi # Ya está importado globalmente
        # import platform # Ya está importado globalmente
        
        if platform.system() == 'Windows':
            pythoncom.CoInitialize()  # <--- INICIALIZA COM AQUÍ
            try:
                c = wmi.WMI()
                for system in c.Win32_ComputerSystem():
                    # Si no está en dominio, normalmente el dominio es WORKGROUP o está vacío
                    domain = system.Domain
                    is_in_domain = domain and domain.upper() != "WORKGROUP"
            finally:
                pythoncom.CoUninitialize() # <--- DESINICIALIZA COM AQUÍ
    except Exception as e:
        print(f"Error checking domain: {e}")
        # is_in_domain permanece False si hay un error
    
    return jsonify({"isInDomain": is_in_domain})
        
@app.route("/api/password-info", methods=["GET", "OPTIONS"])
def get_password_info():
    if request.method == 'OPTIONS':
        return '', 200
        
    try:
        # Obtener usuario actual o usar el nombre de usuario proporcionado
        username = getpass.getuser()
        
        # Ejecutar net user para obtener la información de contraseña
        command = f"net user {username} /domain"
        result = subprocess.run(command, shell=True, capture_output=True, text=True, encoding='latin1')
        
        if result.returncode != 0:
            # Si falla el comando de dominio, intentar con usuario local
            command = f"net user {username}"
            result = subprocess.run(command, shell=True, capture_output=True, text=True, encoding='latin1')
            
        output = result.stdout
        
        # Extraer la información específica que necesitamos
        password_last_set = "No disponible"
        password_expires = "No disponible"
        user_may_change = "No disponible"
        
        for line in output.splitlines():
            line = line.strip()
            
            # Comprobar diferentes formatos e idiomas
            if any(phrase in line for phrase in ["Password last set", "contraseña establecida", "Última contraseña"]):
                try:
                    # Intentar extraer la fecha usando expresiones regulares
                    import re
                    date_match = re.search(r'\d{1,2}/\d{1,2}/\d{4}', line)
                    if date_match:
                        password_last_set = date_match.group(0)
                    else:
                        parts = line.split(":", 1)
                        if len(parts) > 1:
                            password_last_set = parts[1].strip()
                except Exception as e:
                    print(f"Error al extraer fecha de última contraseña: {e}")
            
            elif any(phrase in line for phrase in ["Password expires", "contraseña expira", "contraseña caduca"]):
                try:
                    # Similar al anterior
                    import re
                    date_match = re.search(r'\d{1,2}/\d{1,2}/\d{4}', line)
                    if date_match:
                        password_expires = date_match.group(0)
                    elif "never" in line.lower() or "nunca" in line.lower():
                        password_expires = "Nunca"
                    else:
                        parts = line.split(":", 1)
                        if len(parts) > 1:
                            password_expires = parts[1].strip()
                except Exception as e:
                    print(f"Error al extraer fecha de expiración: {e}")
            
            elif any(phrase in line for phrase in ["User may change password", "usuario puede cambiar", "puede cambiar"]):
                try:
                    # Buscar Yes/No o Sí/No
                    if "yes" in line.lower() or "sí" in line.lower():
                        user_may_change = "Sí"
                    elif "no" in line.lower():
                        user_may_change = "No"
                    else:
                        parts = line.split(":", 1)
                        if len(parts) > 1:
                            user_may_change = parts[1].strip()
                except Exception as e:
                    print(f"Error al extraer permiso de cambio: {e}")
        
        # Depuración: imprimir todo el output para revisar
        print(f"Output completo del comando: {output}")
        print(f"Password last set: {password_last_set}")
        print(f"Password expires: {password_expires}")
        print(f"User may change: {user_may_change}")
        
        return jsonify({
            "success": True,
            "passwordLastSet": password_last_set,
            "passwordExpires": password_expires,
            "userMayChangePassword": user_may_change
        })
                
    except Exception as e:
        print(f"Error obteniendo información de contraseña: {e}")
        return jsonify({
            "success": False,
            "message": f"Error: {str(e)}"
        })

@app.route("/api/password-expiration", methods=["GET", "OPTIONS"])
def password_expiration():
    if request.method == 'OPTIONS':
        return '', 200
        
    try:
        # Obtener el usuario actual
        current_user = getpass.getuser()
        
        # Determinar si estamos en un dominio
        domain_info = subprocess.check_output("wmic computersystem get domain", shell=True).decode().strip()
        domain_lines = [line.strip() for line in domain_info.split('\n') if line.strip()]
        domain = domain_lines[1] if len(domain_lines) > 1 else ""
        is_domain = domain.upper() != "WORKGROUP"
        
        if not is_domain:
            # Para usuarios locales, usar el método específico
            local_info = _get_local_password_expiration()
            return jsonify(local_info)
        
        # Método alternativo para usuarios de dominio usando net user
        try:
            # Usar el comando net user para obtener información del usuario en el dominio
            net_user_cmd = f"net user {current_user} /domain"
            result = subprocess.run(net_user_cmd, shell=True, capture_output=True, text=True)
            
            if result.returncode == 0:
                output = result.stdout
                
                # Buscar información sobre la expiración de la contraseña
                password_expires_line = None
                for line in output.split('\n'):
                    if "La contraseña expira" in line or "Password expires" in line:
                        password_expires_line = line
                        break
                
                if (password_expires_line):
                    # Extraer la fecha de expiración
                    parts = password_expires_line.split(':', 1)
                    if len(parts) > 1:
                        expiry_info = parts[1].strip()
                        
                        # Verificar si la contraseña nunca expira
                        if "nunca" in expiry_info.lower() or "never" in expiry_info.lower():
                            return jsonify({
                                "expires": False,
                                "message": "Tu contraseña no expira."
                            })
                        
                        # Intentar parsear la fecha de expiración
                        try:
                            import datetime
                            
                            # Diferentes formatos de fecha posibles según la configuración regional
                            date_formats = [
                                "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d",  # Formatos numéricos
                                "%d-%m-%Y", "%m-%d-%Y", "%Y-%m-%d",  # Con guiones
                                "%d %b %Y", "%b %d %Y",              # Con nombre de mes abreviado
                                "%d %B %Y", "%B %d %Y"               # Con nombre de mes completo
                            ]
                            
                            expiry_date = None
                            for date_format in date_formats:
                                try:
                                    expiry_date = datetime.datetime.strptime(expiry_info, date_format).date()
                                    break
                                except ValueError:
                                    continue
                            
                            if expiry_date:
                                today = datetime.date.today()
                                days_remaining = (expiry_date - today).days
                                
                                message = ""
                                if days_remaining <= 0:
                                    message = "¡Tu contraseña ha expirado! Debes cambiarla inmediatamente."
                                elif days_remaining == 1:
                                    message = "¡Tu contraseña expira mañana!"
                                elif days_remaining <= 5:
                                    message = f"¡Tu contraseña expirará en {days_remaining} días!"
                                else:
                                    message = f"Tu contraseña expirará el {expiry_date.strftime('%Y-%m-%d')} (en {days_remaining} días)."
                                    
                                return jsonify({
                                    "expires": True,
                                    "daysRemaining": days_remaining,
                                    "expiryDate": expiry_date.strftime('%Y-%m-%d'),
                                    "message": message
                                })
                        except Exception as date_error:
                            print(f"Error al parsear la fecha de expiración: {date_error}")
                
                # Si llegamos aquí, no pudimos determinar exactamente la expiración
                # Verificar si se menciona cambio de contraseña requerido
                change_required = False
                for line in output.split('\n'):
                    if "cambiar contraseña" in line.lower() or "change password" in line.lower():
                        if "próximo inicio" in line.lower() or "next logon" in line.lower():
                            change_required = True
                            break
                
                if change_required:
                    return jsonify({
                        "expires": True,
                        "daysRemaining": 0,
                        "message": "Debes cambiar tu contraseña en el próximo inicio de sesión."
                    })
            
            # Si aún no tenemos información, intentar con el PowerShell original
            return _get_password_expiration_via_powershell()
                
        except Exception as net_user_error:
            print(f"Error al usar net user: {net_user_error}")
            # Intentar con el método PowerShell original
            return _get_password_expiration_via_powershell()
            
    except Exception as e:
        print(f"Error obteniendo información de expiración de contraseña: {e}")
        return jsonify({
            "expires": None,
            "message": f"Error: {str(e)}"
        })

# Mover el método original a una función auxiliar
def _get_password_expiration_via_powershell():
    try:
        # Para usuarios de dominio, usar PowerShell para obtener la información de expiración
        ps_cmd = r'''
        powershell -Command "
        try {
            # Método simplificado para obtener info de expiración
            $username = $env:USERNAME
            $userInfo = net user $username /domain 2>$null
            
            if ($LASTEXITCODE -eq 0) {
                $passwordInfo = $userInfo | Where-Object { $_ -match 'Password expires|contraseña expira|La contraseña caduca' }
                
                if ($passwordInfo -match '(never|nunca|jamás)') {
                    Write-Output 'NO_EXPIRY'
                    exit
                }
                
                if ($passwordInfo -match '(\d{2}/\d{2}/\d{4})') {
                    $dateString = $matches[1]
                    try {
                        # Intentar varios formatos
                        try { $expiryDate = [DateTime]::ParseExact($dateString, 'MM/dd/yyyy', $null) }
                        catch { $expiryDate = [DateTime]::Parse($dateString) }
                        
                        $daysRemaining = ($expiryDate - (Get-Date)).Days
                        Write-Output ('EXPIRES|' + $daysRemaining + '|' + $expiryDate.ToString('yyyy-MM-dd'))
                        exit
                    }
                    catch {
                        Write-Output ('ERROR|No se pudo interpretar la fecha: ' + $dateString)
                        exit
                    }
                }
            }
            
            # Si llegamos aquí, probar otro método
            try {
                Add-Type -AssemblyName System.DirectoryServices.AccountManagement
                $context = New-Object System.DirectoryServices.AccountManagement.PrincipalContext('Domain')
                $user = [System.DirectoryServices.AccountManagement.UserPrincipal]::FindByIdentity($context, $env:USERNAME)
                
                if ($user.PasswordNeverExpires) {
                    Write-Output 'NO_EXPIRY'
                    exit
                }
                
                if ($user.LastPasswordSet -eq $null) {
                    Write-Output 'CHANGE_REQUIRED'
                    exit
                }
                
                # Intentar obtener la política del dominio
                $domain = [System.DirectoryServices.ActiveDirectory.Domain]::GetCurrentDomain()
                $policy = $domain.GetDirectoryEntry()
                $maxPwdAge = $policy.Properties['maxPwdAge'].Value
                
                if ($maxPwdAge) {
                    $maxPwdAgeDays = [math]::Abs($maxPwdAge / 864000000000)
                    $expiryDate = $user.LastPasswordSet.AddDays($maxPwdAgeDays)
                    $daysRemaining = ($expiryDate - (Get-Date)).Days
                    Write-Output ('EXPIRES|' + $daysRemaining + '|' + $expiryDate.ToString('yyyy-MM-dd'))
                    exit
                }
            }
            catch {
                Write-Output ('ERROR|Error al obtener datos de Active Directory: ' + $_.Exception.Message)
                exit
            }
            
            # Último recurso: intentar con ADSI
            try {
                $root = New-Object DirectoryServices.DirectoryEntry
                $search = New-Object DirectoryServices.DirectorySearcher($root)
                $search.Filter = '(&(objectClass=user)(sAMAccountName=' + $env:USERNAME + '))'
                $result = $search.FindOne()
                
                if ($result) {
                    $user = $result.GetDirectoryEntry()
                    $pwdLastSet = $user.pwdLastSet.Value
                    
                    if ($pwdLastSet -eq 0) {
                        Write-Output 'CHANGE_REQUIRED'
                        exit
                    }
                    
                    # Convertir pwdLastSet a fecha
                    $pwdLastSetDate = [DateTime]::FromFileTime($pwdLastSet)
                    
                    # Usar la política obtenida previamente
                    $policy = net accounts /domain
                    $maxPwdAgeMatch = $policy | Select-String -Pattern '(Maximum password age|Vigencia máxima).*?(\d+)'
                    
                    if ($maxPwdAgeMatch -and $maxPwdAgeMatch.Matches.Groups.Count -gt 2) {
                        $maxPwdAgeDays = [int]$maxPwdAgeMatch.Matches.Groups[2].Value
                        $expiryDate = $pwdLastSetDate.AddDays($maxPwdAgeDays)
                        $daysRemaining = ($expiryDate - (Get-Date)).Days
                        Write-Output ('EXPIRES|' + $daysRemaining + '|' + $expiryDate.ToString('yyyy-MM-dd'))
                        exit
                    }
                }
            }
            catch {
                Write-Output ('ERROR|Error ADSI: ' + $_.Exception.Message)
                exit
            }
            
            # Si llegamos aquí, no pudimos determinar nada concreto
            Write-Output 'EXPIRES_UNKNOWN'
        }
        catch {
            Write-Output ('ERROR|' + $_.Exception.Message)
        }
        "
        '''
        
        result = subprocess.run(ps_cmd, shell=True, capture_output=True, text=True)
        output = result.stdout.strip()
        
        # El resto del código permanece igual
        
        if output.startswith('NO_EXPIRY'):
            return jsonify({
                "expires": False,
                "message": "Tu contraseña no expira."
            })
        elif output.startswith('CHANGE_REQUIRED'):
            return jsonify({
                "expires": True,
                "daysRemaining": 0,
                "message": "Debes cambiar tu contraseña en el próximo inicio de sesión."
            })
        elif output.startswith('EXPIRES'):
            parts = output.split('|')
            days_remaining = int(parts[1])
            expiry_date = parts[2]
            
            message = ""
            if days_remaining <= 0:
                message = "¡Tu contraseña ha expirado! Debes cambiarla inmediatamente."
            elif days_remaining == 1:
                message = "¡Tu contraseña expira mañana!"
            elif days_remaining <= 5:
                message = f"¡Tu contraseña expirará en {days_remaining} días!"
            else:
                message = f"Tu contraseña expirará el {expiry_date} (en {days_remaining} días)."
                
            return jsonify({
                "expires": True,
                "daysRemaining": days_remaining,
                "expiryDate": expiry_date,
                "message": message
            })
        elif output.startswith('ERROR'):
            error_msg = output.split('|')[1] if '|' in output else "Error desconocido"
            print(f"Error obteniendo expiración de contraseña: {error_msg}")
            return jsonify({
                "expires": None,
                "message": f"No se pudo determinar la expiración de la contraseña: {error_msg}"
            })
        else:
            print(f"Respuesta inesperada: {output}")
            return jsonify({
                "expires": None,
                "message": "No se pudo determinar la expiración de la contraseña."
            })
    except Exception as ps_error:
        print(f"Error en método PowerShell: {ps_error}")
        return jsonify({
            "expires": None,
            "message": "No se pudo determinar la expiración de la contraseña mediante métodos alternativos."
        })

@app.route('/api/force-password-change', methods=['POST', 'OPTIONS'])
def force_password_change():
    if request.method == 'OPTIONS':
        return '', 200
        
    try:
        # Obtener usuario actual
        username = getpass.getuser()
        
        # Verificar si estamos en un dominio
        domain_info = subprocess.check_output("wmic computersystem get domain", shell=True).decode().strip()
        domain_lines = [line.strip() for line in domain_info.split('\n') if line.strip()]
        domain = domain_lines[1] if len(domain_lines) > 1 else ""
        is_domain = domain.upper() != "WORKGROUP"
        
        if is_domain:
            # Para equipos en dominio, intentar abrir CTRL+ALT+DEL de forma más directa
            # Esta es la secuencia más confiable para usuarios de dominio
            cmd = '''
            powershell -Command "
            Add-Type -TypeDefinition @'
            using System;
            using System.Runtime.InteropServices;
            
            public class NativeMethods {
                [DllImport(\"user32.dll\")]
                public static extern void LockWorkStation();
            }
            '@
            
            # Bloquear la estación de trabajo (primer paso de Ctrl+Alt+Del)
            [NativeMethods]::LockWorkStation()
            "
            '''
            subprocess.Popen(cmd, shell=True)
            
            # Mensaje específico para cambio de contraseña solicitado por la organización
            return jsonify({
                "success": True, 
                "message": "Por motivos de seguridad, su organización requiere que cambie su contraseña. Se ha bloqueado la pantalla. Por favor, presione Ctrl+Alt+Supr y seleccione 'Cambiar una contraseña'.",
                "isOrganizationRequest": True
            })
        else:
            # Para equipos locales, intentar métodos alternativos
            # 1. Intenta abrir directamente el diálogo de cuentas de usuario
            subprocess.Popen('control userpasswords2', shell=True)
            
            return jsonify({
                "success": True, 
                "message": "Por motivos de seguridad, se recomienda cambiar su contraseña. Se ha abierto el panel de control de contraseñas.",
                "isOrganizationRequest": True
            })
            
    except Exception as e:
        print(f"Error al forzar cambio de contraseña: {str(e)}")
        return jsonify({
            "success": False, 
            "message": f"Error al iniciar el proceso de cambio de contraseña: {str(e)}"
        }), 500
        
@app.route("/api/user-info", methods=["GET", "OPTIONS"])
def user_info():
    if request.method == 'OPTIONS':
        return '', 200
        
    try:
        # Obtener usuario actual
        username = getpass.getuser()
        
        # Verificar si estamos en un dominio
        domain_info = subprocess.check_output("wmic computersystem get domain", shell=True).decode().strip()
        domain_lines = [line.strip() for line in domain_info.split('\n') if line.strip()]
        domain = domain_lines[1] if len(domain_lines) > 1 else ""
        is_domain = domain.upper() != "WORKGROUP"
        
        # Obtener nombre completo si está disponible
        full_name = ""
        try:
            name_info = subprocess.check_output("wmic useraccount where name='%s' get fullname" % username, shell=True).decode().strip()
            name_lines = [line.strip() for line in name_info.split('\n') if line.strip()]
            if len(name_lines) > 1:
                full_name = name_lines[1]
        except:
            pass
        
        return jsonify({
            "username": username,
            "fullName": full_name,
            "isDomainUser": is_domain,
            "domain": domain if is_domain else "No está en un dominio"
        })
    except Exception as e:
        print(f"Error obteniendo información de usuario: {e}")
        return jsonify({
            "username": getpass.getuser(),
            "isDomainUser": False,
            "error": str(e)
        })
    
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

@app.route("/api/system-info")
@app.route("/api/system-info")
def system_info():
    sys_details = get_system_details()
    temps = get_system_temperatures()
    interfaces = get_network_interfaces()
    hostname = get_hostname()
    cpu_percent = psutil.cpu_percent(interval=1)
    memory = psutil.virtual_memory()
    disk = get_disk_usage()
    
    # Obtener usuario dominio
    user = getpass.getuser()
    domain_info = subprocess.check_output("wmic computersystem get domain", shell=True).decode().strip()
    domain_lines = [line.strip() for line in domain_info.split('\n') if line.strip()]
    domain = domain_lines[1] if len(domain_lines) > 1 else ""
    is_domain = domain.upper() != "WORKGROUP"
    usuario_dominio = f"{domain}\\{user}" if is_domain else user
    
    # Usuario y dominio como campos separados (para el nuevo formato)
    dominio = domain if is_domain else "LOCAL"
    usuario = user
    
    # Obtener IP pública
    ip_publica = get_public_ip() or "No disponible"
    
    #Definir estatus con 0
    estatus = 0
    
    # Obtener umbrales desde variables de entorno
    cpu_threshold = float(os.getenv('CRITICAL_CPU_THRESHOLD', 90))
    temp_threshold = float(os.getenv('CRITICAL_TEMP_THRESHOLD', 90))
    memory_threshold = float(os.getenv('CRITICAL_MEMORY_THRESHOLD', 90))
    
    # Verificar condiciones críticas
    critical_conditions = []
    if cpu_percent >= cpu_threshold:
        critical_conditions.append(f"CPU al {cpu_percent}% (umbral: {cpu_threshold}%)")
    
    cpu_temp = temps.get('cpu', None)
    if cpu_temp is not None and cpu_temp >= temp_threshold:
        critical_conditions.append(f"Temperatura CPU: {cpu_temp}°C (umbral: {temp_threshold}°C)")
    
    if memory.percent >= memory_threshold:
        critical_conditions.append(f"Memoria RAM al {memory.percent}% (umbral: {memory_threshold}%)")
    
    # Guardar información en la base de datos si hay condiciones críticas
    saved_to_db = False
    if critical_conditions:
        saved_to_db = save_system_info(
            hostname=hostname,
            cpu_percent=cpu_percent,
            memory_percent=memory.percent,
            disk_percent=disk["percent"],
            temperatures=temps
        )

    return jsonify({
        "user": user,
        "IpPublica": ip_publica,            # Nuevo campo agregado
        "hostname": hostname,
        "cpu_percent": cpu_percent,
        "memory": memory._asdict(),
        "cpu_speed": get_cpu_speed(),
        "temperatures": temps,
        "gpu_temp": get_gpu_temp(),
        "ip_local": get_local_ip(),
        "ip_public": ip_publica,            # Duplicado para mantener compatibilidad
        "disk_usage": disk,
        "serial_number": get_serial_number(),
        "network_interfaces": interfaces,
        "critical_conditions": critical_conditions,
        "saved_to_database": saved_to_db and len(critical_conditions) > 0,
        "thresholds": {
            "cpu": cpu_threshold,
            "temperature": temp_threshold,
            "memory": memory_threshold
        },
        **sys_details
    })
    
@app.route("/api/user-details", methods=["GET", "OPTIONS"])
def get_user_details():
    if request.method == 'OPTIONS':
        return '', 200
        
    try:
        # Obtener usuario actual
        username = getpass.getuser()
        
        # Verificar si estamos en un dominio
        domain_info = subprocess.check_output("wmic computersystem get domain", shell=True).decode().strip()
        domain_lines = [line.strip() for line in domain_info.split('\n') if line.strip()]
        domain = domain_lines[1] if len(domain_lines) > 1 else ""
        is_domain = domain.upper() != "WORKGROUP"
        
        user_details = {}
        
        if is_domain:
            # Para usuarios de dominio, ejecutar net user con /domain
            try:
                cmd = f"net user {username} /domain"
                result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
                
                if result.returncode == 0:
                    output = result.stdout
                    user_details["isDomain"] = True
                    user_details["domain"] = domain
                    
                    # Extraer información clave del output
                    patterns = {
                        "username": r"User name\s+(.+)",
                        "fullName": r"Full Name\s+(.+)",
                        "accountActive": r"Account active\s+(.+)",
                        "accountExpires": r"Account expires\s+(.+)",
                        "passwordLastSet": r"Password last set\s+(.+)",
                        "passwordExpires": r"Password expires\s+(.+)",
                        "passwordChangeable": r"Password changeable\s+(.+)",
                        "passwordRequired": r"Password required\s+(.+)",
                        "userMayChangePassword": r"User may change password\s+(.+)",
                        "lastLogon": r"Last logon\s+(.+)",
                        "workstationsAllowed": r"Workstations allowed\s+(.+)",
                        "logonScript": r"Logon script\s+(.+)",
                        "userProfile": r"User profile\s+(.+)",
                        "homeDirectory": r"Home directory\s+(.+)",
                        "logonHoursAllowed": r"Logon hours allowed\s+(.+)",
                    }
                    
                    # También patrones para versión en español
                    es_patterns = {
                        "username": r"Nombre de usuario\s+(.+)",
                        "fullName": r"Nombre completo\s+(.+)",
                        "accountActive": r"Cuenta activa\s+(.+)",
                        "accountExpires": r"La cuenta caduca\s+(.+)",
                        "passwordLastSet": r"Último cambio de contraseña\s+(.+)",
                        "passwordExpires": r"La contraseña caduca\s+(.+)",
                        "passwordChangeable": r"Contraseña modificable\s+(.+)",
                        "passwordRequired": r"Se requiere contraseña\s+(.+)",
                        "userMayChangePassword": r"El usuario puede cambiar la contraseña\s+(.+)",
                        "lastLogon": r"Última sesión\s+(.+)",
                    }
                    
                    # Combinar patrones para detectar en ambos idiomas
                    all_patterns = {}
                    for key in patterns:
                        all_patterns[key] = f"({patterns[key]}|{es_patterns.get(key, '')})"
                    
                    # Extraer cada campo
                    for key, pattern in all_patterns.items():
                        match = re.search(pattern, output, re.IGNORECASE)
                        if match:
                            value = match.group(1).strip()
                            if '\\' in value and len(value) > 1:
                                value = value.split('\\')[1]  # Eliminar prefijo de dominio si existe
                            user_details[key] = value
                    
                    # Extraer membresías de grupos
                    groups = []
                    group_section = re.findall(r"Global Group memberships\s+(.+?)(?=The command completed|\Z)", 
                                              output, re.DOTALL | re.IGNORECASE)
                    
                    if group_section:
                        group_text = group_section[0]
                        group_lines = [line.strip() for line in group_text.split('\n') if line.strip()]
                        for line in group_lines:
                            # Extraer grupos, pueden estar separados por espacios y *
                            line_groups = re.findall(r"\*([^*]+)", line)
                            for group in line_groups:
                                clean_group = group.strip()
                                if clean_group:
                                    groups.append(clean_group)
                    
                    user_details["groups"] = groups
                    
                    # Analizar fechas de contraseña para calcular días restantes
                    if "passwordExpires" in user_details and "Never" not in user_details["passwordExpires"] and "nunca" not in user_details["passwordExpires"].lower():
                        try:
                            import datetime
                            # Intentar diferentes formatos de fecha
                            date_formats = [
                                "%m/%d/%Y %I:%M:%S %p", "%d/%m/%Y %I:%M:%S %p",
                                "%m/%d/%Y %H:%M:%S", "%d/%m/%Y %H:%M:%S",
                                "%m/%d/%Y", "%d/%m/%Y"
                            ]
                            
                            expiry_date = None
                            for fmt in date_formats:
                                try:
                                    expiry_date = datetime.datetime.strptime(user_details["passwordExpires"], fmt)
                                    break
                                except ValueError:
                                    continue
                            
                            if expiry_date:
                                today = datetime.datetime.now()
                                delta = expiry_date - today
                                user_details["passwordExpiresInDays"] = delta.days
                                user_details["passwordStatus"] = (
                                    "expired" if delta.days < 0 else
                                    "warning" if delta.days < 7 else
                                    "ok"
                                )
                        except Exception as date_error:
                            print(f"Error procesando fecha: {date_error}")
                    else:
                        user_details["passwordExpiresInDays"] = None
                        user_details["passwordStatus"] = "neverExpires"
                
                else:
                    # Si no se pudo obtener info del dominio, intentar con usuario local
                    print(f"Error obteniendo detalles de usuario de dominio: {result.stderr}")
                    is_domain = False
            
            except Exception as domain_error:
                print(f"Error procesando información de dominio: {domain_error}")
                is_domain = False
        
        # Si no es usuario de dominio o falló la consulta de dominio, intentar con usuario local
        if not is_domain:
            try:
                cmd = f"net user {username}"
                result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
                
                if result.returncode == 0:
                    output = result.stdout
                    user_details["isDomain"] = False
                    user_details["domain"] = "Local"
                    
                    # Usar los mismos patrones que antes para extraer la información
                    patterns = {
                        "username": r"User name\s+(.+)",
                        "fullName": r"Full Name\s+(.+)",
                        "accountActive": r"Account active\s+(.+)",
                        "accountExpires": r"Account expires\s+(.+)",
                        "passwordLastSet": r"Password last set\s+(.+)",
                        "passwordExpires": r"Password expires\s+(.+)",
                        "passwordChangeable": r"Password changeable\s+(.+)",
                        "passwordRequired": r"Password required\s+(.+)",
                        "userMayChangePassword": r"User may change password\s+(.+)",
                        "lastLogon": r"Last logon\s+(.+)",
                    }
                    
                    # También patrones para versión en español
                    es_patterns = {
                        "username": r"Nombre de usuario\s+(.+)",
                        "fullName": r"Nombre completo\s+(.+)",
                        "accountActive": r"Cuenta activa\s+(.+)",
                        "accountExpires": r"La cuenta caduca\s+(.+)",
                        "passwordLastSet": r"Último cambio de contraseña\s+(.+)",
                        "passwordExpires": r"La contraseña caduca\s+(.+)",
                        "passwordChangeable": r"Contraseña modificable\s+(.+)",
                        "passwordRequired": r"Se requiere contraseña\s+(.+)",
                        "userMayChangePassword": r"El usuario puede cambiar la contraseña\s+(.+)",
                        "lastLogon": r"Última sesión\s+(.+)",
                    }
                    
                    # Combinar patrones para detectar en ambos idiomas
                    all_patterns = {}
                    for key in patterns:
                        all_patterns[key] = f"({patterns[key]}|{es_patterns.get(key, '')})"
                    
                    # Extraer cada campo
                    for key, pattern in all_patterns.items():
                        match = re.search(pattern, output, re.IGNORECASE)
                        if match:
                            user_details[key] = match.group(1).strip()
                    
                    # Extraer membresías de grupos locales
                    groups = []
                    group_section = re.findall(r"Local Group Memberships\s+(.+?)(?=The command completed|\Z)", 
                                              output, re.DOTALL | re.IGNORECASE)
                    
                    if group_section:
                        group_text = group_section[0]
                        group_lines = [line.strip() for line in group_text.split('\n') if line.strip()]
                        for line in group_lines:
                            # Extraer grupos, pueden estar separados por espacios y *
                            line_groups = re.findall(r"\*([^*]+)", line)
                            for group in line_groups:
                                clean_group = group.strip()
                                if clean_group:
                                    groups.append(clean_group)
                    
                    user_details["groups"] = groups
                    
                    # Analizar fechas para calcular días restantes
                    if "passwordExpires" in user_details and "Never" not in user_details["passwordExpires"] and "nunca" not in user_details["passwordExpires"].lower():
                        try:
                            import datetime
                            # Intentar diferentes formatos de fecha
                            date_formats = [
                                "%m/%d/%Y %I:%M:%S %p", "%d/%m/%Y %I:%M:%S %p",
                                "%m/%d/%Y %H:%M:%S", "%d/%m/%Y %H:%M:%S",
                                "%m/%d/%Y", "%d/%m/%Y"
                            ]
                            
                            expiry_date = None
                            for fmt in date_formats:
                                try:
                                    expiry_date = datetime.datetime.strptime(user_details["passwordExpires"], fmt)
                                    break
                                except ValueError:
                                    continue
                            
                            if expiry_date:
                                today = datetime.datetime.now()
                                delta = expiry_date - today
                                user_details["passwordExpiresInDays"] = delta.days
                                user_details["passwordStatus"] = (
                                    "expired" if delta.days < 0 else
                                    "warning" if delta.days < 7 else
                                    "ok"
                                )
                        except Exception as date_error:
                            print(f"Error procesando fecha: {date_error}")
                    else:
                        user_details["passwordExpiresInDays"] = None
                        user_details["passwordStatus"] = "neverExpires"
                else:
                    return jsonify({
                        "success": False,
                        "message": "No se pudo obtener información del usuario",
                        "error": result.stderr
                    }), 400
                    
            except Exception as local_error:
                print(f"Error obteniendo detalles de usuario local: {local_error}")
                return jsonify({
                    "success": False,
                    "message": "Error al obtener detalles del usuario",
                    "error": str(local_error)
                }), 500
        
        return jsonify({
            "success": True,
            "userDetails": user_details
        })
        
    except Exception as e:
        print(f"Error general obteniendo detalles de usuario: {e}")
        return jsonify({
            "success": False,
            "message": "Error general al obtener detalles del usuario",
            "error": str(e)
        }), 500

@app.route('/api/open-password-dialog', methods=['POST', 'OPTIONS'])
def open_password_dialog():
    if request.method == 'OPTIONS':
        return '', 200
        
    try:
        # Determinar si estamos en un dominio
        domain_info = subprocess.check_output("wmic computersystem get domain", shell=True).decode().strip()
        domain_lines = [line.strip() for line in domain_info.split('\n') if line.strip()]
        domain = domain_lines[1] if len(domain_lines) > 1 else ""
        is_domain = domain.upper() != "WORKGROUP"
        
        if is_domain:
            # Para equipos en dominio, intentar abrir CTRL+ALT+DEL mediante bloqueo de pantalla
            ctypes.windll.user32.LockWorkStation()
            return jsonify({
                "success": True, 
                "message": "Se ha bloqueado la pantalla. Presione Ctrl+Alt+Supr y seleccione 'Cambiar una contraseña'"
            })
        else:
            # Para equipos no en dominio, abrir el panel de control de cuentas de usuario
            subprocess.Popen('control userpasswords2', shell=True)
            return jsonify({
                "success": True, 
                "message": "Panel de control de contraseñas abierto"
            })
            
    except Exception as e:
        print(f"Error al abrir panel de contraseñas: {str(e)}")
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
    
@app.errorhandler(Exception)
def handle_exception(e):
    """Manejador global de excepciones."""
    print(f"Error no manejado: {e}")
    return jsonify({
        "success": False,
        "message": "Error interno del servidor"
    }), 500

def init_database():
    """
    Inicializa la conexión a la base de datos y verifica los recursos necesarios
    como procedimientos almacenados y tablas.
    """
    try:
        print("Iniciando conexión a la base de datos...")
        connection = get_connection()
        
        if not connection:
            print("⚠️ No se pudo establecer conexión a la base de datos.")
            return False
            
        print("✅ Conexión a la base de datos establecida correctamente")
        
        # Verificar y actualizar el procedimiento almacenado
        try:
            with connection.cursor() as cursor:
                # Primero verificar si el procedimiento existe
                cursor.execute("""
                SELECT ROUTINE_NAME 
                FROM INFORMATION_SCHEMA.ROUTINES 
                WHERE ROUTINE_TYPE = 'PROCEDURE' 
                AND ROUTINE_NAME = 'Sp_CreaIncidente'
                """)
                result = cursor.fetchone()
                
                # Si existe, eliminarlo y volver a crearlo
                if result:
                    print("⚠️ Actualizando el procedimiento almacenado 'Sp_CreaIncidente'...")
                    cursor.execute("DROP PROCEDURE IF EXISTS Sp_CreaIncidente")
                    connection.commit()
                
                # Crear el procedimiento con la estructura correcta, incluyendo MAC, Marca y Modelo
                cursor.execute("""
                CREATE PROCEDURE Sp_CreaIncidente(
                    IN p_HostName VARCHAR(100),
                    IN p_NumeroSerie VARCHAR(100),
                    IN p_UsoCPU BIGINT,
                    IN p_UsoMemoria BIGINT,
                    IN p_UsoHD BIGINT,
                    IN p_Temperatura BIGINT,
                    IN p_FechaIncidente TIMESTAMP,
                    IN p_estatus TINYINT,
                    IN p_Dominio VARCHAR(100),
                    IN p_IpPublica VARCHAR(50),
                    IN p_Usuario VARCHAR(50),
                    IN p_MAC VARCHAR(50),
                    IN p_Marca VARCHAR(50),
                    IN p_Modelo VARCHAR(50)
                )
                BEGIN
                    INSERT INTO Incidentes(
                        HostName, 
                        NumeroSerie, 
                        UsoCPU, 
                        UsoMemoria, 
                        UsoHD, 
                        Temperatura, 
                        FechaIncidente,
                        estatus,
                        Dominio,
                        IpPublica,
                        Usuario,
                        MAC,
                        Marca,
                        Modelo
                    )
                    VALUES(
                        p_HostName, 
                        p_NumeroSerie, 
                        p_UsoCPU, 
                        p_UsoMemoria, 
                        p_UsoHD, 
                        p_Temperatura, 
                        p_FechaIncidente,
                        p_estatus,
                        p_Dominio,
                        p_IpPublica,
                        p_Usuario,
                        p_MAC,
                        p_Marca,
                        p_Modelo
                    );
                END
                """)
                connection.commit()
                print("✅ Procedimiento almacenado 'Sp_CreaIncidente' actualizado correctamente")
                
                # Verificar la estructura del procedimiento para confirmar
                cursor.execute("""
                SELECT PARAMETER_NAME, ORDINAL_POSITION 
                FROM INFORMATION_SCHEMA.PARAMETERS 
                WHERE SPECIFIC_NAME = 'Sp_CreaIncidente' 
                ORDER BY ORDINAL_POSITION
                """)
                params_info = cursor.fetchall()
                print(f"Estructura verificada del procedimiento: {params_info}")
                
                # Ahora verificar que la tabla tenga la estructura correcta
                cursor.execute("""
                DESCRIBE Incidentes
                """)
                table_structure = cursor.fetchall()
                print(f"Estructura de la tabla Incidentes: {table_structure}")
                
        except Exception as e:
            print(f"⚠️ Error al actualizar el procedimiento almacenado: {e}")
            
        connection.close()
        return True
    except Exception as e:
        print(f"⚠️ Error inicializando la base de datos: {e}")
        return False

if __name__ == "__main__":
    init_database()
    app.run(debug=True)