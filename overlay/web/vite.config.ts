import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  plugins: [react()],
  // Two pages from one bundle: the pet and the "Hablar" chat. Relative to the root (overlay/web).
  build: { rollupOptions: { input: { main: 'index.html', chat: 'chat.html' } } },
})
