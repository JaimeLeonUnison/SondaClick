// src/components/Example.tsx
import React from "react";

interface ExampleProps {
  onClick: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

const Example: React.FC<ExampleProps> = ({ onClick, children, className = "", disabled = false }) => {
  return (
    <a
      onClick={disabled ? undefined : onClick}
      className={`
        group relative inline-flex items-center overflow-hidden 
        rounded-sm bg-indigo-600 
        px-4 sm:px-6 md:px-8 
        py-2 sm:py-3 
        text-white focus:ring-3 focus:outline-hidden 
        m-2 sm:m-3 md:m-4
        transition-all duration-200
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-700'}
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
            d="M17 8l4 4m0 0l-4 4m4-4H3"
          />
        </svg>
      </span>

      {/* Texto del botón */}
      <span className="text-xs sm:text-sm font-medium transition-all group-hover:ms-0 sm:group-hover:ms-4">
        {children}
      </span>
    </a>
  );
};

export default Example;