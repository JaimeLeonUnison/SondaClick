import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import tailwindcssPlugin from '@tailwindcss/postcss'
import autoprefixer from 'autoprefixer'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      renderer: process.env.NODE_ENV === 'test'
        ? undefined
        : {},
    }),
  ],
  css: {
    postcss: {
      plugins: [
        tailwindcssPlugin,
        autoprefixer,
      ],
    },
  },
})