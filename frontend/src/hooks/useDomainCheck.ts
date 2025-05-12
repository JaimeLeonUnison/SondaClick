import { useState, useEffect } from 'react';

interface UserDetailsResponse { // Asegúrate que esta interfaz coincida con tu API
  success: boolean;
  userDetails?: {
    isDomain?: boolean;
    domain?: string;
    // ... otros campos que puedas necesitar
  };
  message?: string;
}

export const useDomainCheck = () => {
  const [isInDomain, setIsInDomain] = useState<boolean>(false); // Estado inicial importante
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [domainName, setDomainName] = useState<string | null>(null); // Opcional, si quieres el nombre

  useEffect(() => {
    const checkDomain = async () => {
      console.log("[useDomainCheck] Iniciando la comprobación del estado del dominio.");
      setIsLoading(true); // Asegurar que se establece al inicio

      try {
        // Asegúrate que la URL es la correcta y es absoluta
        const apiUrl = 'http://localhost:5000/api/user-details';
        console.log(`[useDomainCheck] Haciendo fetch a: ${apiUrl}`);
        const response = await fetch(apiUrl);
        
        console.log(`[useDomainCheck] Respuesta recibida de ${apiUrl}, status: ${response.status}`);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[useDomainCheck] Error HTTP ${response.status} de ${apiUrl}: ${errorText}`);
          throw new Error(`Error HTTP: ${response.status} - ${errorText}`);
        }

        const data: UserDetailsResponse = await response.json();
        console.log("[useDomainCheck] Datos JSON recibidos:", JSON.stringify(data, null, 2));

        if (data.success && data.userDetails) {
          const domainStatus = data.userDetails.isDomain || false; // Default a false si es undefined
          const currentDomain = data.userDetails.domain || null;
          console.log(`[useDomainCheck] API reporta isDomain: ${domainStatus}, domain: ${currentDomain}`);
          setIsInDomain(domainStatus);
          setDomainName(currentDomain);
        } else {
          console.warn("[useDomainCheck] La respuesta de la API no fue exitosa o no contenía userDetails:", data.message);
          setIsInDomain(false); // Asumir no en dominio si la respuesta no es como se espera
        }
      } catch (error) {
        console.error("[useDomainCheck] Excepción durante fetch o procesamiento:", error);
        setIsInDomain(false); // En caso de cualquier error, asumir que no está en dominio
      } finally {
        setIsLoading(false);
        console.log("[useDomainCheck] Comprobación del dominio finalizada.");
        // OJO: Los siguientes logs mostrarán el estado ANTES de la re-renderización por los setters.
        // Para ver el estado actualizado, necesitas un log en el cuerpo del hook o en App.tsx.
        // console.log("[useDomainCheck] Estado final (antes de re-render): isLoading:", isLoading, "isInDomain:", isInDomain);
      }
    };

    checkDomain();
  }, []); // Array de dependencias vacío para que se ejecute solo una vez al montar

  // Loguear los valores que el hook va a retornar (se logueará en cada re-render del componente que lo usa)
  console.log("[useDomainCheck] Retornando - isLoading:", isLoading, "isInDomain:", isInDomain, "domainName:", domainName);
  return { isInDomain, isLoading, domainName };
};