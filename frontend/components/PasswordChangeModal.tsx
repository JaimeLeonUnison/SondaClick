import React, { useState, useEffect, useRef } from "react";

interface PasswordChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  changePassword?: (
    username: string,
    oldPassword: string,
    newPassword: string
  ) => Promise<string>;
  passwordInfo?: {
    passwordLastSet: string;
    passwordExpires: string;
    userMayChangePassword: string;
  } | null;
  userDomain?: string;
  loading?: boolean;
}

interface PasswordExpirationInfo {
  expires: boolean | null;
  daysRemaining?: number;
  expiryDate?: string;
  message: string;
}

const PasswordChangeModal: React.FC<PasswordChangeModalProps> = ({
  isOpen,
  onClose,
  passwordInfo,
  userDomain,
  loading = false
}) => {
  const [expirationInfo, setExpirationInfo] = useState<PasswordExpirationInfo | null>(null);
  const [error, setError] = useState<string>("");
  const [isDomainUser, setIsDomainUser] = useState<boolean>(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Cerrar al hacer clic fuera del modal
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Configurar información de dominio y expiración
  useEffect(() => {
    if (isOpen) {
      // Determinar si es usuario de dominio
      setIsDomainUser(!!userDomain && userDomain !== "Windows" && userDomain !== "Local");
      
      // Crear información de expiración a partir de passwordInfo
      if (passwordInfo) {
        try {
          const expiryDate = passwordInfo.passwordExpires;
          let daysRemaining: number | undefined = undefined;
          
          // Intentar calcular días restantes si tiene formato de fecha
          try {
            const expDate = new Date(expiryDate);
            const today = new Date();
            const diffTime = expDate.getTime() - today.getTime();
            daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          } catch (e) {
            console.error("Error calculando días restantes", e);
          }
          
          // Generar mensaje adecuado
          let message = "";
          if (daysRemaining !== undefined) {
            if (daysRemaining <= 0) {
              message = "Tu contraseña ha expirado. Debes cambiarla ahora.";
            } else if (daysRemaining <= 5) {
              message = `Tu contraseña expirará pronto (en ${daysRemaining} días).`;
            } else {
              message = `Tu contraseña expirará en ${daysRemaining} días.`;
            }
          } else {
            message = `Fecha de expiración: ${expiryDate}`;
          }
          
          setExpirationInfo({
            expires: true,
            daysRemaining,
            expiryDate,
            message
          });
        } catch (error) {
          console.error("Error procesando información de contraseña:", error);
          setError("No se pudo procesar la información de expiración");
        }
      }
    }
  }, [isOpen, passwordInfo, userDomain]);

  if (!isOpen) return null;

  return (
    <div className="absolute top-full right-0 mt-2 z-50">
      <div
        ref={modalRef}
        className="relative inline-block px-4 pt-5 pb-4 overflow-hidden text-left transition-all transform bg-white rounded-lg shadow-xl sm:max-w-sm sm:w-full sm:p-6"
        style={{
          animation: "card-popup 0.3s ease-out forwards",
          transformOrigin: "top right",
        }}
      >
        <div>
          <div className="flex items-center justify-center">
            <div className="flex items-center justify-center flex-shrink-0 w-12 h-12 mx-auto bg-indigo-100 rounded-full">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-6 h-6 text-indigo-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
          </div>

          <div className="mt-3 text-center">
            <h3
              className="text-lg font-medium leading-6 text-gray-800"
              id="modal-title"
            >
              Información de contraseña
            </h3>

            {/* Información de tipo de cuenta */}
            <div className="mt-1 text-sm text-gray-500">
              {userDomain ? `Dominio: ${userDomain}` : "Cuenta local"}
            </div>

            {/* Información detallada de la contraseña */}
            {loading ? (
              <div className="mt-4 text-center">
                <svg className="animate-spin h-5 w-5 mx-auto text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="mt-2 text-sm text-gray-500">Cargando información...</p>
              </div>
            ) : error ? (
              <div className="mt-4 bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded text-sm">
                {error}
              </div>
            ) : passwordInfo ? (
              <div className="mt-4 bg-white border border-gray-200 rounded-md p-4">
                <div className="space-y-3 text-sm text-left">
                  <div className="grid grid-cols-2 gap-x-2 items-center">
                    <div className="text-gray-600 font-medium">Último cambio:</div>
                    <div>{passwordInfo.passwordLastSet}</div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-x-2 items-center">
                    <div className="text-gray-600 font-medium">Expira el:</div>
                    <div>{passwordInfo.passwordExpires}</div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-x-2 items-center">
                    <div className="text-gray-600 font-medium">Puede cambiar:</div>
                    <div>{passwordInfo.userMayChangePassword}</div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Estado de expiración */}
            {expirationInfo && (
              <div className={`mt-4 p-3 rounded-md text-sm ${
                expirationInfo.expires && expirationInfo.daysRemaining !== undefined && expirationInfo.daysRemaining <= 5 
                  ? 'bg-red-100 text-red-800 border border-red-200' 
                  : 'bg-blue-50 text-blue-800 border border-blue-100'
              }`}>
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    {expirationInfo.expires && expirationInfo.daysRemaining !== undefined && expirationInfo.daysRemaining <= 5 ? (
                      <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <div className="ml-3 text-left">
                    <p className="font-medium">{expirationInfo.message}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Instrucciones para cambiar la contraseña */}
            <div className="mt-5 text-left">
              <h4 className="font-medium text-gray-700 mb-2">Cómo cambiar tu contraseña:</h4>
              
              {isDomainUser ? (
                <ol className="text-sm text-gray-600 space-y-2 list-decimal pl-5">
                  <li>Presiona <strong>Ctrl+Alt+Supr</strong> en tu teclado</li>
                  <li>Selecciona la opción <strong>"Cambiar una contraseña"</strong></li>
                  <li>Ingresa tu contraseña actual</li>
                  <li>Ingresa y confirma tu nueva contraseña</li>
                  <li>Presiona <strong>Entrar</strong> para confirmar</li>
                </ol>
              ) : (
                <ol className="text-sm text-gray-600 space-y-2 list-decimal pl-5">
                  <li>Abre el Panel de Control de Windows</li>
                  <li>Selecciona <strong>"Cuentas de usuario"</strong></li>
                  <li>Haz clic en <strong>"Cambiar contraseña"</strong></li>
                  <li>Ingresa tu contraseña actual</li>
                  <li>Ingresa y confirma tu nueva contraseña</li>
                  <li>Haz clic en <strong>"Cambiar contraseña"</strong> para confirmar</li>
                </ol>
              )}
              
              <div className="bg-yellow-50 border border-yellow-100 p-3 rounded-md mt-4 text-sm text-yellow-800">
                <p className="flex items-start">
                  <svg className="h-5 w-5 text-yellow-400 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9z" clipRule="evenodd" />
                  </svg>
                  <span>
                    <strong>Recomendaciones para tu nueva contraseña:</strong>
                    <ul className="mt-1 list-disc pl-5">
                      <li>Al menos 8 caracteres</li>
                      <li>Combina letras mayúsculas y minúsculas</li>
                      <li>Incluye números y caracteres especiales</li>
                      <li>Evita usar información personal</li>
                      <li>No reutilices contraseñas anteriores</li>
                    </ul>
                  </span>
                </p>
              </div>
            </div>

            {/* Botón para cerrar */}
            <div className="mt-6">
              <button
                type="button"
                onClick={onClose}
                className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PasswordChangeModal;