import React, { useEffect, useState } from "react";
import Example from "../components/Example"; // Asegúrate de que la ruta sea correcta
// Definición de interfaces para los datos
interface MemoryInfo {
  used: number;
  total: number;
}

interface DiskUsage {
  percent: number;
  used: number;
  total: number;
}

interface SystemInfo {
  cpu_percent: number;
  memory: MemoryInfo;
  cpu_speed: number | null;
  gpu_temp: number | null;
  ip_local: string;
  ip_public: string;
  disk_usage: DiskUsage | null;
  os: string;
  manufacturer: string;
  model: string;
  domain: string;
}

function App(): React.ReactElement {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [message, setMessage] = useState<string>("Cargando...");

  const fetchInfo = async (): Promise<void> => {
    try {
      const res = await fetch("http://localhost:5000/api/system-info");
      const data: SystemInfo = await res.json();
      setInfo(data);
    } catch (err) {
      console.error("Error al obtener datos:", err);
    }
  };

  useEffect(() => {
    fetchInfo();
    const interval = setInterval(fetchInfo, 5000); // Actualiza cada 5 segundos
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      document.cookie.split(";").forEach(function (c) {
        // Eliminar cookies en el navegador
        document.cookie =
          c.trim().split("=")[0] +
          "=;expires=" +
          new Date(0).toUTCString() +
          ";path=/";
      });

      setMessage("Las cookies han sido eliminadas con éxito."); // Actualiza el mensaje en el estado
    }, 3000);

    return () => clearTimeout(timer); // Limpieza si se desmonta el componente
  }, []);

  const openTeamsApp = (): void => {
    window.open(
      "https://teams.microsoft.com/l/app/57015de2-555f-4942-bd43-dfa878ef098f?source=app-header-share-entrypoint",
      "_blank"
    );
  };

  return (
    <div className="font-sans p-8 ml-16" style={{ fontFamily: "Arial" }}>
      <h1 className="text-4xl font-semibold mb-6 text-center">
        Monitor del Sistema
      </h1>
      {info ? (
        <div className="space-y-4">
          <p className="text-lg">
            <strong>Uso CPU:</strong> {info.cpu_percent}%
          </p>
          <p className="text-lg">
            <strong>Memoria usada:</strong>{" "}
            {(info.memory.used / 1024 ** 3).toFixed(2)} GB /{" "}
            {(info.memory.total / 1024 ** 3).toFixed(2)} GB
          </p>
          <p className="text-lg">
            <strong>Velocidad CPU:</strong>{" "}
            {info.cpu_speed
              ? `${info.cpu_speed.toFixed(0)} MHz`
              : "No disponible"}
          </p>
          <p className="text-lg">
            <strong>Temp. GPU:</strong>{" "}
            {info.gpu_temp !== null ? `${info.gpu_temp} °C` : "No disponible"}
          </p>
          <p className="text-lg">
            <strong>IP local:</strong> {info.ip_local}
          </p>
          <p className="text-lg">
            <strong>IP pública:</strong> {info.ip_public}
          </p>
          {info.disk_usage ? (
            <p className="text-lg">
              <strong>Uso del Disco Duro:</strong> {info.disk_usage.percent}% (
              {(info.disk_usage.used / 1024 ** 3).toFixed(2)} GB usados de{" "}
              {(info.disk_usage.total / 1024 ** 3).toFixed(2)} GB)
            </p>
          ) : (
            <p className="text-lg">Uso del Disco Duro: No disponible</p>
          )}
          <p className="text-lg">
            <strong>Sistema operativo:</strong> {info.os}
          </p>
          <p className="text-lg">
            <strong>Marca:</strong> {info.manufacturer}
          </p>
          <p className="text-lg">
            <strong>Modelo:</strong> {info.model}
          </p>
          <p className="text-lg">
            <strong>Dominio:</strong> {info.domain}
          </p>
          <p className="text-lg">
            <strong>Estado de las cookies:</strong> {message}
          </p>
        </div>
      ) : (
        <p className="text-lg text-center">Cargando datos del sistema...</p>
      )}
      {/* Aquí pasas el texto como children */}
      <Example onClick={openTeamsApp}>
        Levantar ticket con Mat-IAS SONDA
      </Example>
    </div>
  );
}

export default App;