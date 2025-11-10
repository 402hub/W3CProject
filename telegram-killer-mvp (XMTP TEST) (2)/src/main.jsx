// main.jsx - Application Entry Point
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './App.css';

// Register service worker for offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(registration => {
        console.log('✅ Service Worker registered:', registration.scope);
      })
      .catch(error => {
        console.error('❌ Service Worker registration failed:', error);
      });
  });
}

// Performance monitoring
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    const perfData = performance.getEntriesByType('navigation')[0];
    console.log('⚡ Page load time:', perfData.loadEventEnd - perfData.fetchStart, 'ms');
  });
}

// Mount React app
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Log startup message
console.log(`
  ⚡ TELEGRAM KILLER - MVP
  ========================
  • Lightning fast messaging
  • End-to-end encrypted
  • Offline support
  • Web3 native
  • Crypto payments
  
  Built with: XMTP + IPFS + IndexedDB
  Target: Faster than Telegram!
`);
