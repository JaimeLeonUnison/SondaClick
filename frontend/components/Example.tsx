// src/components/Example.tsx
import React from "react";

interface ExampleProps {
  onClick: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  children: React.ReactNode;
}

const Example: React.FC<ExampleProps> = ({ onClick, children }) => {
  return (
    <a
      onClick={onClick}
      className="group relative inline-flex items-center overflow-hidden rounded-sm bg-indigo-600 px-8 py-3 text-white focus:ring-3 focus:outline-hidden m-4"
      href="#"
    >
      {/* Si tienes un ícono, puedes agregarlo aquí */}
      <span className="absolute -start-full transition-all group-hover:start-4">
        <svg
          className="size-5 shadow-sm rtl:rotate-180"
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

      {/* Aquí mostramos el contenido dinámico de children */}
      <span className="text-sm font-medium transition-all group-hover:ms-4">{children}</span>
    </a>
  );
};

export default Example;