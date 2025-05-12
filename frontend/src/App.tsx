import React, { useEffect, useState } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Example from "../components/Example";
import PasswordChangeButton from "../components/PasswordChangeButton";
import { useDomainCheck } from "./hooks/useDomainCheck";

// Definición de interfaces actualizada
interface MemoryInfo {
  used: number;
  total: number;
  percent: number;
  free: number;
  available: number;
}

interface PasswordChangeResponse {
  success: boolean;
  message: string;
}

interface DiskUsage {
  percent: number;
  used: number;
  total: number;
  free: number;
}

interface SystemTemperatures {
  cpu?: number;
  gpu?: number;
  [key: string]: number | undefined;
}

interface NetworkInterface {
  name: string;
  ip: string | null;
  mac: string | null;
}

interface SystemInfo {
  user: string;
  hostname: string;
  cpu_percent: number;
  memory: MemoryInfo;
  cpu_speed: number | null;
  temperatures: SystemTemperatures;
  gpu_temp: number | null;
  ip_local: string;
  ip_public: string;
  disk_usage: DiskUsage | null;
  serial_number: string;
  network_interfaces: NetworkInterface[];
  manufacturer: string;
  model: string;
  os: string;
  domain: string;
}

function App(): React.ReactElement {
  const [isFirstLoad, setIsFirstLoad] = useState<boolean>(true);
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [hasShownSuccessToast, setHasShownSuccessToast] =
    useState<boolean>(false);
  const { isInDomain, isLoading: isDomainLoading } = useDomainCheck();

  console.log("HOOK VALS - isDomainLoading:", isDomainLoading, "isInDomain:", isInDomain);
  if (info) {
    console.log("INFO VAL - info.domain:", info.domain);
  }

  // Determinar si el botón de cambio de contraseña debe mostarse
  let shouldShowPasswordButton = false;
  if (info && !isDomainLoading && isInDomain) {
    //Condición base: estar en dominio y que la carga termine
    shouldShowPasswordButton = true;
    console.log("ButtonLogic: Entró al IF principal (debería estar en dominio)");

    if (info.domain && info.domain.toUpperCase() === "WORKGROUP") {
      // Si el dominio es "WORKGROUP", no mostrar el botón
      shouldShowPasswordButton = false;
      console.log("ButtonLogic: Dominio es WORKGROUP, ocultando botón");
    }
  } else {
    console.log("ButtonLogic: NO entró al IF principal (debería estar fuera de dominio o cargando)");
  }
  console.log("ButtonLogic: Final shouldShowPasswordButton:", shouldShowPasswordButton);


  useEffect(() => {
    const fetchInfo = async (): Promise<void> => {
      try {
        if (isFirstLoad) {
          setLoading(true);
        }

        const res = await fetch("http://localhost:5000/api/system-info");
        if (!res.ok) {
          throw new Error(`Error HTTP: ${res.status}`);
        }
        const data: SystemInfo = await res.json();
        setInfo(data);
        setError(null);

        // Mostrar la notificación de éxito solo la primera vez
        if (!hasShownSuccessToast && !toast.isActive("success-toast")) {
          toast.success("Datos cargados correctamente.", {
            toastId: "success-toast",
          });
          setHasShownSuccessToast(true); // Marcar como mostrada
        }
      } catch (err) {
        console.error("Error al obtener datos:", err);
        setError(
          "No se pudo conectar con el servidor. Verifica que el backend esté en ejecución."
        );
        toast.error("Fallo al conectar con el servidor.", { autoClose: false });
      } finally {
        setLoading(false);
        setIsFirstLoad(false); // Cambiar a false después de la primera carga
      }
    };

    fetchInfo();
    const interval = setInterval(fetchInfo, 5000);
    return () => clearInterval(interval);
  }, [hasShownSuccessToast, isFirstLoad]); // Dependencias ajustadas

  const getTemperatureColor = (temp: number | undefined | null): string => {
    if (temp === null || temp === undefined) return "text-gray-500";
    if (temp > 80) return "text-red-600 font-bold";
    if (temp > 60) return "text-amber-500 font-bold";
    return "text-green-600 font-bold";
  };

  const openTeamsApp = (): void => {
    window.open(
      "https://teams.microsoft.com/l/app/57015de2-555f-4942-bd43-dfa878ef098f?source=app-header-share-entrypoint",
      "_blank"
    );
  };

  const changePassword = async (
    username: string,
    oldPassword: string,
    newPassword: string
  ): Promise<string> => {
    try {
      const response = await fetch(
        "http://localhost:5000/api/change-password",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username,
            oldPassword,
            newPassword,
          }),
        }
      );

      const data: PasswordChangeResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Error al cambiar la contraseña");
      }

      return data.message;
    } catch (error) {
      console.error("Error al cambiar la contraseña:", error);
      throw error;
    }
  };

  const openNativePasswordChange = async (): Promise<void> => {
    try {
      const response = await fetch(
        "http://localhost:5000/api/open-password-dialog",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();
      if (!response.ok) {
        console.error(
          "Error al abrir el diálogo de cambio de contraseña:",
          data.message
        );
        // Mostrar error al usuario
        alert(`Error: ${data.message}`);
      } else {
        // Mostrar instrucciones al usuario
        alert(
          data.message || "Se ha iniciado el proceso de cambio de contraseña"
        );
      }
    } catch (error) {
      console.error("Error al conectar con el servidor:", error);
      alert(
        "No se pudo conectar con el servidor. Verifica que el backend esté en ejecución."
      );
    }
  };

  return (
    <div
      className="font-sans p-4 sm:p-6 md:p-8 max-w-7xl mx-auto"
      style={{ fontFamily: "Arial" }}
    >
      <ToastContainer
        position="top-right"
        autoClose={5000} // Cierre automático después de 5 segundos
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="colored" // o "dark" o "colored"
      />

      <div className="flex flex-col sm:flex-row justify-between items-center mb-4 sm:mb-6 gap-3">
        <h1 className="text-3xl sm:text-4xl font-semibold text-center sm:text-left w-full sm:w-auto">
          Monitoreo del Sistema
        </h1>

        {info && !loading && (
          <div className="flex-shrink-0 w-full sm:w-auto flex flex-col sm:flex-row gap-2 justify-center">
            {/* Solo mostrar el botón si está en un dominio */}
            {shouldShowPasswordButton && (
              <PasswordChangeButton
                useNativeDialog={false}
                changePassword={changePassword}
                onNativeDialogClick={openNativePasswordChange}
                showUserInfo={true}
                buttonText="Cambiar contraseña (Windows)"
                className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors"
                domainName={info.domain}
              />
            )}
            <Example onClick={openTeamsApp}>
              Levantar ticket con soporte
            </Example>
          </div>
        )}
      </div>

      {loading && (
        <p className="text-center text-lg">
          Cargando información del sistema...
        </p>
      )}

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 sm:px-4 sm:py-3 rounded mb-4">
          <p className="font-bold">Error</p>
          <p>{error}</p>
        </div>
      )}

      {info && !loading && (
        <div className="space-y-4 sm:space-y-6">
          {/* Información del Sistema */}
          <div className="bg-gray-50 p-3 sm:p-4 rounded-lg shadow-sm">
            <h2 className="text-lg sm:text-xl font-semibold mb-2">
              Información del Sistema
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
              <p className="text-sm sm:text-base">
                <strong>Usuario:</strong> {info.user}
              </p>
              <p className="text-sm sm:text-base">
                <strong>Hostname:</strong> {info.hostname}
              </p>
              <p className="text-sm sm:text-base">
                <strong>Sistema operativo:</strong> {info.os}
              </p>
              <p className="text-sm sm:text-base">
                <strong>Marca:</strong> {info.manufacturer}
              </p>
              <p className="text-sm sm:text-base">
                <strong>Modelo:</strong> {info.model}
              </p>
              <p className="text-sm sm:text-base">
                <strong>Número de Serie:</strong> {info.serial_number}
              </p>
              <p className="text-sm sm:text-base">
                <strong>Dominio:</strong> {info.domain}
              </p>
            </div>
          </div>

          {/* Rendimiento */}
          <div className="bg-blue-50 p-3 sm:p-4 rounded-lg shadow-sm">
            <h2 className="text-lg sm:text-xl font-semibold mb-2">
              Rendimiento
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <p className="text-sm sm:text-base">
                  <strong>Uso CPU:</strong> {info.cpu_percent}%
                </p>
                <div className="w-full bg-gray-200 rounded-full h-2 sm:h-2.5 mb-2 sm:mb-4">
                  <div
                    className="bg-blue-600 h-2 sm:h-2.5 rounded-full"
                    style={{ width: `${info.cpu_percent}%` }}
                  ></div>
                </div>
              </div>
              <p className="text-sm sm:text-base">
                <strong>Velocidad CPU:</strong>{" "}
                {info.cpu_speed
                  ? `${info.cpu_speed.toFixed(0)} MHz`
                  : "No disponible"}
              </p>
            </div>
          </div>

          {/* Memoria y Almacenamiento */}
          <div className="bg-purple-50 p-3 sm:p-4 rounded-lg shadow-sm">
            <h2 className="text-lg sm:text-xl font-semibold mb-2">
              Memoria y Almacenamiento
            </h2>
            <p className="text-sm sm:text-base">
              <strong>Memoria usada:</strong>{" "}
              {(info.memory.used / 1024 ** 3).toFixed(2)} GB /{" "}
              {(info.memory.total / 1024 ** 3).toFixed(2)} GB (
              {info.memory.percent}%)
            </p>
            <div className="w-full bg-gray-200 rounded-full h-2 sm:h-2.5 mb-2 sm:mb-4">
              <div
                className="bg-purple-600 h-2 sm:h-2.5 rounded-full"
                style={{ width: `${info.memory.percent}%` }}
              ></div>
            </div>

            {info.disk_usage && (
              <>
                <p className="text-sm sm:text-base">
                  <strong>Uso del Disco Duro:</strong> {info.disk_usage.percent}
                  % ({(info.disk_usage.used / 1024 ** 3).toFixed(2)} GB usados
                  de {(info.disk_usage.total / 1024 ** 3).toFixed(2)} GB)
                </p>
                <div className="w-full bg-gray-200 rounded-full h-2 sm:h-2.5 mb-2 sm:mb-4">
                  <div
                    className="bg-green-600 h-2 sm:h-2.5 rounded-full"
                    style={{ width: `${info.disk_usage.percent}%` }}
                  ></div>
                </div>
              </>
            )}
          </div>

          {/* Temperaturas - versión móvil compacta */}
          <div className="block sm:hidden bg-amber-50 p-3 rounded-lg shadow-sm">
            <h2 className="text-lg font-semibold mb-2">Temperaturas</h2>
            <div className="flex justify-between">
              <p className="text-sm">
                <strong>CPU:</strong>{" "}
                <span className={getTemperatureColor(info.temperatures?.cpu)}>
                  {info.temperatures?.cpu !== undefined
                    ? `${info.temperatures.cpu.toFixed(1)}°C`
                    : "N/D"}
                </span>
              </p>
              <p className="text-sm">
                <strong>GPU:</strong>{" "}
                <span className={getTemperatureColor(info.gpu_temp)}>
                  {info.gpu_temp !== null ? `${info.gpu_temp}°C` : "N/D"}
                </span>
              </p>
            </div>
          </div>

          {/* Temperaturas - versión normal */}
          <div className="hidden sm:block bg-amber-50 p-4 rounded-lg shadow-sm">
            <h2 className="text-xl font-semibold mb-2">Temperaturas</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <p className="text-base">
                <strong>Temp. CPU:</strong>{" "}
                <span className={getTemperatureColor(info.temperatures?.cpu)}>
                  {info.temperatures?.cpu !== undefined
                    ? `${info.temperatures.cpu.toFixed(1)} °C`
                    : "No disponible"}
                </span>
              </p>
              <p className="text-base">
                <strong>Temp. GPU:</strong>{" "}
                <span className={getTemperatureColor(info.gpu_temp)}>
                  {info.gpu_temp !== null
                    ? `${info.gpu_temp} °C`
                    : "No disponible"}
                </span>
              </p>
            </div>
          </div>

          {/* Red */}
          <div className="bg-green-50 p-3 sm:p-4 rounded-lg shadow-sm">
            <h2 className="text-lg sm:text-xl font-semibold mb-2">
              Información de Red
            </h2>
            <p className="text-sm sm:text-base">
              <strong>IP local:</strong> {info.ip_local}
            </p>
            <p className="text-sm sm:text-base mb-2">
              <strong>IP pública:</strong> {info.ip_public}
            </p>

            {info.network_interfaces.length > 0 && (
              <div className="mt-2">
                <p className="font-semibold text-sm sm:text-base">
                  Interfaces de red:
                </p>
                <div className="pl-2 sm:pl-4 mt-2">
                  {info.network_interfaces.map((iface, index) => (
                    <div
                      key={index}
                      className="mb-2 p-2 bg-green-100 rounded-md"
                    >
                      <p className="font-bold text-sm sm:text-base">
                        {iface.name}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs sm:text-sm">
                        <p>IP: {iface.ip || "No disponible"}</p>
                        <p>MAC: {iface.mac || "No disponible"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
