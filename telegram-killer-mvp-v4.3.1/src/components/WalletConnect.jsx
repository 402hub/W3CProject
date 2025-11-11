/**
 * WalletConnect Component
 * Handles wallet connection with multiple options (MetaMask, WalletConnect, Coinbase)
 */

import React from 'react';
import { useConnect, useAccount } from 'wagmi';

function WalletConnect() {
  const { connectors, connect, isPending, error } = useConnect();
  const { isConnected } = useAccount();

  if (isConnected) {
    return null;
  }

  return (
    <div className="wallet-connect">
      <div className="connector-options">
        {connectors.map((connector) => (
          <button
            key={connector.id}
            onClick={() => connect({ connector })}
            disabled={isPending}
            className="connector-button"
          >
            {connector.name}
          </button>
        ))}
      </div>
      
      {isPending && <p className="connecting-text">Connecting...</p>}
      
      {error && (
        <div className="error-message">
          Error: {error.message}
        </div>
      )}
      
      <p className="hint-text">
        Choose your wallet to connect. Mobile users can use WalletConnect to connect with any mobile wallet app.
      </p>
    </div>
  );
}

export default WalletConnect;
