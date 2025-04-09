from flask import Flask, jsonify
from flask_cors import CORS
import psutil
import socket
import requests
import subprocess
import shutil
import platform 

app = Flask(__name__)
CORS(app)  # Permite que el frontend (React) haga peticiones

def get_system_details():
    try:
        manufacturer = subprocess.check_output(
            "wmic computersystem get manufacturer", shell=True
        ).decode().split('\n')[1].strip()

        model = subprocess.check_output(
            "wmic computersystem get model", shell=True
        ).decode().split('\n')[1].strip()

        domain = subprocess.check_output(
            "wmic computersystem get domain", shell=True
        ).decode().split('\n')[1].strip()

        os_name = platform.system()
        os_version = platform.version()
        os_release = platform.release()

        is_in_domain = domain != "WORKGROUP"  # Si el dominio no es "WORKGROUP", entonces está en un dominio

        return {
            "manufacturer": manufacturer,
            "model": model,
            "os": f"{os_name} {os_release} (v{os_version})",
            "domain": domain if is_in_domain else "No está en un dominio"
        }
    except Exception as e:
        return {
            "manufacturer": "No disponible",
            "model": "No disponible",
            "os": "No disponible",
            "domain": "No disponible",
            "error": str(e)
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


@app.route("/api/system-info")
def system_info():
    sys_details = get_system_details()
    return jsonify({
        "cpu_percent": psutil.cpu_percent(interval=1),
        "memory": psutil.virtual_memory()._asdict(),
        "cpu_speed": get_cpu_speed(),
        "gpu_temp": get_gpu_temp(),
        "ip_local": get_local_ip(),
        "ip_public": get_public_ip(),
        "disk_usage": get_disk_usage(),
        **sys_details  # Aquí se agregan os, manufacturer, model, domain
    })



if __name__ == "__main__":
    app.run(debug=True)
