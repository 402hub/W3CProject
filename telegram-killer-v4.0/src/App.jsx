/**
 * Main App Component
 * Local-First Messaging with IndexedDB
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
      setWalletConnected(address);
      
      // Auto-initialize database if not already done
      if (!isDbInitialized && !isInitializing) {
        initializeDatabase();
      }
    } else if (!isConnected) {
      console.log('❌ Wallet disconnected');
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
          <h1>⚡ Telegram Killer v4.0</h1>
          <span className="version-badge">Local-First Edition</span>
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
              <h2>Welcome to Telegram Killer v4.0</h2>
              <p className="subtitle">Local-First Messaging</p>
              <p className="description">
                Fast, reliable messaging with wallet-based authentication.
                Messages stored locally with instant delivery.
                P2P sync coming in Phase 2!
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
