import { useState, useEffect } from 'react';

export function useDomainCheck() {
  const [isInDomain, setIsInDomain] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkDomain() {
      try {
        setIsLoading(true);
        const response = await fetch('http://localhost:5000/api/check-domain');
        
        if (!response.ok) {
          throw new Error('Error al verificar el dominio');
        }
        
        const data = await response.json();
        setIsInDomain(data.isInDomain);
      } catch (err) {
        console.error('Error:', err);
        setError(err instanceof Error ? err.message : 'Error desconocido');
        setIsInDomain(false); // Predeterminado a false en caso de error
      } finally {
        setIsLoading(false);
      }
    }

    checkDomain();
  }, []);

  return { isInDomain, isLoading, error };
}