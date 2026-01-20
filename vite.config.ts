import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Important for Electron - use relative paths
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    // Vercel dev will assign the port, or use 5173 as fallback
    port: process.env.PORT ? parseInt(process.env.PORT) : 5173,
    strictPort: false, // Allow Vercel to assign port
    host: true, // Listen on all network interfaces
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
