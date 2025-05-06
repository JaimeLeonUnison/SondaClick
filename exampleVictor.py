from pydantic_core import Url  #Import No se Usa porque Se Elimino el procedimiento del Correo
import requests
import json
import pymysql
import time   #Import No se Usa porque Se Elimino el procedimiento del Correo
import smtplib, ssl #Import No se Usa porque Se Elimino el procedimiento del Correo
from email.message import EmailMessage
from apscheduler.schedulers.blocking import BlockingScheduler
from datetime import datetime
 
def ejecutar_tarea():
    print(f"Tarea ejecutada a las: {datetime.now()}")
   
    conexion = pymysql.connect(host="200.94.143.36", user="SONDAHMO", passwd="S0nd425*", db="SondaClickMX")
    cur = conexion.cursor()
    procedimiento = "CALL Sp_ConsultaIncidencia"
    cur.execute(procedimiento)
    temp = []
    resultset = cur.fetchmany()
    for row in resultset:
        temp.append(row[0])
        temp.append(row[1])
        print(row)
    Cantidad = len(temp) + 1
    print(Cantidad)
 
    if Cantidad > 2:
        Host = temp[1] + ''
        print(f"Se Necesita crear un Ticket {Host}")
        procedimiento = "CALL Sp_ActualizaStatus(%s)"
        cur.execute(procedimiento, Host)
        print("los datos se actualizaron correctamente")
        conexion.commit()
        
        # Todo el código de autenticación, creación de ticket y SMS
        # debería estar aquí dentro
        crear_ticket_y_enviar_sms(Host)
    
    # Cerrar la conexión siempre, incluso si no hay tickets que crear
    conexion.close()

def crear_ticket_y_enviar_sms(Host):
    # URL del endpoint para autenticación
    url = "https://itsm.sonda.com/asmsapi/api/v9/authentication/"
 
    # Cabeceras de la solicitud
    headers = {
        "Content-Type": "application/json"
    }
 
    # Cuerpo de la solicitud (body)
    data = {
      "consoleType": 1,
        "password": "S0ND425*",
        "providerId": 0,
        "userName": "mathias_ia@sonda.com"
    }
 
    # Realizamos la solicitud POST
    response = requests.post(url, headers=headers, data=json.dumps(data))
 
    # Verificamos si la solicitud fue exitosa
 
    if response.status_code == 200:
        print("✔️ Se Conectó Correctamente")
        data = response.json()
        print(data)  # Mostrar la respuesta de la API
 
        # Acceder a los tokens
        token = data['token']
        renew_token = data['renewToken']
 
        # Imprimir uno o ambos
        print("Token principal:", token)
        url = "https://itsm.sonda.com/asmsapi/api/v9/item/"
 
    headers = {
        "Content-Type": "application/json",
        "X-Authorization": "Bearer" + token
 
    }
 
    payload = {
        "applicantId": 589722,
        "categoryId": 6941,
        "companyId": 20,
        "contractId": 20,
        "consoleType": "specialist",
        "currentTime": 0,
        "customerId": 589722,
        "description": "Ticket via SONDA Click PC: ",
        "foregroundColorRgb": "",
        "groupId": 1172,
        "impactId": 13,
        "instance": 1678298663558,
        "isFeeAvailable": True,
        "itemType": 4,
        "itemVersion": 0,
        "modelId": 13,
        "priorityReason": "",
        "projectId": 17,
        "reasonId": 483,
        "registryTypeId": 73412,
        "serviceId": 256,
        "stateId": 71,
        "subject": "Ticket via SONDA Click PC ",
        "surveyToken": "",
        "listAdditionalField": [{}],
        "tempItemId": -1
    }
 
 
    response = requests.post(url, headers=headers, json=payload)
 
    # Mostrar respuesta
    if response.status_code == 200 or response.status_code == 201:
         print("✔️ Ticket creado:")
         print(response.json())
    else:
            print(f"❌ Error {response.status_code}: {response.text}")
 
                    # Enviar SMS
    url = "https://api.smsmasivos.com.mx/sms/send"
    headers = {
                "apikey": "934048b4b02d254993e1e09ce07068a12829cc73",
                "Content-Type": "application/json"
            }
    data = {
                "message": "Error en Conexion de Servidor Aranda",
                "numbers": "6623292635",
                "country_code": "52"
            }
    response = requests.post(url, headers=headers, data=json.dumps(data))
    if response.status_code == 200:
                print("Los Datos se Actualizaron Correctamente")
                print(response.json())
    else:
                print(f"Error al enviar SMS. Código de estado: {response.status_code}")
                print(response.text)
 
# Código principal - ejecución del programa
if __name__ == "__main__":
    # Opción 1: Ejecutar inmediatamente para pruebas
    # ejecutar_tarea()
    
    # Opción 2: Programar con el scheduler
    print("Programando tarea para las 17:20...")
    scheduler = BlockingScheduler()
    scheduler.add_job(ejecutar_tarea, 'cron', hour=17, minute=20)
    scheduler.start()