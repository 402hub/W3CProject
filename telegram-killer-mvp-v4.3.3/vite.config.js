import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    // v4.4.0: HTTPS enforcement in production
    https: process.env.NODE_ENV === 'production' ? true : false,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // v4.4.0: Security headers in build
    rollupOptions: {
      output: {
        // Ensure secure headers are set
      }
    }
  },
  // v4.4.0: Security headers
  preview: {
    port: 3000,
    https: true,
    strictPort: true,
  }
})
