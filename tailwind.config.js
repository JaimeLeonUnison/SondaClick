/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html", // Si tienes un index.html en la raíz del frontend
    "./src/**/*.{js,ts,jsx,tsx}", // Para todos los archivos JS/TS/JSX/TSX en tu carpeta src
    "./components/**/*.{js,ts,jsx,tsx}", // Si tienes una carpeta de componentes separada
  ],
  darkMode: 'class', // O 'media', según tu preferencia para el modo oscuro
  theme: {
    extend: {
      // Aquí es donde añadirías tus personalizaciones de fuentes, animaciones, etc.
      fontFamily: {
        sans: ['Roboto', 'ui-sans-serif', 'system-ui', /* ...otros fallbacks */],
      },
      keyframes: {
        'card-popup': {
          '0%': {
            opacity: '0',
            transform: 'scale(0.95) translateY(-10px)',
          },
          '100%': {
            opacity: '1',
            transform: 'scale(1) translateY(0)',
          },
        },
      },
      animation: {
        'card-popup': 'card-popup 0.5s ease-out forwards',
      },
    },
  },
  plugins: [
    // Aquí puedes añadir plugins de Tailwind si los necesitas
  ],
}