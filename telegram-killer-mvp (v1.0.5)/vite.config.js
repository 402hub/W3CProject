// vite.config.js - Optimized build configuration
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Enable polyfills for specific globals and modules
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Telegram Killer - Web3 Messaging',
        short_name: 'TG Killer',
        description: 'Faster than Telegram - Web3 messaging with E2E encryption',
        theme_color: '#5682a3',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.ipfs\.(io|dweb\.link)/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ipfs-cache',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/cloudflare-ipfs\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ipfs-cloudflare-cache',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 30 * 24 * 60 * 60
              }
            }
          }
        ]
      }
    })
  ],
  
  // Build optimizations
  build: {
    target: 'esnext',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console logs in production
        drop_debugger: true
      }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-wagmi': ['wagmi', 'viem'],
          'vendor-xmtp': ['@xmtp/xmtp-js'],
          'vendor-db': ['dexie', 'idb']
        }
      }
    },
    chunkSizeWarningLimit: 1000
  },
  
  // Dev server optimizations
  server: {
    port: 3000,
    open: true,
    cors: true,
    headers: {
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  },
  
  // Optimization for faster builds
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'wagmi',
      'viem',
      '@xmtp/xmtp-js',
      'ethers',
      'dexie',
      'react-hot-toast'
    ],
    exclude: ['@xmtp/browser-sdk']
  },
  
  // Performance
  esbuild: {
    logOverride: { 'this-is-undefined-in-esm': 'silent' }
  }
});
