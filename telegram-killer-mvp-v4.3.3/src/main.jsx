/**
 * Main Entry Point
 * Sets up React, Wagmi, and Query Client
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from './config';
import App from './App';

if (import.meta.env.PROD && typeof window !== 'undefined') {
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (!isLocalhost && window.location.protocol !== 'https:') {
    window.location.replace(
      `https://${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`,
    );
  }
}

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
