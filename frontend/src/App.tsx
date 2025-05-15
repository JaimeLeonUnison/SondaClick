import React, { useEffect, useState, useCallback } from "react";
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

// NUEVA INTERFAZ para la respuesta de /api/check-notification
interface NotificationCheckResponse {
  success: boolean;
  ticketId: string | null;
  macAddress?: string; // macAddress es opcional en la respuesta si no hay ticket
  message?: string;
}

// NUEVA INTERFAZ para la respuesta de /api/acknowledge-notification
interface AcknowledgeNotificationResponse {
  success: boolean;
  message: string;
}

// NUEVA INTERFAZ para un item del historial de notificaciones
interface NotificationHistoryItem {
  ticketId: string;
  fechaIncidente: string; // O el nombre del campo que uses para la fecha
  mensaje: string; // O una descripción del incidente
  estatus: string; // O el estado actual del ticket/notificación
  // Añade otros campos que quieras mostrar, ej: UsoCPU, UsoMemoria, etc.
}

// NUEVA INTERFAZ para la respuesta del historial
interface NotificationHistoryResponse {
  success: boolean;
  history?: NotificationHistoryItem[];
  message?: string;
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

  // ESTADOS PARA EL MODAL DE HISTORIAL
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  const [notificationHistory, setNotificationHistory] = useState<NotificationHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);


  const [activeNotificationTicketId, setActiveNotificationTicketId] = useState<string | null>(null);

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

  // FUNCIÓN PARA OBTENER Y MOSTRAR EL HISTORIAL DE NOTIFICACIONES
  const fetchAndShowHistory = async () => {
    setIsLoadingHistory(true);
    setHistoryError(null);
    try {
      const response = await fetch("http://localhost:5000/api/notifications-history"); // Asegúrate que este endpoint exista en tu backend
      const data: NotificationHistoryResponse = await response.json();
      if (response.ok && data.success && data.history) {
        setNotificationHistory(data.history);
      } else {
        setNotificationHistory([]);
        setHistoryError(data.message || "No se pudo cargar el historial.");
        toast.error(data.message || "Error al cargar el historial de notificaciones.");
      }
    } catch (err) {
      console.error("[App.tsx - fetchAndShowHistory] Error:", err);
      setNotificationHistory([]);
      setHistoryError("Error de conexión al cargar el historial.");
      toast.error("Error de conexión al cargar el historial de notificaciones.");
    } finally {
      setIsLoadingHistory(false);
      setIsHistoryModalOpen(true); // Abrir el modal después de intentar cargar
    }
  };


  // Función para marcar una notificación como leída
  const acknowledgeNotification = useCallback(async (ticketId: string) => {
    console.log(`[App.tsx - acknowledgeNotification] Acusando recibo del ticket: ${ticketId}`);
    try {
      const response = await fetch("http://localhost:5000/api/acknowledge-notification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ticketId }),
      });
      const data: AcknowledgeNotificationResponse = await response.json();
      if (response.ok && data.success) {
        toast.success(`Notificación ${ticketId} marcada como leída.`);
        setActiveNotificationTicketId(null); // Limpiar el ticket activo
        toast.dismiss(`ticket-${ticketId}`); // Cierra el toast específico si aún está abierto
      } else {
        toast.error(data.message || "Error al marcar la notificación como leída.");
      }
    } catch (err) {
      console.error("[App.tsx - acknowledgeNotification] Error:", err);
      toast.error("Error de conexión al marcar la notificación.");
    }
  }, []);

  // useEffect para verificar notificaciones pendientes
  useEffect(() => {
    const checkPendingNotifications = async () => {
      console.log("[App.tsx - checkPendingNotifications] Verificando notificaciones...");
      try {
        const response = await fetch("http://localhost:5000/api/check-notification");
        if (!response.ok) {
          console.error("[App.tsx - checkPendingNotifications] Error HTTP:", response.status);
          // No mostrar toast de error aquí para no ser intrusivo,
          // ya que esto se ejecuta en segundo plano.
          return;
        }
        const data: NotificationCheckResponse = await response.json();
        console.log("[App.tsx - checkPendingNotifications] Respuesta:", data);

        if (data.success && data.ticketId) {
          // Si es un nuevo ticket o no hay uno activo actualmente siendo mostrado
          if (data.ticketId !== activeNotificationTicketId) {
             // Si ya hay un toast para un ticket anterior, ciérralo antes de mostrar el nuevo.
            if (activeNotificationTicketId && toast.isActive(`ticket-${activeNotificationTicketId}`)) {
              toast.dismiss(`ticket-${activeNotificationTicketId}`);
            }

            setActiveNotificationTicketId(data.ticketId);
            const toastId = `ticket-${data.ticketId}`;

            if (!toast.isActive(toastId)) {
              toast.info(() => (
                <div>
                  <p className="font-semibold">¡Nueva Notificación Pendiente!</p>
                  <p>Ticket ID: {data.ticketId}</p>
                  <p>Por favor, atienda esta notificación.</p>
                  <button
                    onClick={() => {
                      acknowledgeNotification(data.ticketId as string);
                      // closeToast(); // No es necesario si acknowledgeNotification ya cierra el toast por ID
                    }}
                    className="mt-2 px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                  >
                    Marcar como Atendido
                  </button>
                </div>
              ), {
                toastId: toastId,
                autoClose: false, // El usuario debe cerrarlo o interactuar
                closeOnClick: false, // Evitar que se cierre al hacer clic en el cuerpo del toast
                onClose: () => {
                  // Si el usuario cierra el toast manualmente sin usar el botón,
                  // podríamos querer resetear activeNotificationTicketId si el ticket no fue acusado.
                  // Esto es para evitar que el mismo toast reaparezca inmediatamente si el backend aún lo envía.
                  // Sin embargo, si el usuario lo cierra, es una forma de "ignorar temporalmente".
                  // Si el ticketId que se cerró es el activo, lo limpiamos para permitir que se muestre de nuevo si persiste.
                  if (activeNotificationTicketId === data.ticketId) {
                     // setActiveNotificationTicketId(null); // Comentado para reevaluar si es el mejor comportamiento
                  }
                }
              });
            }
          }
        } else if (data.success && !data.ticketId && activeNotificationTicketId) {
          // Si no hay ticketId del backend pero teníamos uno activo, significa que se resolvió o ya no está pendiente.
          // Podemos cerrar el toast si aún está activo.
          if (toast.isActive(`ticket-${activeNotificationTicketId}`)) {
            toast.dismiss(`ticket-${activeNotificationTicketId}`);
          }
          setActiveNotificationTicketId(null);
        }
      } catch (err) {
        console.error("[App.tsx - checkPendingNotifications] Error al verificar notificaciones:", err);
      }
    };

    // Verificar inmediatamente y luego cada 10 segundos (ajusta según necesidad)
    checkPendingNotifications();
    const notificationInterval = setInterval(checkPendingNotifications, 10000); // 10 segundos

    return () => {
      clearInterval(notificationInterval);
    };
  }, [activeNotificationTicketId, acknowledgeNotification]); // Incluir acknowledgeNotification

  useEffect(() => {
    const fetchInfo = async (): Promise<void> => {
      console.log("[App.tsx - fetchInfo] Iniciando fetch de system-info."); // NUEVO
      try {
        if (isFirstLoad) {
          setLoading(true);
        }

        const res = await fetch("http://localhost:5000/api/system-info");
        console.log("[App.tsx - fetchInfo] Respuesta de system-info, status:", res.status); // NUEVO
        if (!res.ok) {
          const errorText = await res.text(); // NUEVO: Intenta obtener más detalles del error
          console.error("[App.tsx - fetchInfo] Error HTTP no OK:", res.status, errorText); // NUEVO
          throw new Error(`Error HTTP: ${res.status} - ${errorText}`);
        }
        const data: SystemInfo = await res.json();
        console.log("[App.tsx - fetchInfo] Datos de system-info recibidos:", data); // NUEVO
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
        // Ya tienes un console.error aquí, lo cual es bueno.
        console.error("[App.tsx - fetchInfo] Error al obtener datos de system-info:", err);
        setError(
          "No se pudo conectar con el servidor. Verifica que el backend esté en ejecución."
        );
        toast.error("Fallo al conectar con el servidor.", { autoClose: false });
      } finally {
        console.log("[App.tsx - fetchInfo] Fetch de system-info finalizado."); // NUEVO
        setLoading(false);
        setIsFirstLoad(false);
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
    console.log("[App.tsx - changePassword] Intentando cambiar contraseña para usuario:", username); // NUEVO
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
            oldPassword, // Considera no loguear contraseñas directamente en producción final
            newPassword, // Considera no loguear contraseñas directamente en producción final
          }),
        }
      );
      console.log("[App.tsx - changePassword] Respuesta de change-password, status:", response.status); // NUEVO

      const data: PasswordChangeResponse = await response.json();
      console.log("[App.tsx - changePassword] Datos de change-password recibidos:", data); // NUEVO

      if (!response.ok) {
        throw new Error(data.message || "Error al cambiar la contraseña");
      }

      return data.message;
    } catch (error) {
      // Ya tienes un console.error aquí.
      console.error("[App.tsx - changePassword] Error al cambiar la contraseña:", error);
      throw error;
    }
  };

  const openNativePasswordChange = async (): Promise<void> => {
    console.log("[App.tsx - openNativePasswordChange] Intentando abrir diálogo nativo de cambio de contraseña."); // NUEVO
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
      console.log("[App.tsx - openNativePasswordChange] Respuesta de open-password-dialog, status:", response.status); // NUEVO

      const data = await response.json();
      console.log("[App.tsx - openNativePasswordChange] Datos de open-password-dialog recibidos:", data); // NUEVO
      if (!response.ok) {
        console.error(
          "[App.tsx - openNativePasswordChange] Error al abrir el diálogo de cambio de contraseña:",
          data.message
        );
        alert(`Error: ${data.message}`);
      } else {
        alert(
          data.message || "Se ha iniciado el proceso de cambio de contraseña"
        );
      }
    } catch (error) {
      // Ya tienes un console.error aquí.
      console.error("[App.tsx - openNativePasswordChange] Error al conectar con el servidor:", error);
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
            {/* BOTÓN PARA VER HISTORIAL DE NOTIFICACIONES */}
            <Example
              onClick={fetchAndShowHistory}
              disabled={isLoadingHistory}
              className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors"
            >
              {isLoadingHistory ? "Cargando..." : "Ver notificaciones pasadas"}
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

      {/* MODAL PARA EL HISTORIAL DE NOTIFICACIONES */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-5 rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Historial de Notificaciones</h2>
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
                aria-label="Cerrar modal"
              >
                &times;
              </button>
            </div>
            <div className="overflow-y-auto flex-grow">
              {isLoadingHistory && <p className="text-center">Cargando historial...</p>}
              {!isLoadingHistory && historyError && (
                <p className="text-center text-red-500">{historyError}</p>
              )}
              {!isLoadingHistory && !historyError && notificationHistory.length === 0 && (
                <p className="text-center text-gray-500">No hay notificaciones pasadas.</p>
              )}
              {!isLoadingHistory && !historyError && notificationHistory.length > 0 && (
                <ul className="space-y-3">
                  {notificationHistory.map((item) => (
                    <li key={item.ticketId} className="p-3 bg-gray-100 rounded-md shadow-sm">
                      <p className="font-semibold text-sm">Ticket: <span className="font-normal">{item.ticketId}</span></p>
                      <p className="text-xs text-gray-600">Fecha: <span className="font-normal">{new Date(item.fechaIncidente).toLocaleString()}</span></p>
                      <p className="text-sm mt-1">Mensaje: <span className="font-normal">{item.mensaje}</span></p>
                      <p className="text-xs">Estatus: <span className="font-normal">{item.estatus}</span></p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              onClick={() => setIsHistoryModalOpen(false)}
              className="mt-4 bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg self-end"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;