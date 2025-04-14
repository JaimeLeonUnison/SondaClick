import React, { useState, useRef } from "react";
import PasswordChangeModal from "./PasswordChangeModal";

interface PasswordChangeButtonProps {
  changePassword?: (
    username: string,
    oldPassword: string,
    newPassword: string
  ) => Promise<string>;
  buttonText?: string;
  className?: string;
  disabled?: boolean;
  useNativeDialog?: boolean;
  onNativeDialogClick?: () => Promise<void>;
}

const PasswordChangeButton: React.FC<PasswordChangeButtonProps> = ({
  changePassword,
  buttonText = "Cambiar contraseña",
  className = "",
  disabled = false,
  useNativeDialog = false,
  onNativeDialogClick,
}) => {
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const buttonRef = useRef<HTMLAnchorElement>(null);

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  const handleClick = async () => {
    if (disabled) return;
    
    if (useNativeDialog && onNativeDialogClick) {
      await onNativeDialogClick();
    } else {
      openModal();
    }
  };

  return (
    <div className="relative">
      <a
        ref={buttonRef}
        onClick={handleClick}
        className={`
          group relative inline-flex items-center overflow-hidden 
          rounded-sm bg-indigo-600 
          px-4 sm:px-6 md:px-8 
          py-2 sm:py-3 
          text-white focus:ring-3 focus:outline-hidden 
          m-2 sm:m-3 md:m-4
          transition-all duration-200
          ${disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-indigo-700"}
          ${className}
        `}
        href="#"
        role="button"
        aria-disabled={disabled}
      >
        {/* Ícono que se muestra en hover */}
        <span className="absolute -start-full transition-all group-hover:start-4 hidden sm:block">
          <svg
            className="size-4 sm:size-5 shadow-sm rtl:rotate-180"
            xmlns="http://www.w3.org/2000/svg"
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
        </span>

        {/* Texto del botón */}
        <span className="text-xs sm:text-sm font-medium transition-all group-hover:ms-0 sm:group-hover:ms-4">
          {buttonText}
        </span>
      </a>

      {!useNativeDialog && changePassword && (
        <PasswordChangeModal
          changePassword={changePassword}
          isOpen={isModalOpen}
          onClose={closeModal}
        />
      )}
    </div>
  );
};

export default PasswordChangeButton;