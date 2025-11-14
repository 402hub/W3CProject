import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com ws://localhost:3000 wss://*.firebaseio.com; img-src 'self' data:; font-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    headers: securityHeaders,
  },
  preview: {
    headers: securityHeaders,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
