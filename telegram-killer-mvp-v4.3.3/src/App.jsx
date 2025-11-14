/**
 * Main App Component
 * Local-First Messaging with IndexedDB
 * v4.1: UI Polish Edition with timestamps, badges, and status indicators
 */

import React, { useEffect, useState } from 'react';
import { useAccount, useDisconnect } from 'wagmi';
import { useAppStore } from './store/appStore';
import { messageService } from './services/database';
import WalletConnect from './components/WalletConnect';
import ConversationList from './components/ConversationList';
import ChatArea from './components/ChatArea';
import './App.css';

function App() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  
  const {
    isDbInitialized,
    dbError,
    status,
    isLoading,
    setWalletConnected,
    setWalletDisconnected,
    setDbInitialized,
    setDbError,
    setLoading,
    setStatus,
  } = useAppStore();

  const [isInitializing, setIsInitializing] = useState(false);

  // Handle wallet connection
  useEffect(() => {
    if (isConnected && address) {
      console.log('✅ Wallet connected:', address);
      
      // Check if this is a different wallet
      const isDifferentWallet = isDbInitialized && address.toLowerCase() !== messageService.getAddress();
      
      if (isDifferentWallet) {
        console.log('🔄 Different wallet detected, cleaning up...');
        // Cleanup old wallet data
        messageService.cleanup();
        setWalletDisconnected();
        // Re-initialize with new wallet
        setWalletConnected(address);
        initializeDatabase();
      } else {
        setWalletConnected(address);
        
        // Auto-initialize database if not already done
        if (!isDbInitialized && !isInitializing) {
          initializeDatabase();
        }
      }
    } else if (!isConnected) {
      console.log('❌ Wallet disconnected');
      // Cleanup database service
      if (messageService.isReady()) {
        messageService.cleanup();
      }
      setWalletDisconnected();
    }
  }, [isConnected, address, isDbInitialized]);

  /**
   * Initialize Local Database (IndexedDB)
   */
  const initializeDatabase = async () => {
    if (isInitializing || isDbInitialized) {
      console.log('⏭️ Database initialization already in progress or complete');
      return;
    }

    setIsInitializing(true);
    setLoading(true);
    setStatus('Initializing local storage...');

    try {
      console.log('💾 [APP] Starting database initialization...');
      
      // Initialize database with wallet address
      const db = messageService.initialize(address);
      
      console.log('✅ [APP] Database initialized successfully!');
      setDbInitialized(db);
      
    } catch (error) {
      console.error('❌ [APP] Database initialization failed:', error);
      setDbError(error);
      setStatus(`Failed to initialize storage: ${error.message}`);
    } finally {
      setIsInitializing(false);
      setLoading(false);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setWalletDisconnected();
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>⚡ Tello</h1>
          <span className="version-badge">v4.4.0</span>
        </div>
        
        {isConnected && (
          <div className="header-right">
            <span className="wallet-address">
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </span>
            <button onClick={handleDisconnect} className="disconnect-btn">
              Disconnect
            </button>
          </div>
        )}
      </header>

      <div className="status-bar">
        <div className="status-indicator">
          {isLoading && <div className="spinner"></div>}
          <span>{status}</span>
        </div>
        
        {dbError && (
          <div className="error-banner">
            <strong>Error:</strong> {dbError.message}
          </div>
        )}
      </div>

      <main className="app-main">
        {!isConnected ? (
          <div className="welcome-screen">
            <div className="welcome-content">
              <h2>Welcome to Tello v4.4.0</h2>
              <p className="subtitle">🚀 Performance & Security Foundation</p>
              <div className="features-list">
                <div className="feature">⚡ Message pagination (70 at a time)</div>
                <div className="feature">📋 Conversation lazy loading (20 at a time)</div>
                <div className="feature">🔒 XSS prevention & input sanitization</div>
                <div className="feature">🛡️ Rate limiting (60 messages/minute)</div>
                <div className="feature">✅ Message validation (1000 char limit)</div>
                <div className="feature">🔐 Production security rules</div>
                <div className="feature">📊 Firebase indexes (10-100x faster)</div>
                <div className="feature">🌐 HTTPS enforcement & CSP headers</div>
              </div>
              <p className="description">
                Production-ready messaging with performance optimizations and security hardening.
                Ready to scale to millions of messages!
              </p>
              <WalletConnect />
            </div>
          </div>
        ) : isDbInitialized ? (
          <div className="chat-container">
            <ConversationList />
            <ChatArea />
          </div>
        ) : (
          <div className="initializing-screen">
            <div className="initializing-content">
              <h2>Setting up local storage...</h2>
              <p>Initializing your secure local database</p>
              <div className="spinner-large"></div>
              {!isInitializing && (
                <button onClick={initializeDatabase} className="retry-btn">
                  Retry Initialization
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Debug Panel */}
      {process.env.NODE_ENV === 'development' && (
        <div className="debug-panel">
          <strong>Debug Info:</strong>
          <div>Wallet: {isConnected ? '✅' : '❌'}</div>
          <div>Database: {isDbInitialized ? '✅' : '❌'}</div>
          <div>Initializing: {isInitializing ? '🔄' : '⏸️'}</div>
        </div>
      )}
    </div>
  );
}

export default App;
