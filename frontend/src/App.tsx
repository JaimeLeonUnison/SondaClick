import React, { useEffect, useState, useCallback } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Example from "../components/Example";
import PasswordChangeButton from "../components/PasswordChangeButton";
import { useDomainCheck } from "./hooks/useDomainCheck";
import { TailwindAccordion } from "../components/AccordionItem";

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

//Interfaz para la respuesta del endpoint de validación de registro
interface ValidationResponse {
  success: boolean;
  message: string;
  //token?: string; // Si decides usar un token para la validación
}

// NUEVA INTERFAZ para un item del historial de notificaciones
interface NotificationHistoryItem {
  ticketId: string;
  fechaTicket: string; // O el nombre del campo que uses para la fecha
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
  const [notificationHistory, setNotificationHistory] = useState<
    NotificationHistoryItem[]
  >([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // NUEVOS ESTADOS PARA EL MODAL DE VALIDACIÓN/REGISTRO
  const [isRegistered, setIsRegistered] = useState<boolean>(() => {
    return localStorage.getItem("isAppValidated") === "true";
  });
  const [isValidationModalOpen, setIsValidationModalOpen] =
    useState<boolean>(false);
  const [validationEmail, setValidationEmail] = useState<string>("");
  const [validationProjectId, setValidationProjectId] = useState<string>("");
  const [validationLoading, setValidationLoading] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [activeNotificationTicketId, setActiveNotificationTicketId] = useState<
    string | null
  >(null);
  const [isTestButtonVisible, setIsTestButtonVisible] =
    useState<boolean>(false);

  console.log(
    "HOOK VALS - isDomainLoading:",
    isDomainLoading,
    "isInDomain:",
    isInDomain
  );
  if (info) {
    console.log("INFO VAL - info.domain:", info.domain);
  }

  // Determinar si el botón de cambio de contraseña debe mostarse
  let shouldShowPasswordButton = false;
  if (info && !isDomainLoading && isInDomain) {
    //Condición base: estar en dominio y que la carga termine
    shouldShowPasswordButton = true;
    console.log(
      "ButtonLogic: Entró al IF principal (debería estar en dominio)"
    );

    if (info.domain && info.domain.toUpperCase() === "WORKGROUP") {
      // Si el dominio es "WORKGROUP", no mostrar el botón
      shouldShowPasswordButton = false;
      console.log("ButtonLogic: Dominio es WORKGROUP, ocultando botón");
    }
  } else {
    console.log(
      "ButtonLogic: NO entró al IF principal (debería estar fuera de dominio o cargando)"
    );
  }
  console.log(
    "ButtonLogic: Final shouldShowPasswordButton:",
    shouldShowPasswordButton
  );

  // FUNCIÓN PARA OBTENER Y MOSTRAR EL HISTORIAL DE NOTIFICACIONES
  const fetchAndShowHistory = async () => {
    setIsLoadingHistory(true);
    setHistoryError(null);
    try {
      const response = await fetch(
        "http://localhost:5000/api/notifications-history"
      ); // Asegúrate que este endpoint exista en tu backend
      const data: NotificationHistoryResponse = await response.json();
      if (response.ok && data.success && data.history) {
        setNotificationHistory(data.history);
      } else {
        setNotificationHistory([]);
        setHistoryError(data.message || "No se pudo cargar el historial.");
        toast.error(
          data.message || "Error al cargar el historial de notificaciones."
        );
      }
    } catch (err) {
      console.error("[App.tsx - fetchAndShowHistory] Error:", err);
      setNotificationHistory([]);
      setHistoryError("Error de conexión al cargar el historial.");
      toast.error(
        "Error de conexión al cargar el historial de notificaciones."
      );
    } finally {
      setIsLoadingHistory(false);
      setIsHistoryModalOpen(true); // Abrir el modal después de intentar cargar
    }
  };

  // Función para marcar una notificación como leída
  const acknowledgeNotification = useCallback(
    async (ticketId: string): Promise<boolean> => {
      // Modificado para devolver Promise<boolean>
      console.log(
        `[App.tsx - acknowledgeNotification] Acusando recibo del ticket: ${ticketId}`
      );
      try {
        const response = await fetch(
          "http://localhost:5000/api/acknowledge-notification",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ ticketId }),
          }
        );
        const data: AcknowledgeNotificationResponse = await response.json();
        if (response.ok && data.success) {
          toast.success(`Notificación ${ticketId} marcada como leída.`);
          setActiveNotificationTicketId(null); // Limpiar el ticket activo
          toast.dismiss(`ticket-${ticketId}`); // Cierra el toast específico si aún está abierto
          return true; // Indicar éxito
        } else {
          toast.error(
            data.message || "Error al marcar la notificación como leída."
          );
          // Lanzar un error o devolver false para que el llamador sepa que falló
          throw new Error(
            data.message || "Error al marcar la notificación como leída."
          );
        }
      } catch (err) {
        console.error("[App.tsx - acknowledgeNotification] Error:", err);
        // Asegurarse de que el toast de error se muestre si no lo hizo antes
        if (!(err instanceof Error && toast.isActive(err.message))) {
          // Evitar duplicar toasts si el error ya es el mensaje
          toast.error(
            (err instanceof Error ? err.message : String(err)) ||
              "Error de conexión al marcar la notificación."
          );
        }
        throw err; // Re-lanzar el error para que el llamador pueda manejarlo
      }
    },
    [setActiveNotificationTicketId]
  ); // Removido activeNotificationTicketId de las dependencias si no se usa directamente para leer su valor aquí

  // FUNCION PARA OBTENER LA DIRECCION MAC LOCAL
  // const getLocalMacAddress = async (): Promise<string | null> => {
  //   try {
  //     const response = await fetch("http://localhost:5000/api/get-local-mac-address");
  //     if (!response.ok) {
  //       console.error(`[App.tsx - getLocalMacAddress] Respuesta no OK: ${response.status} ${response.statusText}`);
  //       const errorBody = await response.text();
  //       console.error(`[App.tsx - getLocalMacAddress] Cuerpo del error: ${errorBody}`);
  //       throw new Error(`Error al obtener la dirección MAC local: ${response.status}`);
  //     }
  //     const data = await response.json();
  //     if (data && data.macAddress) {
  //       return data.macAddress;
  //     } else {
  //       console.warn("[App.tsx - getLocalMacAddress] La respuesta del backend no contenía macAddress o era inválida:", data);
  //       return null;
  //     }
  //   } catch (error) {
  //     console.error("[App.tsx - getLocalMacAddress] Catch Error:", error);
  //     return null;
  //   }
  // };

  const handleValidationSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    setValidationLoading(true);
    setValidationError(null);

    if (!validationEmail.trim() || !validationProjectId.trim()) {
      setValidationError("Por favor, complete todos los campos.");
      setValidationLoading(false);
      return;
    }

    // YA NO SE OBTIENE LA MAC AQUÍ DESDE EL FRONTEND
    // const macAddress = await getLocalMacAddress();
    // if (!macAddress || macAddress === "MAC_ADDRESS_PENDIENTE") {
    //     setValidationError("No se pudo obtener la dirección MAC. Esta es necesaria para el registro del dispositivo.");
    //     setValidationLoading(false);
    //     return;
    // }

    try {
      const requestBody = {
        email: validationEmail,
        projectId: validationProjectId,
        // YA NO SE ENVÍA macAddress desde el frontend
      };
      console.log(
        "[App.tsx - handleValidationSubmit] Enviando al backend:",
        JSON.stringify(requestBody, null, 2)
      );

      const response = await fetch(
        "http://localhost:5000/api/validate-credentials",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody), // Solo email y projectId
        }
      );

      const data: ValidationResponse = await response.json(); // Asumo que tienes ValidationResponse definida

      if (response.ok && data.success) {
        toast.success(
          data.message || "Acceso concedido. Iniciando aplicación."
        );
        localStorage.setItem("isAppValidated", "true");
        setIsRegistered(true);
        setIsValidationModalOpen(false);
      } else {
        setValidationError(
          data.message || "Credenciales inválidas o error en la validación."
        );
        toast.error(data.message || "Credenciales inválidas.");
      }
    } catch (err) {
      console.error("[App.tsx - handleValidationSubmit] Error:", err);
      setValidationError(
        "Error de conexión durante la validación. Verifique su conexión e intente de nuevo."
      );
      toast.error("Error de conexión durante la validación.");
    } finally {
      setValidationLoading(false);
    }
  };

  // useEffect para verificar notificaciones pendientes
  useEffect(() => {
    const checkPendingNotifications = async () => {
      console.log(
        "[App.tsx - checkPendingNotifications] Verificando notificaciones..."
      );
      try {
        const response = await fetch(
          "http://localhost:5000/api/check-notification"
        );
        if (!response.ok) {
          console.error(
            "[App.tsx - checkPendingNotifications] Error HTTP:",
            response.status
          );
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
            if (
              activeNotificationTicketId &&
              toast.isActive(`ticket-${activeNotificationTicketId}`)
            ) {
              toast.dismiss(`ticket-${activeNotificationTicketId}`);
            }

            setActiveNotificationTicketId(data.ticketId);
            const toastId = `ticket-${data.ticketId}`;

            if (!toast.isActive(toastId)) {
              toast.info(
                () => (
                  <div>
                    <p className="font-semibold">
                      ¡Nueva Notificación Pendiente!
                    </p>
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
                ),
                {
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
                  },
                }
              );
            }
          }
        } else if (
          data.success &&
          !data.ticketId &&
          activeNotificationTicketId
        ) {
          // Si no hay ticketId del backend pero teníamos uno activo, significa que se resolvió o ya no está pendiente.
          // Podemos cerrar el toast si aún está activo.
          if (toast.isActive(`ticket-${activeNotificationTicketId}`)) {
            toast.dismiss(`ticket-${activeNotificationTicketId}`);
          }
          setActiveNotificationTicketId(null);
        }
      } catch (err) {
        console.error(
          "[App.tsx - checkPendingNotifications] Error al verificar notificaciones:",
          err
        );
      }
    };

    // Verificar inmediatamente y luego cada 10 segundos (ajusta según necesidad)
    checkPendingNotifications();
    const notificationInterval = setInterval(checkPendingNotifications, 10000); // 10 segundos

    return () => {
      clearInterval(notificationInterval);
    };
  }, [activeNotificationTicketId, acknowledgeNotification]); // Incluir acknowledgeNotification

  // NUEVO useEffect para controlar el modal de validación
  useEffect(() => {
    if (!isRegistered) {
      // Si no está validado/registrado
      setIsValidationModalOpen(true);
    } else {
      setIsValidationModalOpen(false);
    }
  }, [isRegistered, setIsValidationModalOpen]); // Depende de isRegistered y su setter

  const fetchInfo = useCallback(async (): Promise<void> => {
    console.log("[App.tsx - fetchInfo] Iniciando fetch de system-info.");
    try {
      if (isFirstLoad) {
        setLoading(true);
      }

      const res = await fetch("http://localhost:5000/api/system-info");
      console.log(
        "[App.tsx - fetchInfo] Respuesta de system-info, status:",
        res.status
      );
      if (!res.ok) {
        const errorText = await res.text();
        console.error(
          "[App.tsx - fetchInfo] Error HTTP no OK:",
          res.status,
          errorText
        );
        throw new Error(`Error HTTP: ${res.status} - ${errorText}`);
      }
      const data: SystemInfo = await res.json();
      console.log(
        "[App.tsx - fetchInfo] Datos de system-info recibidos:",
        data
      );
      setInfo(data);
      setError(null);

      if (
        isFirstLoad &&
        !hasShownSuccessToast &&
        !toast.isActive("success-toast")
      ) {
        toast.success("Datos cargados correctamente.", {
          toastId: "success-toast",
        });
        setHasShownSuccessToast(true);
      }
    } catch (err) {
      console.error(
        "[App.tsx - fetchInfo] Error al obtener datos de system-info:",
        err
      );
      setError(
        "No se pudo conectar con el servidor. Verifica que el backend esté en ejecución."
      );
      if (isFirstLoad) {
        // Solo mostrar toast de error en la carga inicial
        toast.error("Fallo al conectar con el servidor.", { autoClose: false });
      }
    } finally {
      console.log("[App.tsx - fetchInfo] Fetch de system-info finalizado.");
      if (isFirstLoad) {
        setLoading(false);
        setIsFirstLoad(false);
      }
    }
  }, [
    isFirstLoad,
    hasShownSuccessToast,
    setLoading,
    setInfo,
    setError,
    setHasShownSuccessToast,
    setIsFirstLoad,
  ]);

  // useEffect para obtener información del sistema periódicamente si está registrado
  useEffect(() => {
    if (isRegistered) {
      fetchInfo(); // Llamada inicial al registrarse o si ya estaba registrado
      const interval = setInterval(fetchInfo, 5000);
      return () => clearInterval(interval);
    }
  }, [isRegistered, fetchInfo]);

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
    console.log(
      "[App.tsx - changePassword] Intentando cambiar contraseña para usuario:",
      username
    ); // NUEVO
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
      console.log(
        "[App.tsx - changePassword] Respuesta de change-password, status:",
        response.status
      ); // NUEVO

      const data: PasswordChangeResponse = await response.json();
      console.log(
        "[App.tsx - changePassword] Datos de change-password recibidos:",
        data
      ); // NUEVO

      if (!response.ok) {
        throw new Error(data.message || "Error al cambiar la contraseña");
      }

      return data.message;
    } catch (error) {
      // Ya tienes un console.error aquí.
      console.error(
        "[App.tsx - changePassword] Error al cambiar la contraseña:",
        error
      );
      throw error;
    }
  };

  const openNativePasswordChange = async (): Promise<void> => {
    console.log(
      "[App.tsx - openNativePasswordChange] Intentando abrir diálogo nativo de cambio de contraseña."
    ); // NUEVO
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
      console.log(
        "[App.tsx - openNativePasswordChange] Respuesta de open-password-dialog, status:",
        response.status
      ); // NUEVO

      const data = await response.json();
      console.log(
        "[App.tsx - openNativePasswordChange] Datos de open-password-dialog recibidos:",
        data
      ); // NUEVO
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
      console.error(
        "[App.tsx - openNativePasswordChange] Error al conectar con el servidor:",
        error
      );
      alert(
        "No se pudo conectar con el servidor. Verifica que el backend esté en ejecución."
      );
    }
  };

  // NUEVA FUNCIÓN PARA CERRAR SESIÓN (LIMPIAR VALIDACIÓN)
  const handleLogoutForTesting = () => {
    localStorage.removeItem("isAppValidated");
    setIsRegistered(false);
    setIsTestButtonVisible(false); // Opcional: ocultar el botón después de usarlo
    toast.info(
      "Sesión de prueba cerrada. El modal de validación debería aparecer."
    );
  };

  // useEffect para controlar el modal de validación
  useEffect(() => {
    if (!isRegistered) {
      setIsValidationModalOpen(true);
    } else {
      setIsValidationModalOpen(false);
    }
  }, [isRegistered, setIsValidationModalOpen]);

  // useEffect PARA ESCUCHAR LA COMBINACIÓN DE TECLAS
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ejemplo: Ctrl + Alt + L para mostrar/ocultar el botón de prueba
      if (event.ctrlKey && event.altKey && event.key === "l") {
        // 'l' minúscula
        event.preventDefault(); // Prevenir acciones por defecto del navegador si las hubiera
        setIsTestButtonVisible((prev) => !prev); // Alternar visibilidad
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    // Limpieza del event listener cuando el componente se desmonte
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []); // El array vacío asegura que esto se ejecute solo al montar y desmontar

  // Define los items para el acordeón DENTRO del componente App,
  // idealmente donde tengas acceso a `info` si el contenido depende de ello.
  let accordionSections: Array<{
    id: string;
    title: string;
    content: React.ReactNode;
  }> = [];
  if (info) {
    // Asegúrate que `info` no sea null
    accordionSections = [
      {
        id: "system-info",
        title: "Información del Sistema",
        content: (
          // Contenido interno de tu tarjeta original, sin el div contenedor de la tarjeta
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
        ),
      },
      {
        id: "performance",
        title: "Rendimiento",
        content: (
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
        ),
      },
      {
        id: "memory-storage",
        title: "Memoria y Almacenamiento",
        content: (
          <>
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
          </>
        ),
      },
      {
        id: "temperatures",
        title: "Temperaturas",
        content: (
          // Combina ambas versiones de temperatura o elige una
          // Aquí un ejemplo combinando con visibilidad condicional si es necesario,
          // o simplemente pon el contenido que prefieras.
          <>
            {/* Versión móvil compacta (si quieres mantenerla separada) */}
            <div className="block sm:hidden">
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
            {/* Versión normal (si quieres mantenerla separada) */}
            <div className="hidden sm:block">
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
          </>
        ),
      },
      {
        id: "network-info",
        title: "Información de Red",
        content: (
          <>
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
                      className="mb-2 p-2 bg-green-100 rounded-md" // Puedes mantener estos estilos internos o simplificar
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
          </>
        ),
      },
    ];
  }

  return (
    <>
      {isValidationModalOpen && (
        <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center p-4 z-[100]">
          <div className="bg-white p-6 sm:p-8 rounded-lg shadow-2xl w-full max-w-md">
            <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">
              Validación de Acceso
            </h2>
            <p className="text-sm text-gray-600 mb-6 text-center">
              Por favor, ingrese su correo electrónico y el ID del Proyecto
              asignado para continuar.
            </p>
            <form onSubmit={handleValidationSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="val-email"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Correo Electrónico:
                </label>
                <input
                  type="email"
                  id="val-email"
                  value={validationEmail}
                  onChange={(e) => setValidationEmail(e.target.value)}
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="su.correo@ejemplo.com"
                />
              </div>
              <div>
                <label
                  htmlFor="val-projectid"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  ID del Proyecto:
                </label>
                <input
                  type="text"
                  id="val-projectid"
                  value={validationProjectId}
                  onChange={(e) => setValidationProjectId(e.target.value)}
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="ID de su proyecto"
                />
              </div>
              {validationError && (
                <p className="text-xs text-red-600 bg-red-100 p-2 rounded-md text-center">
                  {validationError}
                </p>
              )}
              <button
                type="submit"
                disabled={validationLoading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400"
              >
                {validationLoading ? "Validando..." : "Validar y Continuar"}
              </button>
            </form>
          </div>
        </div>
      )}
      {!isValidationModalOpen && ( // Solo renderizar el contenido principal si el modal no está abierto
        <div
          className="font-sans p-4 sm:p-6 md:p-8 max-w-7xl mx-auto h-screen overflow-y-auto no-scrollbar" // <-- AÑADE no-scrollbar AQUÍ
          // style={{ fontFamily: "Arial" }} // Tailwind maneja font-sans, puedes quitar esto si Roboto está configurado
        >
          <ToastContainer
            position="bottom-center"
            autoClose={5000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="colored"
          />

          {/* BOTÓN DE PRUEBA PARA CERRAR SESIÓN (AHORA CONDICIONAL) */}
          {isTestButtonVisible && (
            <div className="my-4 p-2 bg-yellow-100 border border-yellow-300 rounded text-center">
              <p className="text-sm text-yellow-700 mb-2">
                Funcionalidad de prueba:
              </p>
              <Example
                onClick={handleLogoutForTesting}
                className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded text-xs"
              >
                Cerrar Sesión (Limpiar Validación)
              </Example>
            </div>
          )}

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
                  {isLoadingHistory
                    ? "Cargando..."
                    : "Ver notificaciones pasadas"}
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
            <div className="space-y-0">
              {" "}
              {/* Ajusta space-y si es necesario, AccordionItem ya tiene mb-2 */}
              <TailwindAccordion
                items={accordionSections}
                allowMultipleOpen={true} // Opcional: permite abrir múltiples items
                // defaultOpenId="system-info" // Opcional: abre un item por defecto
              />
            </div>
          )}

          {/* MODAL PARA EL HISTORIAL DE NOTIFICACIONES */}
          {isHistoryModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white p-5 rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">
                    Historial de Notificaciones
                  </h2>
                  <button
                    onClick={() => setIsHistoryModalOpen(false)}
                    className="text-gray-500 hover:text-gray-700 text-2xl"
                    aria-label="Cerrar modal"
                  >
                    &times;
                  </button>
                </div>
                <div className="overflow-y-auto flex-grow">
                  {isLoadingHistory && (
                    <p className="text-center">Cargando historial...</p>
                  )}
                  {!isLoadingHistory && historyError && (
                    <p className="text-center text-red-500">{historyError}</p>
                  )}
                  {!isLoadingHistory &&
                    !historyError &&
                    notificationHistory.length === 0 && (
                      <p className="text-center text-gray-500">
                        No hay notificaciones pasadas.
                      </p>
                    )}
                  {!isLoadingHistory &&
                    !historyError &&
                    notificationHistory.length > 0 && (
                      <ul className="space-y-3">
                        {notificationHistory.map((item) => (
                          <li
                            key={item.ticketId}
                            className="p-3 bg-gray-100 rounded-md shadow-sm"
                          >
                            <p className="font-semibold text-sm">
                              Ticket:{" "}
                              <span className="font-normal">
                                {item.ticketId}
                              </span>
                            </p>
                            <p className="text-sm mt-1">
                              Mensaje:{" "}
                              <span className="font-normal">
                                {item.mensaje}
                              </span>
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                </div>
                {/* Contenedor para los botones del pie del modal */}
                <div className="mt-4 flex flex-col sm:flex-row sm:justify-end sm:space-x-3 space-y-2 sm:space-y-0">
                  {/* Botón para Marcar como Atendido */}
                  {/* Solo se muestra si hay historial y al menos un elemento */}
                  {notificationHistory.length > 0 && notificationHistory[0] && (
                    <button
                      onClick={async () => {
                        // Convertir a async para usar await si acknowledgeNotification devuelve una promesa que indica éxito
                        const ticketIdToAcknowledge =
                          notificationHistory[0].ticketId;
                        try {
                          // Llama a acknowledgeNotification. Asumimos que devuelve una promesa
                          // y que podemos saber si fue exitosa para proceder a actualizar el UI.
                          // Si acknowledgeNotification ya maneja el toast, no necesitamos repetirlo aquí.
                          // Modificaremos acknowledgeNotification para que devuelva un booleano o lance error.

                          // Para este ejemplo, asumiremos que acknowledgeNotification
                          // se ejecutará y si no lanza error, fue "exitoso" para el UI.
                          // Lo ideal sería que acknowledgeNotification devuelva un booleano.
                          await acknowledgeNotification(ticketIdToAcknowledge);

                          // Si la llamada a acknowledgeNotification fue exitosa (no lanzó error),
                          // actualiza el estado para remover el ítem del historial.
                          setNotificationHistory((prevHistory) =>
                            prevHistory.filter(
                              (item) => item.ticketId !== ticketIdToAcknowledge
                            )
                          );

                          // Opcional: Si la lista queda vacía después de remover, podrías cerrar el modal.
                          if (notificationHistory.length === 1) {
                            // Si solo había un elemento y se removió
                            // setIsHistoryModalOpen(false); // Descomentar si quieres este comportamiento
                          }
                        } catch (error) {
                          // El error ya debería ser manejado y mostrado por un toast dentro de acknowledgeNotification
                          console.error(
                            "Error al intentar marcar como atendido desde el modal:",
                            error
                          );
                        }
                      }}
                      className="w-full sm:w-auto bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded-lg"
                      title={`Marcar ticket ${notificationHistory[0].ticketId} como atendido`}
                    >
                      Marcar como Atendido
                    </button>
                  )}
                  {/* Botón Cerrar existente */}
                  <button
                    onClick={() => setIsHistoryModalOpen(false)}
                    className="w-full sm:w-auto bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div> // Cierre del div principal de la app
      )}
    </>
  );
}

export default App;
