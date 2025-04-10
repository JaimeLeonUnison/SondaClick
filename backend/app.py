from flask import Flask, jsonify
from flask_cors import CORS
import psutil
import socket
import requests
import subprocess
import shutil
import platform
import getpass
import uuid

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

if __name__ == "__main__":
    app.run(debug=True)