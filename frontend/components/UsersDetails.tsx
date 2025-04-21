import React, { useEffect, useState } from 'react';

interface UserDetails {
  isDomain: boolean;
  domain: string;
  username: string;
  fullName?: string;
  accountActive?: string;
  accountExpires?: string;
  passwordLastSet?: string;
  passwordExpires?: string;
  passwordChangeable?: string;
  passwordRequired?: string;
  userMayChangePassword?: string;
  lastLogon?: string;
  workstationsAllowed?: string;
  logonScript?: string;
  userProfile?: string;
  homeDirectory?: string;
  logonHoursAllowed?: string;
  groups?: string[];
  passwordExpiresInDays?: number | null;
  passwordStatus?: 'expired' | 'warning' | 'ok' | 'neverExpires';
}

interface UserDetailsPanelProps {
  onChangePasswordClick: () => void;
}

const UserDetailsPanel: React.FC<UserDetailsPanelProps> = ({ onChangePasswordClick }) => {
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserDetails = async () => {
      try {
        setLoading(true);
        const response = await fetch('http://localhost:5000/api/user-details');
        
        if (!response.ok) {
          throw new Error(`Error HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.success) {
          setUserDetails(data.userDetails);
          setError(null);
        } else {
          throw new Error(data.message || 'Error desconocido');
        }
      } catch (err) {
        console.error('Error al obtener detalles del usuario:', err);
        setError('No se pudieron cargar los detalles del usuario.');
      } finally {
        setLoading(false);
      }
    };

    fetchUserDetails();
  }, []);

  const getPasswordStatusColor = () => {
    if (!userDetails?.passwordStatus) return 'text-gray-500';
    
    switch (userDetails.passwordStatus) {
      case 'expired':
        return 'text-red-600 font-bold';
      case 'warning':
        return 'text-amber-500 font-bold';
      case 'ok':
        return 'text-green-600 font-bold';
      case 'neverExpires':
        return 'text-blue-600';
      default:
        return 'text-gray-500';
    }
  };

  const getPasswordMessage = () => {
    if (!userDetails) return '';
    
    if (userDetails.passwordStatus === 'neverExpires') {
      return 'Tu contraseña nunca expira.';
    }
    
    if (userDetails.passwordExpiresInDays === null) {
      return 'No se pudo determinar cuando expira tu contraseña.';
    }
    
    if (userDetails.passwordExpiresInDays !== undefined && userDetails.passwordExpiresInDays < 0) {
      return '¡Tu contraseña ha expirado! Debes cambiarla inmediatamente.';
    }
    
    if (userDetails.passwordExpiresInDays === 0) {
      return '¡Tu contraseña expira hoy!';
    }
    
    if (userDetails.passwordExpiresInDays === 1) {
      return '¡Tu contraseña expira mañana!';
    }
    
    return `Tu contraseña expira en ${userDetails.passwordExpiresInDays} días (${userDetails.passwordExpires}).`;
  };

  if (loading) {
    return (
      <div className="bg-white p-4 rounded-lg shadow-sm">
        <p className="text-center text-gray-500">Cargando detalles del usuario...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-orange-50 border border-orange-200 p-4 rounded-lg">
        <p className="text-orange-800 font-semibold">Información de cuenta</p>
        <p className="text-orange-700">{error}</p>
        <button
          onClick={onChangePasswordClick}
          className="mt-3 bg-orange-600 hover:bg-orange-700 text-white py-1 px-3 rounded text-sm transition-colors"
        >
          Cambiar contraseña
        </button>
      </div>
    );
  }

  if (!userDetails) {
    return null;
  }

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Detalles de la cuenta</h2>
        <span className={`px-2 py-1 rounded text-sm ${userDetails.isDomain ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
          {userDetails.isDomain ? `Usuario de dominio (${userDetails.domain})` : 'Usuario local'}
        </span>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h3 className="font-semibold text-gray-700 mb-2">Información de usuario</h3>
          <div className="space-y-2">
            <p><span className="font-medium">Usuario:</span> {userDetails.username}</p>
            {userDetails.fullName && <p><span className="font-medium">Nombre completo:</span> {userDetails.fullName}</p>}
            {userDetails.accountActive && <p><span className="font-medium">Cuenta activa:</span> {userDetails.accountActive}</p>}
            {userDetails.accountExpires && <p><span className="font-medium">La cuenta expira:</span> {userDetails.accountExpires}</p>}
            {userDetails.lastLogon && <p><span className="font-medium">Último inicio de sesión:</span> {userDetails.lastLogon}</p>}
          </div>
        </div>
        
        <div>
          <h3 className="font-semibold text-gray-700 mb-2">Información de contraseña</h3>
          <div className="space-y-2">
            {userDetails.passwordLastSet && <p><span className="font-medium">Último cambio:</span> {userDetails.passwordLastSet}</p>}
            
            <div className="flex items-center">
              <span className="font-medium mr-1">Estado:</span>
              <span className={getPasswordStatusColor()}>
                {getPasswordMessage()}
              </span>
            </div>
            
            {userDetails.passwordExpires && <p><span className="font-medium">Expira el:</span> {userDetails.passwordExpires}</p>}
            {userDetails.passwordChangeable && <p><span className="font-medium">Cambio disponible desde:</span> {userDetails.passwordChangeable}</p>}
            {userDetails.passwordRequired && <p><span className="font-medium">Contraseña requerida:</span> {userDetails.passwordRequired}</p>}
            {userDetails.userMayChangePassword && <p><span className="font-medium">Puede cambiar contraseña:</span> {userDetails.userMayChangePassword}</p>}
          </div>
        </div>
      </div>
      
      {userDetails.isDomain && (
        <div className="mt-4">
          <h3 className="font-semibold text-gray-700 mb-2">Información de dominio</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              {userDetails.workstationsAllowed && <p><span className="font-medium">Estaciones permitidas:</span> {userDetails.workstationsAllowed}</p>}
              {userDetails.logonHoursAllowed && <p><span className="font-medium">Horas de inicio permitidas:</span> {userDetails.logonHoursAllowed}</p>}
            </div>
            <div>
              {userDetails.logonScript && <p><span className="font-medium">Script de inicio:</span> {userDetails.logonScript}</p>}
              {userDetails.userProfile && <p><span className="font-medium">Perfil de usuario:</span> {userDetails.userProfile}</p>}
              {userDetails.homeDirectory && <p><span className="font-medium">Directorio principal:</span> {userDetails.homeDirectory}</p>}
            </div>
          </div>
        </div>
      )}
      
      {userDetails.groups && userDetails.groups.length > 0 && (
        <div className="mt-4">
          <h3 className="font-semibold text-gray-700 mb-2">Membresías de grupo</h3>
          <div className="flex flex-wrap gap-2">
            {userDetails.groups.map((group, index) => (
              <span key={index} className="px-2 py-1 bg-gray-100 rounded text-sm">
                {group}
              </span>
            ))}
          </div>
        </div>
      )}
      
      <div className="mt-6">
        <button
          onClick={onChangePasswordClick}
          className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded transition-colors"
        >
          Cambiar contraseña
        </button>
      </div>
    </div>
  );
};

export default UserDetailsPanel;